import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fiscalDeviceWhere } from "@/lib/accounting/fiscal-device-scope";
import {
  buildCertificateBundle,
  buildCertificateSigningRequest,
  generateDeviceKeypair,
  getDeviceConfig,
  registerDevice,
} from "@/lib/accounting/fdms-device";
import { applyZimraTaxMapping } from "@/lib/accounting/zimra-tax-mapping";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { requireOnSharedRoute } from "@/lib/retail/permissions";

const schema = z.object({
  /** Issued by ZIMRA with the device id. Single-use. */
  activationKey: z.string().trim().min(1).max(64),
  /** The serial number ZIMRA issued the device under — the CSR's common name. */
  serialNumber: z.string().trim().min(1).max(64),
});

/**
 * Register the company's fiscal device with ZIMRA.
 *
 * `registerDevice` in `lib/accounting/fdms-device.ts` has existed since FD-2
 * and nothing called it, so no device could ever get the certificate and key
 * a receipt is signed with: every till sale reached `issueFiscalDocument` and
 * stopped at "register the device before issuing fiscal documents".
 *
 * A keypair is made here, the certificate signing request goes to FDMS with
 * the activation key, and the signed certificate comes back into
 * `certificateRef` together with the private key — the bundle shape the
 * connector and the signer both read (`buildCertificateBundle`). The key never
 * leaves the server and is not returned.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const refused = requireOnSharedRoute(
      session,
      "retail.fiscal",
      "update",
      ["SUPERADMIN", "MANAGER"],
      "Registering the fiscal device is a manager's to do",
    );
    if (refused) return refused;

    const input = schema.parse(await request.json());
    const companyId = session.user.companyId;

    const provider = await prisma.fiscalisationProviderConfig.findFirst({
      where: fiscalDeviceWhere(companyId),
      orderBy: { updatedAt: "desc" },
    });
    if (!provider) {
      return errorResponse("Save the fiscal device's details before registering it", 400);
    }
    if (!provider.deviceId) {
      return errorResponse("The fiscal device has no device ID", 400);
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    const keypair = generateDeviceKeypair();
    const certificateRequestPem = buildCertificateSigningRequest({
      commonName: input.serialNumber,
      keypair,
      organizationName: company?.name,
      countryName: "ZW",
    });

    const result = await registerDevice({
      provider,
      activationKey: input.activationKey,
      certificateRequestPem,
      deviceModelName: "Huchu",
      deviceModelVersion: "1",
      companyId,
    });

    if (result.status !== "SUCCESS" || !result.data) {
      return errorResponse(result.error ?? "ZIMRA did not register the device", 502);
    }

    const registered = await prisma.fiscalisationProviderConfig.update({
      where: { id: provider.id },
      data: {
        certificateRef: buildCertificateBundle({
          certificatePem: result.data.certificatePem,
          privateKeyPem: keypair.privateKeyPem,
          caPem: result.data.certificateChainPem[0] ?? null,
        }),
      },
    });

    /*
      The device's taxes, from ZIMRA, onto the shop's tax codes. Without a
      taxID a sale's tax lines cannot be signed, and nothing else in the
      product sets one. A failure here does not undo the registration — the
      device is registered either way, and the mapping can be retried by
      registering again with the next key or set in tax setup.
    */
    const config = await getDeviceConfig({ provider: registered }).catch(() => null);
    const taxes =
      config?.status === "SUCCESS" && config.data
        ? await applyZimraTaxMapping(companyId, config.data.applicableTaxes)
        : null;

    return successResponse({
      registered: true,
      deviceId: provider.deviceId,
      taxCodesMapped: taxes?.mapped.map((entry) => entry.code) ?? [],
      taxCodesNotMapped: taxes ? [...taxes.ambiguous, ...taxes.unmatched] : [],
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/fiscalisation/device/register error:", error);
    return errorResponse(error instanceof Error ? error.message : "The device was not registered");
  }
}

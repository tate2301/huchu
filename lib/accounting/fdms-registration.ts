import type { FiscalisationProviderConfig } from "@prisma/client";

import { recordFdmsContact } from "@/lib/accounting/fdms-contact";
import {
  buildCertificateBundle,
  buildCertificateSigningRequest,
  generateDeviceKeypair,
  getDeviceConfig,
  registerDevice,
} from "@/lib/accounting/fdms-device";
import { applyZimraTaxMapping } from "@/lib/accounting/zimra-tax-mapping";
import { prisma } from "@/lib/prisma";

/**
 * Register a company's fiscal device with ZIMRA: the one place that does it,
 * for the accounting console and for Setup › Fiscal device (SET-08).
 *
 * A keypair is made here, the certificate signing request goes to FDMS with
 * the activation key, and the signed certificate comes back into
 * `certificateRef` together with the private key — the bundle shape the
 * connector and the signer both read (`buildCertificateBundle`). The key never
 * leaves the server and is not returned. The device row keeps the serial it
 * was registered under, when and by whom.
 *
 * Then the device's taxes, from ZIMRA, onto the shop's tax codes. Without a
 * taxID a sale's tax lines cannot be signed, and nothing else in the product
 * sets one. A failure there does not undo the registration — the device is
 * registered either way, and the mapping can be retried by registering again
 * with the next key or set in tax setup.
 */

export type FdmsRegistration =
  | { ok: true; deviceId: string; taxCodesMapped: string[]; taxCodesNotMapped: string[] }
  /** 400: the device row is not ready; 502: what ZIMRA said, or that it did not answer. */
  | { ok: false; status: 400 | 502; error: string };

export async function registerFiscalDevice(input: {
  provider: FiscalisationProviderConfig;
  activationKey: string;
  /** The serial number ZIMRA issued the device under — the CSR's common name. */
  serialNumber: string;
  registeredById: string;
  now?: Date;
}): Promise<FdmsRegistration> {
  const { provider } = input;
  const now = input.now ?? new Date();
  if (!provider.deviceId) return { ok: false, status: 400, error: "Type the device ID before connecting." };
  const serialNumber = input.serialNumber.trim();
  if (!serialNumber) return { ok: false, status: 400, error: "Type the serial number before connecting." };

  const company = await prisma.company.findUnique({ where: { id: provider.companyId }, select: { name: true } });
  const keypair = generateDeviceKeypair();
  const certificateRequestPem = buildCertificateSigningRequest({
    commonName: serialNumber,
    keypair,
    organizationName: company?.name,
    countryName: "ZW",
  });

  let result: Awaited<ReturnType<typeof registerDevice>>;
  try {
    result = await registerDevice({
      provider,
      activationKey: input.activationKey,
      certificateRequestPem,
      deviceModelName: "Huchu",
      deviceModelVersion: "1",
      companyId: provider.companyId,
    });
  } catch (error) {
    await recordFdmsContact(provider.id, false, now);
    return {
      ok: false,
      status: 502,
      error: `ZIMRA did not answer: ${error instanceof Error ? error.message : "no reply"}`,
    };
  }
  await recordFdmsContact(provider.id, true, now);
  if (result.status !== "SUCCESS" || !result.data) {
    return { ok: false, status: 502, error: result.error ?? "ZIMRA did not register the device." };
  }

  const registered = await prisma.fiscalisationProviderConfig.update({
    where: { id: provider.id },
    data: {
      certificateRef: buildCertificateBundle({
        certificatePem: result.data.certificatePem,
        privateKeyPem: keypair.privateKeyPem,
        caPem: result.data.certificateChainPem[0] ?? null,
      }),
      serialNumber,
      registeredAt: now,
      registeredById: input.registeredById,
    },
  });

  const config = await getDeviceConfig({ provider: registered }).catch(() => null);
  const taxes =
    config?.status === "SUCCESS" && config.data
      ? await applyZimraTaxMapping(provider.companyId, config.data.applicableTaxes)
      : null;

  return {
    ok: true,
    deviceId: provider.deviceId,
    taxCodesMapped: taxes?.mapped.map((entry) => entry.code) ?? [],
    taxCodesNotMapped: taxes ? [...taxes.ambiguous, ...taxes.unmatched] : [],
  };
}

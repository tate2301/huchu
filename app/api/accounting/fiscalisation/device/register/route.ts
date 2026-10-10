import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { registerFiscalDevice } from "@/lib/accounting/fdms-registration";
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
 * Register the company's fiscal device with ZIMRA, from the accounting
 * console. The work is `registerFiscalDevice` (`lib/accounting/fdms-registration.ts`),
 * which Setup › Fiscal device's Connect calls too.
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
      where: { companyId, isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    if (!provider) {
      return errorResponse("Save the fiscal device's details before registering it", 400);
    }

    const result = await registerFiscalDevice({
      provider,
      activationKey: input.activationKey,
      serialNumber: input.serialNumber,
      registeredById: session.user.id,
    });
    if (!result.ok) return errorResponse(result.error, result.status);

    return successResponse({
      registered: true,
      deviceId: result.deviceId,
      taxCodesMapped: result.taxCodesMapped,
      taxCodesNotMapped: result.taxCodesNotMapped,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/fiscalisation/device/register error:", error);
    return errorResponse(error instanceof Error ? error.message : "The device was not registered");
  }
}

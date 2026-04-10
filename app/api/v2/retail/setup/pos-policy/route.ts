import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { requireRetailSession } from "../../_helpers";
import {
  DEFAULT_RETAIL_POS_POLICY,
  getRetailPosPolicy,
  RETAIL_POS_POLICY_PROVIDER_KEY,
  saveRetailPosPolicy,
} from "@/lib/retail/pos-policy";

const posPolicySchema = z.object({
  requiredReferenceTenders: z.array(z.enum(["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"])).min(1),
  minReferenceLength: z.number().int().min(1).max(30),
  referencePattern: z.string().min(1).max(240),
  splitTenderEnabled: z.boolean(),
  refundRequiresReason: z.boolean(),
  voidRequiresReason: z.boolean(),
  requireSupervisorForRefunds: z.boolean(),
});

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const [policy, record] = await Promise.all([
    getRetailPosPolicy(session.user.companyId),
    prisma.fiscalisationProviderConfig.findFirst({
      where: {
        companyId: session.user.companyId,
        providerKey: RETAIL_POS_POLICY_PROVIDER_KEY,
        isActive: true,
      },
      select: { id: true },
    }),
  ]);
  return successResponse({
    data: policy,
    defaults: DEFAULT_RETAIL_POS_POLICY,
    saved: Boolean(record),
  });
}

export async function PUT(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  if (!["SUPERADMIN", "MANAGER", "SHOP_MANAGER"].includes(session.user.role ?? "")) {
    return errorResponse("Only managers can update POS policy", 403);
  }

  try {
    const body = await request.json();
    const input = posPolicySchema.parse(body);
    await saveRetailPosPolicy(session.user.companyId, input);
    return successResponse({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PUT /api/v2/retail/setup/pos-policy error:", error);
    return errorResponse("Failed to save POS policy");
  }
}


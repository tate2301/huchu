import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireRetailPermission } from "@/lib/retail/permissions";
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

  // R-2.3. Checkout guardrails — discount ceilings, override rules. Reading
  // them tells you exactly how far you can push a price before anyone is asked.
  const gate = requireRetailPermission(session, "retail.setup", "view");
  if (gate) return gate;

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

  const gate = requireRetailPermission(session, "retail.setup", "update");
  if (gate) return gate;

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


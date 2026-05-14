import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { requireRetailManager, requireRetailSession } from "../../_helpers";
import {
  DEFAULT_RETAIL_TENDER_POLICY,
  getRetailTenderPolicy,
  saveRetailTenderPolicy,
} from "@/lib/retail/tender-policy";

const tenderPolicySchema = z.object({
  requiredReferenceTenders: z
    .array(z.enum(["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"]))
    .min(1),
  minReferenceLength: z.number().int().min(1).max(30),
  referencePattern: z.string().min(1).max(240),
});

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const policy = await getRetailTenderPolicy(session.user.companyId);
  return successResponse({ data: policy, defaults: DEFAULT_RETAIL_TENDER_POLICY });
}

export async function PUT(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailManager(session);
  if (gate) return gate;

  try {
    const body = await request.json();
    const input = tenderPolicySchema.parse(body);
    await saveRetailTenderPolicy(session.user.companyId, input);
    return successResponse({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    return errorResponse("Failed to save tender policy", 500);
  }
}

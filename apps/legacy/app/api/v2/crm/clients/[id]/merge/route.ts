import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { mergeClients } from "@/lib/crm/dedupe";
import { requireCrmCapability } from "../../../_helpers";

const bodySchema = z.object({ mergeClientId: z.string().uuid() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!await requireCrmCapability(session, "records.merge")) return errorResponse("Manager access required", 403);
    const { id } = await params;

    const { mergeClientId } = bodySchema.parse(await request.json());
    await mergeClients({
      companyId: session.user.companyId,
      keepClientId: id,
      mergeClientId,
    });
    return successResponse({ keepClientId: id, mergedClientId: mergeClientId });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/clients/[id]/merge error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to merge clients", 400);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { askKnowledge } from "@/lib/crm/knowledge/ask";
import { prisma } from "@/lib/prisma";
import { VaneWriteRefused } from "@/lib/vane/write";

export const maxDuration = 60;

const bodySchema = z.object({ question: z.string().trim().min(3, "Ask it in a few words").max(500) });

/** Ask Vane about the business, on the knowledge base's page: answered from the knowledge base and nothing else. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { question } = bodySchema.parse(await request.json());
    return successResponse(await askKnowledge(prisma, { companyId: session.user.companyId, userId: session.user.id, name: session.user.name ?? null }, question));
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse(error.issues[0]?.message ?? "Ask a question", 400);
    if (error instanceof VaneWriteRefused) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/v2/crm/knowledge/ask error:", error);
    return errorResponse("Vane could not answer");
  }
}

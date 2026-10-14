import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { VaneWriteRefused, writeDocumentEmail } from "@/lib/vane/write";

export const maxDuration = 60;

const bodySchema = z.object({ documentId: z.string().uuid() });

/** "Write it with Vane": the subject and note for a CRM document's email, for the person to change and send. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { documentId } = bodySchema.parse(await request.json());
    const email = await writeDocumentEmail(prisma, { companyId: session.user.companyId, userId: session.user.id, name: session.user.name ?? null }, documentId);
    return successResponse(email);
  } catch (error) {
    if (error instanceof VaneWriteRefused) return errorResponse(error.message, error.status);
    if (error instanceof z.ZodError) return errorResponse("Name the document", 400);
    console.error("[API] POST /api/vane/write/document-email error:", error);
    return errorResponse("Vane could not write it");
  }
}

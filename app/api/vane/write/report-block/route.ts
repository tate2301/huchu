import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { customBlockSchema } from "@/lib/reports/custom/document";
import { writeReportBlock } from "@/lib/vane/report-block";
import { VaneWriteRefused } from "@/lib/vane/write";

export const maxDuration = 60;

const bodySchema = z.object({
  request: z.string().trim().min(1, "Say what to change").max(1000),
  blocks: z.array(customBlockSchema).max(40),
});

/** "Give Vane a change to make": one block written for the report being built, checked, for the person to keep or not. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const body = bodySchema.parse(await request.json());
    return successResponse(await writeReportBlock(prisma, sessionResult.session, body));
  } catch (error) {
    if (error instanceof VaneWriteRefused) return errorResponse(error.message, error.status);
    if (error instanceof z.ZodError) return errorResponse(error.issues[0]?.message ?? "That could not be read", 400);
    console.error("[API] POST /api/vane/write/report-block error:", error);
    return errorResponse("Vane could not write the block");
  }
}

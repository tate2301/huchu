import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { giveJobSchema, giveVaneJob } from "@/lib/vane/panel";

/** Give Vane a job: queued for the worker. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const body = giveJobSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return errorResponse("Say what the job is in a few words", 400);
    const job = await giveVaneJob(prisma, {
      companyId: session.user.companyId,
      userId: session.user.id,
      text: body.data.text,
    });
    return successResponse(job, 201);
  } catch (error) {
    console.error("[API] POST /api/vane/jobs error:", error);
    return errorResponse("Could not hand the job to Vane");
  }
}

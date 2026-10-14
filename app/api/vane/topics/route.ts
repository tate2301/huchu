import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { startTopic, stopTopic } from "@/lib/vane/topics";

const bodySchema = z.object({ topic: z.string().trim().min(1).max(40), stopped: z.boolean() });

/**
 * "Stop it for me" (`stopped: true`): the person no longer sees cards on this
 * topic; everyone else who would, still does. "Show it again" (`false`).
 */
export async function PUT(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const body = bodySchema.parse(await request.json());
    const who = { companyId: session.user.companyId, userId: session.user.id };
    await (body.stopped ? stopTopic(prisma, who, body.topic) : startTopic(prisma, who, body.topic));
    return successResponse({ topic: body.topic, stopped: body.stopped });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Name the topic", 400, error.issues);
    console.error("[API] PUT /api/vane/topics error:", error);
    return errorResponse("Could not change what you see");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { collabRecordSchema, type CollabRecord } from "@corelithzw/module-crm/collaboration";
import { crmRecordExists, isCompanyUser } from "../_helpers";

const followSchema = collabRecordSchema.extend({
  // Managers put someone else on a record; everyone else follows themselves.
  userId: z.string().uuid().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const parsed = collabRecordSchema.safeParse({
      entity: searchParams.get("entity"),
      recordId: searchParams.get("recordId"),
    });
    if (!parsed.success) return errorResponse("A record is required", 400);

    const followers = await prisma.crmFollower.findMany({
      where: {
        companyId: session.user.companyId,
        entity: parsed.data.entity,
        recordId: parsed.data.recordId,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });

    return successResponse({
      followers,
      isFollowing: followers.some((follower) => follower.userId === session.user.id),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/followers error:", error);
    return errorResponse("Failed to fetch followers");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const data = followSchema.parse(await request.json());
    const record: CollabRecord = { entity: data.entity, recordId: data.recordId };
    const userId = data.userId ?? session.user.id;

    if (!(await isCompanyUser(companyId, userId))) return errorResponse("Invalid user", 400);
    if (!(await crmRecordExists(companyId, record))) return errorResponse("Record not found", 404);

    const follower = await prisma.crmFollower.upsert({
      where: {
        userId_entity_recordId: { userId, entity: record.entity, recordId: record.recordId },
      },
      create: { companyId, userId, entity: record.entity, recordId: record.recordId },
      update: {},
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return successResponse(follower, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/followers error:", error);
    return errorResponse("Failed to follow the record");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const parsed = followSchema.safeParse({
      entity: searchParams.get("entity"),
      recordId: searchParams.get("recordId"),
      userId: searchParams.get("userId"),
    });
    if (!parsed.success) return errorResponse("A record is required", 400);
    const userId = parsed.data.userId ?? session.user.id;

    await prisma.crmFollower.deleteMany({
      where: {
        companyId: session.user.companyId,
        userId,
        entity: parsed.data.entity,
        recordId: parsed.data.recordId,
      },
    });

    return successResponse({ unfollowed: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/followers error:", error);
    return errorResponse("Failed to unfollow the record");
  }
}

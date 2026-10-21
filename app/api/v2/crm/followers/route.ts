import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { collabRecordSchema, type CollabRecord } from "@/lib/crm/collaboration";
import { TeamsRefusal } from "@/lib/teams/errors";
import { followRecord, leaveTeam, type RecordRef } from "@/lib/teams/record-team";
import { crmRecordExists, isCompanyUser } from "../_helpers";

const followSchema = collabRecordSchema.extend({
  // Managers put someone else on a record; everyone else follows themselves.
  userId: z.string().uuid().nullable().optional(),
});

const refToRecord = (record: CollabRecord): RecordRef => ({ type: record.entity, id: record.recordId });

/** The membership of a user in this workspace, for the team functions that speak in memberships. */
async function membershipOf(companyId: string, userId: string): Promise<string | null> {
  const held = await prisma.workspaceMembership.findFirst({ where: { companyId, userId }, select: { id: true } });
  return held?.id ?? null;
}

/** The record's team: who works on it and who follows it. */
async function team(companyId: string, record: CollabRecord) {
  return prisma.recordTeamMember.findMany({
    where: { companyId, subjectType: record.entity, subjectId: record.recordId, membership: { status: "ACTIVE" } },
    select: {
      id: true,
      isOwner: true,
      followsOnly: true,
      membership: { select: { userId: true, user: { select: { id: true, name: true, email: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
}

function shape(rows: Awaited<ReturnType<typeof team>>) {
  return rows.map((row) => ({ id: row.id, userId: row.membership.userId, isOwner: row.isOwner, followsOnly: row.followsOnly, user: row.membership.user }));
}

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

    const followers = shape(await team(session.user.companyId, parsed.data));

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

    const membershipId = userId === session.user.id ? undefined : ((await membershipOf(companyId, userId)) ?? undefined);
    await followRecord({ companyId, userId: session.user.id }, refToRecord(record), { membershipId });

    const added = shape(await team(companyId, record)).find((row) => row.userId === userId);
    return successResponse(added, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    if (error instanceof TeamsRefusal) return errorResponse(error.message, 409);
    console.error("[API] POST /api/v2/crm/followers error:", error);
    return errorResponse("Failed to follow the record");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const parsed = followSchema.safeParse({
      entity: searchParams.get("entity"),
      recordId: searchParams.get("recordId"),
      userId: searchParams.get("userId"),
    });
    if (!parsed.success) return errorResponse("A record is required", 400);
    const userId = parsed.data.userId ?? session.user.id;

    const membershipId = userId === session.user.id ? undefined : ((await membershipOf(companyId, userId)) ?? undefined);
    await leaveTeam({ companyId, userId: session.user.id }, refToRecord(parsed.data), { membershipId });

    return successResponse({ unfollowed: true });
  } catch (error) {
    if (error instanceof TeamsRefusal) return errorResponse(error.message, 409);
    console.error("[API] DELETE /api/v2/crm/followers error:", error);
    return errorResponse("Failed to unfollow the record");
  }
}

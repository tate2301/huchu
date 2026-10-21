import { RecordSubjectType } from "@prisma/client";
import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { CALL_TOKEN_TTL, roomFor, teamsCallsEnabled } from "@/lib/teams/calls";
import { canSeeRecord } from "@/lib/teams/record-team";

/**
 * POST /api/teams/livekit/token
 *
 * Mints a LiveKit token for one record's room. The token is made here, on the
 * server, so the secret never reaches a browser, and only for a member who can
 * open the record. The identity in the room is the member's membership id: it
 * is what presence shows, and it stays the same person if they change their
 * name. Behind the `TEAMS_CALLS` flag, which is off unless set.
 */
const bodySchema = z.object({
  subjectType: z.nativeEnum(RecordSubjectType),
  subjectId: z.string().min(1).max(100),
});

export async function POST(request: NextRequest) {
  if (!teamsCallsEnabled()) return errorResponse("Not found", 404);

  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse("A record is required", 400);

    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!url || !apiKey || !apiSecret) return errorResponse("Calls are not set up", 503);

    const companyId = session.user.companyId;
    const member = await prisma.workspaceMembership.findFirst({
      where: { companyId, userId: session.user.id, status: "ACTIVE" },
      select: { id: true, user: { select: { name: true } } },
    });
    if (!member) return errorResponse("You are not a member of this workspace", 403);

    const record = { type: parsed.data.subjectType, id: parsed.data.subjectId };
    if (!(await canSeeRecord(prisma, companyId, record, session.user.id))) {
      return errorResponse("You cannot open this record", 403);
    }

    const room = roomFor(companyId, record);
    const token = new AccessToken(apiKey, apiSecret, { identity: member.id, name: member.user.name, ttl: CALL_TOKEN_TTL });
    token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });

    return successResponse({ token: await token.toJwt(), url, room, identity: member.id });
  } catch (error) {
    console.error("[API] POST /api/teams/livekit/token error:", error);
    return errorResponse("Failed to start the call");
  }
}

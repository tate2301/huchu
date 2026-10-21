import type { RecordSubjectType } from "@prisma/client";

/**
 * Calls on a record. LiveKit opens one room per record while the page is
 * open; the room carries presence and calls and nothing that must be kept.
 * This file holds the parts that need no network: the flag, the room's name
 * and the tokens' lifetime. The token itself is minted in the route.
 */

/**
 * Off unless `TEAMS_CALLS` is switched on, so it is off in production until
 * someone deliberately turns it on there. Anything but 1, true or on is off.
 */
export function teamsCallsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return ["1", "true", "on"].includes((env.TEAMS_CALLS ?? "").trim().toLowerCase());
}

/** One room per record, and per workspace so two workspaces never share one. */
export function roomFor(companyId: string, record: { type: RecordSubjectType; id: string }): string {
  return `record:${companyId}:${record.type}:${record.id}`;
}

/** Long enough to join and stay; the page asks for a fresh one if it reconnects. */
export const CALL_TOKEN_TTL = "10m";

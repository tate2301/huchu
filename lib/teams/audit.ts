import { writePlatformAuditEvent, type AuditClient } from "@/lib/audit/platform";

/**
 * Every member, permission, seat and ownership change leaves one line on the
 * workspace's audit chain: who did it, to what, and what it was before and
 * after. The member's page and Activity read these.
 *
 * Callers pass the transaction that makes the change, so the change and its
 * line commit together or not at all.
 */

export type TeamsEntity = "membership" | "permission" | "seats" | "invite" | "invite_link" | "ownership_offer" | "record_team" | "record_access";

/** Every kind of change that is written down, one per line of the audit chain. */
export const TEAMS_CHANGES = [
  "member.added",
  "member.role_changed",
  "member.admin_changed",
  "member.suspended",
  "member.restored",
  "member.removed",
  "permission.changed",
  "seats.limit_changed",
  "seats.requested",
  "invite.created",
  "invite.resent",
  "invite.revoked",
  "invite.expired",
  "invite.accepted",
  "invite.delivery_failed",
  "invite_link.turned_on",
  "invite_link.turned_off",
  "invite_link.rotated",
  "ownership.offered",
  "ownership.accepted",
  "ownership.declined",
  "ownership.lapsed",
  "record_team.joined",
  "record_team.left",
  "record_team.followed",
  "record_team.unfollowed",
  "record_team.handed_over",
  "record_access.requested",
  "record_access.granted",
  "record_access.denied",
] as const;

export type TeamsChange = (typeof TEAMS_CHANGES)[number];

export type TeamsAuditInput = {
  companyId: string;
  /** The user who did it; null for the system (a lapse, an expiry). */
  actorId: string | null;
  change: TeamsChange;
  entityType: TeamsEntity;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string;
};

export const TEAMS_EVENT_PREFIX = "teams.";

export function recordTeamsChange(client: AuditClient, input: TeamsAuditInput): Promise<void> {
  return writePlatformAuditEvent(
    {
      companyId: input.companyId,
      actorId: input.actorId,
      eventType: `${TEAMS_EVENT_PREFIX}${input.change}`,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason,
      payload: { before: input.before ?? null, after: input.after ?? null },
    },
    client,
  );
}

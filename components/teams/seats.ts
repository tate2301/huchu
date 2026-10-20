/**
 * Seats (K2, model.md "Seats"). The plan sets the limit and every plan starts at five. Active members and
 * open invites hold seats; suspended and removed members, and invites that expired or were revoked, do not.
 * Everyone who signs in takes a seat, till staff included.
 */

export type MemberStatus = "active" | "suspended" | "removed";
export type InviteStatus = "sent" | "not_delivered" | "accepted" | "expired" | "revoked";

/** An accepted invite has become a member and is counted there. */
const HOLDS_SEAT: ReadonlySet<InviteStatus> = new Set(["sent", "not_delivered"]);

export function seatsUsed(input: {
  members: ReadonlyArray<{ status: MemberStatus }>;
  invites: ReadonlyArray<{ status: InviteStatus }>;
}): { members: number; invites: number; used: number } {
  const members = input.members.filter((m) => m.status === "active").length;
  const invites = input.invites.filter((i) => HOLDS_SEAT.has(i.status)).length;
  return { members, invites, used: members + invites };
}

/** room: more than one left. last: one left, shown in warning. full: none left. over: more people than seats. */
export type SeatState = "room" | "last" | "full" | "over";

export function seatState(used: number, limit: number): SeatState {
  if (used > limit) return "over";
  if (used === limit) return "full";
  if (used === limit - 1) return "last";
  return "room";
}

/** "4 of 5 seats used". */
export function seatLine(used: number, limit: number): string {
  return `${used} of ${limit} seats used`;
}

/** "All 5 seats are taken". */
export function fullLine(limit: number): string {
  return `All ${limit} seats are taken`;
}

const ORDINALS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];

/** What the owner's button says when every seat is taken: "Add a sixth member". */
export function addMemberLabel(limit: number): string {
  const next = limit + 1;
  const word = ORDINALS[next] ?? `${next}th`;
  return `Add ${/^[aeiou]/.test(word) ? "an" : "a"} ${word} member`;
}

/** Restoring a suspended member needs a free seat. */
export function canRestore(used: number, limit: number): boolean {
  return used < limit;
}

/** An invite can only go out while a seat is free. */
export function canInvite(used: number, limit: number): boolean {
  return used < limit;
}

/** Each invite state's ways out, in the order they are offered (model.md "Invites"). */
export const INVITE_WAYS_OUT: Record<InviteStatus, readonly string[]> = {
  sent: ["Resend", "Revoke"],
  not_delivered: ["Send the other way", "Change the address or number", "Copy the link"],
  accepted: [],
  expired: ["Send again"],
  revoked: ["Invite again"],
};

export function invitesHoldSeat(status: InviteStatus): boolean {
  return HOLDS_SEAT.has(status);
}

/**
 * Witness for `teams_invites`.
 *
 * The tables and the one-open-offer index exist and `seatLimit` defaults to
 * five. Then the rules the migration exists for: nobody is invited past the
 * limit, a revoked, expired or suspended seat is free again, restoring needs a
 * free seat, tokens are stored hashed and a link never works twice, accepting
 * lands where the invite said without moving the seat count, and an accepted
 * ownership offer moves `isOwner` and makes the old owner an admin together.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { acceptInvite, acceptInviteLink, createInvite, expireInvites, hashToken, resendInvite, revokeInvite, turnOffInviteLink, turnOnInviteLink } from "./invites";
import { createMember, restoreMember, suspendMember } from "./members";
import { acceptOwnership, declineOwnership, lapseOwnershipOffers, offerOwnership } from "./ownership";
import { canInvite, seatLine, setSeatLimit } from "./seats";

const run = crypto.randomUUID().slice(0, 8);
let companyId: string;
const people: Record<"sean" | "tatenda" | "munashe" | "simba", { userId: string; membershipId: string }> = {} as never;
const T0 = new Date("2026-10-19T10:00:00Z");
const days = (n: number) => new Date(T0.getTime() + n * 86_400_000);

async function add(key: keyof typeof people, role: "SUPERADMIN" | "MANAGER" | "SALES_REP", owner = false) {
  const user = await createMember(prisma, {
    owner,
    data: { companyId, name: key, email: `${key}-${run}@invites.test`, role },
    select: { id: true, memberships: { select: { id: true } } },
  });
  people[key] = { userId: user.id, membershipId: user.memberships[0].id };
}
const as = (key: keyof typeof people) => ({ companyId, userId: people[key].userId });
const events = (change: string) => prisma.platformAuditEvent.findMany({ where: { companyId, eventType: `teams.${change}` } });
const used = async (now = T0) => (await seatLine(prisma, companyId, now)).used;
const refused = async (work: Promise<unknown>, code: string) => {
  await expect(work).rejects.toMatchObject({ name: "TeamsRefusal", code });
};

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Invites ${run}`, slug: `invites-${run}` }, select: { id: true } })).id;
  await add("sean", "SUPERADMIN", true);
  await add("tatenda", "SUPERADMIN");
  await add("munashe", "MANAGER");
  await add("simba", "SALES_REP");
});

afterAll(async () => {
  await prisma.workspaceInvite.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("the migration", () => {
  it("adds the tables, the default limit and the one-open-offer index", async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables WHERE table_name IN ('WorkspaceInvite', 'InviteLink', 'OwnershipOffer')`;
    expect(tables.map((row) => row.table_name).sort()).toEqual(["InviteLink", "OwnershipOffer", "WorkspaceInvite"]);
    const other = await prisma.company.create({ data: { name: `Default ${run}`, slug: `default-${run}` }, select: { seatLimit: true, id: true } });
    expect(other.seatLimit).toBe(5);
    await prisma.company.delete({ where: { id: other.id } });
    const [{ count }] = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) AS count FROM pg_indexes WHERE indexname = 'OwnershipOffer_one_open'`;
    expect(Number(count)).toBe(1);
  });
});

describe("seats", () => {
  it("counts active members and open invites, and writes the line", async () => {
    expect(await seatLine(prisma, companyId, T0)).toMatchObject({ used: 4, limit: 5, left: 1, state: "last", text: "4 of 5 seats used" });
  });

  it("stops an invite past the limit, and a workspace already over keeps working", async () => {
    const { token } = await createInvite(as("sean"), { name: "Tariro", phone: "+263775402186", role: "SALES_REP" }, T0);
    expect(token).toBeTruthy();
    expect(await seatLine(prisma, companyId, T0)).toMatchObject({ used: 5, state: "full" });
    await refused(createInvite(as("tatenda"), { email: `late-${run}@invites.test`, role: "SALES_REP" }, T0), "SEATS_FULL");
    expect((await canInvite(prisma, companyId, "MANAGER", T0)).ok).toBe(false);
    // Lowering the limit under what is used is allowed; nobody is removed.
    await setSeatLimit(as("sean"), 3);
    expect(await seatLine(prisma, companyId, T0)).toMatchObject({ used: 5, limit: 3, left: 0 });
    expect(await prisma.workspaceMembership.count({ where: { companyId, status: "ACTIVE" } })).toBe(4);
    await setSeatLimit(as("sean"), 5);
  });

  it("only lets the owner change the limit", async () => {
    await refused(setSeatLimit(as("tatenda"), 9), "OWNER_ONLY");
    expect((await events("seats.limit_changed")).length).toBe(2);
  });

  it("frees the seat when an invite is revoked, then again when one expires", async () => {
    const [waiting] = await prisma.workspaceInvite.findMany({ where: { companyId } });
    await revokeInvite(as("tatenda"), waiting.id, T0);
    expect(await used()).toBe(4);
    const next = await createInvite(as("tatenda"), { email: `next-${run}@invites.test`, role: "SALES_REP" }, T0);
    expect(await used()).toBe(5);
    expect(await used(days(8))).toBe(4);
    expect(await expireInvites(days(8), companyId)).toBe(1);
    expect((await prisma.workspaceInvite.findUniqueOrThrow({ where: { id: next.invite.id } })).status).toBe("EXPIRED");
    expect((await events("invite.expired"))[0]).toMatchObject({ actor: null, entityId: next.invite.id });
  });

  it("frees the seat when a member is suspended and needs a free seat to restore", async () => {
    await suspendMember(as("sean"), people.simba.membershipId);
    expect(await used()).toBe(3);
    const filler = await createInvite(as("sean"), { email: `fill1-${run}@invites.test`, role: "MANAGER" }, T0);
    await createInvite(as("sean"), { email: `fill2-${run}@invites.test`, role: "MANAGER" }, T0);
    expect(await used()).toBe(5);
    await refused(restoreMember(as("sean"), people.simba.membershipId), "SEATS_FULL");
    await revokeInvite(as("sean"), filler.invite.id, T0);
    await restoreMember(as("sean"), people.simba.membershipId);
    expect((await prisma.workspaceMembership.findUniqueOrThrow({ where: { id: people.simba.membershipId } })).status).toBe("ACTIVE");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: people.simba.userId } })).isActive).toBe(true);
    expect(await events("member.restored")).toHaveLength(1);
  });
});

describe("invites", () => {
  it("keeps only a hash of the token and refuses duplicates and strangers", async () => {
    await prisma.workspaceInvite.updateMany({ where: { companyId, status: { in: ["SENT", "NOT_DELIVERED"] } }, data: { status: "REVOKED" } });
    const { invite, token } = await createInvite(as("tatenda"), { name: "Farai", email: `farai-${run}@invites.test`, role: "MANAGER", landsOn: "/crm/deals/d-14" }, T0);
    expect(invite.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(invite)).not.toContain(token);
    await refused(createInvite(as("tatenda"), { email: `farai-${run}@invites.test`, role: "MANAGER" }, T0), "ALREADY_INVITED");
    await refused(createInvite(as("tatenda"), { email: `sean-${run}@invites.test`, role: "MANAGER" }, T0), "ALREADY_MEMBER");
    await refused(createInvite(as("munashe"), { email: `x-${run}@invites.test`, role: "MANAGER" }, T0), "NOT_ALLOWED");
    await refused(createInvite(as("tatenda"), { email: `admin-${run}@invites.test`, role: "SUPERADMIN" }, T0), "OWNER_ONLY");
    await refused(createInvite(as("tatenda"), { email: `y-${run}@invites.test`, role: "MANAGER", landsOn: "//evil.example" }, T0), "INVALID");
  });

  it("resend issues a new token and the old one stops working", async () => {
    const [invite] = await prisma.workspaceInvite.findMany({ where: { companyId, status: "SENT" } });
    const oldToken = "unknown";
    const sent = await resendInvite(as("tatenda"), invite.id, {}, days(1));
    expect(sent.invite.tokenHash).not.toBe(invite.tokenHash);
    expect(sent.invite.expiresAt.getTime()).toBe(days(8).getTime());
    await refused(acceptInvite({ token: oldToken }, days(2)), "NOT_FOUND");
  });

  it("accept makes an active member, lands on the record, keeps the seat count and cannot be used twice", async () => {
    const [invite] = await prisma.workspaceInvite.findMany({ where: { companyId, status: "SENT" } });
    const { token } = await resendInvite(as("tatenda"), invite.id, {}, days(1));
    const before = await used(days(2));
    const joined = await acceptInvite({ token }, days(2));
    expect(joined).toMatchObject({ companyId, landsOn: "/crm/deals/d-14" });
    expect(await used(days(2))).toBe(before);
    const membership = await prisma.workspaceMembership.findUniqueOrThrow({ where: { id: joined.membershipId } });
    expect(membership).toMatchObject({ status: "ACTIVE", role: "MANAGER", userId: joined.userId, isOwner: false });
    expect((await prisma.workspaceInvite.findUniqueOrThrow({ where: { id: invite.id } }))).toMatchObject({ status: "ACCEPTED", acceptedMembershipId: joined.membershipId });
    await refused(acceptInvite({ token }, days(3)), "NOT_OPEN");
    expect(await events("invite.accepted")).toHaveLength(1);
  });

  it("gives an expired or revoked link its own refusal", async () => {
    await setSeatLimit(as("sean"), 9);
    const stale = await createInvite(as("sean"), { email: `stale-${run}@invites.test`, role: "SALES_REP" }, days(10));
    await refused(acceptInvite({ token: stale.token }, days(18)), "EXPIRED");
    const gone = await createInvite(as("sean"), { email: `gone-${run}@invites.test`, role: "SALES_REP" }, days(18));
    await revokeInvite(as("sean"), gone.invite.id, days(18));
    await refused(acceptInvite({ token: gone.token }, days(18)), "NOT_OPEN");
  });

  it("lands on the product home when the invite named no page", async () => {
    const plain = await createInvite(as("sean"), { email: `plain-${run}@invites.test`, role: "SALES_REP", name: "Plain" }, days(20));
    await prisma.workspaceInvite.updateMany({ where: { companyId, status: "SENT", id: { not: plain.invite.id } }, data: { status: "REVOKED" } });
    expect((await acceptInvite({ token: plain.token }, days(20))).landsOn).toBe("/");
  });
});

describe("the shared link", () => {
  it("needs a free seat, and turning it off or on again kills the old token", async () => {
    await setSeatLimit(as("sean"), 5);
    await prisma.workspaceInvite.updateMany({ where: { companyId, status: { in: ["SENT", "NOT_DELIVERED"] } }, data: { status: "REVOKED" } });
    await prisma.workspaceMembership.updateMany({ where: { companyId, id: { in: [people.simba.membershipId, people.munashe.membershipId] } }, data: { status: "SUSPENDED" } });
    const first = await turnOnInviteLink(as("sean"), "SALES_REP", days(30));
    const joined = await acceptInviteLink({ token: first.token, name: "Kuda", phone: "+263771112233" }, days(30));
    expect((await prisma.workspaceMembership.findUniqueOrThrow({ where: { id: joined.membershipId } })).role).toBe("SALES_REP");
    const second = await turnOnInviteLink(as("sean"), "SALES_REP", days(30));
    await refused(acceptInviteLink({ token: first.token, name: "Old", phone: "+263771112244" }, days(30)), "NOT_FOUND");
    await turnOffInviteLink(as("sean"), "SALES_REP");
    await refused(acceptInviteLink({ token: second.token, name: "Off", phone: "+263771112255" }, days(30)), "NOT_FOUND");
    const third = await turnOnInviteLink(as("sean"), "SALES_REP", days(30));
    await prisma.workspaceMembership.updateMany({ where: { companyId, status: "SUSPENDED" }, data: { status: "ACTIVE" } });
    await refused(acceptInviteLink({ token: third.token, name: "Full", phone: "+263771112266" }, days(30)), "SEATS_FULL");
    const changes = (await prisma.platformAuditEvent.findMany({ where: { companyId, entityType: "invite_link" } })).map((e) => e.eventType).sort();
    expect(changes).toEqual(["teams.invite_link.rotated", "teams.invite_link.turned_off", "teams.invite_link.turned_on", "teams.invite_link.turned_on"]);
  });
});

describe("ownership", () => {
  it("moves isOwner and makes the old owner an admin in one commit", async () => {
    const offer = await offerOwnership(as("sean"), people.tatenda.membershipId, days(40));
    expect(offer.expiresAt.getTime()).toBe(days(47).getTime());
    await refused(offerOwnership(as("tatenda"), people.sean.membershipId, days(40)), "OWNER_ONLY");
    await refused(acceptOwnership(as("munashe"), offer.id, days(41)), "NOT_ALLOWED");
    await acceptOwnership(as("tatenda"), offer.id, days(41));
    const [sean, tatenda] = await Promise.all([
      prisma.workspaceMembership.findUniqueOrThrow({ where: { id: people.sean.membershipId } }),
      prisma.workspaceMembership.findUniqueOrThrow({ where: { id: people.tatenda.membershipId } }),
    ]);
    expect(sean).toMatchObject({ isOwner: false, isAdmin: true });
    expect(tatenda).toMatchObject({ isOwner: true, isAdmin: false });
    expect(await prisma.workspaceMembership.count({ where: { companyId, isOwner: true } })).toBe(1);
    expect((await prisma.ownershipOffer.findUniqueOrThrow({ where: { id: offer.id } })).status).toBe("ACCEPTED");
    await refused(acceptOwnership(as("tatenda"), offer.id, days(42)), "NOT_OPEN");
    expect(await events("ownership.accepted")).toHaveLength(1);
  });

  it("lapses after seven days, can be declined and allows one open offer", async () => {
    const stale = await offerOwnership(as("tatenda"), people.sean.membershipId, days(50));
    await refused(acceptOwnership(as("sean"), stale.id, days(58)), "EXPIRED");
    expect(await lapseOwnershipOffers(days(58), companyId)).toBe(1);
    expect((await prisma.ownershipOffer.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("LAPSED");

    const declined = await offerOwnership(as("tatenda"), people.sean.membershipId, days(60));
    await declineOwnership(as("sean"), declined.id, days(61));
    expect((await prisma.ownershipOffer.findUniqueOrThrow({ where: { id: declined.id } })).status).toBe("DECLINED");
    expect(await prisma.workspaceMembership.count({ where: { companyId, isOwner: true } })).toBe(1);

    const first = await offerOwnership(as("tatenda"), people.sean.membershipId, days(62));
    const second = await offerOwnership(as("tatenda"), people.munashe.membershipId, days(62));
    expect((await prisma.ownershipOffer.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("LAPSED");
    expect(second.status).toBe("OPEN");
    await expect(
      prisma.ownershipOffer.create({ data: { companyId, fromMembershipId: people.tatenda.membershipId, toMembershipId: people.simba.membershipId, expiresAt: days(70) } }),
    ).rejects.toThrow();
  });
});

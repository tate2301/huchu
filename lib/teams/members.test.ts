import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { changeMemberRole, createMember, removeMember, suspendMember } from "./members";

const run = crypto.randomUUID().slice(0, 8);
let companyId: string;
const people: Record<"sean" | "tatenda" | "gerald" | "munashe" | "simba", { userId: string; membershipId: string }> = {} as never;

async function add(key: keyof typeof people, role: "SUPERADMIN" | "MANAGER" | "SALES_REP", owner = false) {
  const user = await createMember(prisma, {
    owner,
    data: { companyId, name: key, email: `${key}-${run}@members.test`, role },
    select: { id: true, memberships: { select: { id: true } } },
  });
  people[key] = { userId: user.id, membershipId: user.memberships[0].id };
}

const as = (key: keyof typeof people) => ({ companyId, userId: people[key].userId });
const held = (key: keyof typeof people) => prisma.workspaceMembership.findUniqueOrThrow({ where: { id: people[key].membershipId } });
const events = (change: string) => prisma.platformAuditEvent.findMany({ where: { companyId, eventType: `teams.${change}` } });

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Members ${run}`, slug: `members-${run}` }, select: { id: true } })).id;
  await add("sean", "SUPERADMIN", true);
  await add("tatenda", "SUPERADMIN");
  await add("gerald", "SUPERADMIN");
  await add("munashe", "MANAGER");
  await add("simba", "SALES_REP");
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("who may do what to members", () => {
  it("lets an admin suspend a member, frees them, signs them out and records it", async () => {
    await suspendMember(as("tatenda"), people.munashe.membershipId);
    expect(await held("munashe")).toMatchObject({ status: "SUSPENDED" });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: people.munashe.userId } });
    expect(user).toMatchObject({ isActive: false, accessRemovedAt: null });
    expect(user.sessionsEndedAt).not.toBeNull();
    const [event] = await events("member.suspended");
    expect(event).toMatchObject({ actor: people.tatenda.userId, entityType: "membership", entityId: people.munashe.membershipId });
    expect(JSON.parse(event.payloadJson!)).toMatchObject({ before: { status: "ACTIVE" }, after: { status: "SUSPENDED" } });
  });

  it("refuses an admin acting on an admin, the owner, or themselves; only the owner may touch an admin", async () => {
    await expect(suspendMember(as("tatenda"), people.gerald.membershipId)).rejects.toMatchObject({ code: "OWNER_ONLY" });
    await expect(suspendMember(as("tatenda"), people.sean.membershipId)).rejects.toMatchObject({ code: "IS_OWNER" });
    await expect(suspendMember(as("tatenda"), people.tatenda.membershipId)).rejects.toMatchObject({ code: "SELF" });
    await expect(suspendMember(as("simba"), people.gerald.membershipId)).rejects.toMatchObject({ code: "OWNER_ONLY" });
    await expect(suspendMember(as("munashe"), people.simba.membershipId)).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
    await suspendMember(as("sean"), people.gerald.membershipId);
    expect(await held("gerald")).toMatchObject({ status: "SUSPENDED", isAdmin: true });
  });

  it("will not take the last admin away", async () => {
    await expect(suspendMember(as("sean"), people.tatenda.membershipId)).rejects.toMatchObject({ code: "LAST_ADMIN" });
    await expect(changeMemberRole(as("sean"), people.tatenda.membershipId, "MANAGER")).rejects.toMatchObject({ code: "LAST_ADMIN" });
    expect(await held("tatenda")).toMatchObject({ status: "ACTIVE", isAdmin: true });
  });

  it("lets an admin change a job, but only the owner make or unmake an admin", async () => {
    await changeMemberRole(as("tatenda"), people.simba.membershipId, "MANAGER");
    expect(await held("simba")).toMatchObject({ role: "MANAGER", isAdmin: false });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: people.simba.userId } })).role).toBe("MANAGER");
    await expect(changeMemberRole(as("tatenda"), people.simba.membershipId, "SUPERADMIN")).rejects.toMatchObject({ code: "OWNER_ONLY" });
    await changeMemberRole(as("sean"), people.simba.membershipId, "SUPERADMIN");
    expect(await held("simba")).toMatchObject({ role: "SUPERADMIN", isAdmin: true });
    await changeMemberRole(as("sean"), people.simba.membershipId, "SALES_REP");
    expect(await held("simba")).toMatchObject({ role: "SALES_REP", isAdmin: false });
    expect(await events("member.role_changed")).toHaveLength(1);
    expect(await events("member.admin_changed")).toHaveLength(2);
  });

  it("removes a member, keeps their row, and records who did it", async () => {
    await removeMember(as("tatenda"), people.simba.membershipId);
    expect(await held("simba")).toMatchObject({ status: "REMOVED", removedById: people.tatenda.userId });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: people.simba.userId } })).toMatchObject({ isActive: false, accessRemovedById: people.tatenda.userId });
    expect(await events("member.removed")).toHaveLength(1);
    await expect(changeMemberRole(as("sean"), people.simba.membershipId, "MANAGER")).rejects.toMatchObject({ code: "NOT_OPEN" });
  });
});

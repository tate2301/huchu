import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  changeMemberRole,
  giveMemberAccessBack,
  removeMemberAccess,
  signMemberOutEverywhere,
  type WorkspaceRef,
} from "@/lib/admin/member-actions";
import { AdminRefusal } from "@/lib/admin/refusal";
import { operatorActor } from "@/lib/operators/audit";
import type { SignedInOperator } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";

const run = randomUUID().slice(0, 8);
let workspace: WorkspaceRef;
let other: WorkspaceRef;
let operator: SignedInOperator;
let ownerId: string;
let clerkId: string;
let strangerId: string;

beforeAll(async () => {
  const op = await prisma.operator.create({ data: { email: `ops-${run}@corelith.test`, name: "Farai Moyo", role: "SUPPORT" } });
  operator = { sessionId: "s", id: op.id, email: op.email, name: op.name, role: op.role };
  const company = await prisma.company.create({ data: { name: `Chikuru ${run}`, slug: `chikuru-${run}`, workspaceProfile: "GENERAL" } });
  const elsewhere = await prisma.company.create({ data: { name: `Zuva ${run}`, slug: `zuva-${run}`, workspaceProfile: "GENERAL" } });
  workspace = { id: company.id, name: company.name, workspaceProfile: "GENERAL" };
  other = { id: elsewhere.id, name: elsewhere.name, workspaceProfile: "GENERAL" };
  ownerId = (await prisma.user.create({ data: { name: "Tendai", email: `tendai-${run}@x.test`, role: "SUPERADMIN", companyId: company.id } })).id;
  clerkId = (await prisma.user.create({ data: { name: "Rutendo", email: `rutendo-${run}@x.test`, role: "CLERK", companyId: company.id } })).id;
  strangerId = (await prisma.user.create({ data: { name: "Tsitsi", email: `tsitsi-${run}@x.test`, role: "CLERK", companyId: elsewhere.id } })).id;
});

afterAll(async () => {
  await prisma.platformAuditEvent.deleteMany({ where: { companyId: { in: [workspace.id, other.id] } } });
  await prisma.user.deleteMany({ where: { companyId: { in: [workspace.id, other.id] } } });
  await prisma.company.deleteMany({ where: { id: { in: [workspace.id, other.id] } } });
  await prisma.operator.deleteMany({ where: { id: operator.id } });
});

describe("an operator's changes to a member", () => {
  it("refuse a member of another workspace", async () => {
    await expect(signMemberOutEverywhere(operator, workspace, strangerId)).rejects.toThrow(AdminRefusal);
    await expect(changeMemberRole(operator, workspace, strangerId, "MANAGER")).rejects.toThrow(/not in Chikuru/);
  });

  it("change a role to one the workspace has, and log it on the workspace's chain with the operator's name", async () => {
    await changeMemberRole(operator, workspace, clerkId, "MANAGER");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: clerkId } })).role).toBe("MANAGER");
    const event = await prisma.platformAuditEvent.findFirstOrThrow({
      where: { companyId: workspace.id, eventType: "operator.member.role_changed" },
    });
    expect(event.actor).toBe(operatorActor(operator.id));
    await expect(changeMemberRole(operator, workspace, clerkId, "TEACHER")).rejects.toThrow(/not a role/);
  });

  it("never leave a workspace without an owner", async () => {
    await expect(changeMemberRole(operator, workspace, ownerId, "MANAGER")).rejects.toThrow(/only owner/);
    await expect(removeMemberAccess(operator, workspace, ownerId, "testing")).rejects.toThrow(/only owner/);
  });

  it("sign a member out everywhere by ending their sessions now", async () => {
    await signMemberOutEverywhere(operator, workspace, clerkId);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: clerkId } })).sessionsEndedAt).toBeInstanceOf(Date);
  });

  it("remove access only with a reason, and give it back", async () => {
    await expect(removeMemberAccess(operator, workspace, clerkId, " ")).rejects.toThrow(/Say why/);
    await removeMemberAccess(operator, workspace, clerkId, "Left the company");
    const removed = await prisma.user.findUniqueOrThrow({ where: { id: clerkId } });
    expect(removed.isActive).toBe(false);
    expect(removed.accessRemovedAt).toBeInstanceOf(Date);
    const event = await prisma.platformAuditEvent.findFirstOrThrow({
      where: { companyId: workspace.id, eventType: "operator.member.access_removed" },
    });
    expect(event.reason).toBe("Left the company");

    await giveMemberAccessBack(operator, workspace, clerkId);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: clerkId } })).isActive).toBe(true);
  });
});

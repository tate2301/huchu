import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addMembers,
  changeMemberRole,
  deleteMember,
  editMember,
  giveMemberAccessBack,
  MemberFieldsRefusal,
  MemberLinesRefusal,
  membersByIds,
  parseMemberLines,
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

describe("finding members for a list action", () => {
  it("names each member's own workspace, so a bulk action across workspaces checks each in its own", async () => {
    const found = await membersByIds([clerkId, strangerId, "gone"]);
    expect(found.map((member) => [member.name, member.workspace.id]).sort()).toEqual(
      [
        ["Rutendo", workspace.id],
        ["Tsitsi", other.id],
      ].sort(),
    );
  });
});

describe("reading pasted members", () => {
  const roles = [
    { value: "MANAGER" as const, label: "Manager" },
    { value: "CLERK" as const, label: "Clerk" },
  ];

  it("takes name and email, then a phone and a role in either order, by comma or tab", () => {
    const { lines, problems } = parseMemberLines(
      "Rudo Dube, RUDO@x.test\nFarai Moyo\tfarai@x.test\tManager\t0771234567\n\nChipo, chipo@x.test, +263 73 123 4567",
      roles,
      "CLERK",
    );
    expect(problems).toEqual([]);
    expect(lines).toEqual([
      { line: 1, name: "Rudo Dube", email: "rudo@x.test", phone: null, role: "CLERK" },
      { line: 2, name: "Farai Moyo", email: "farai@x.test", phone: "+263771234567", role: "MANAGER" },
      { line: 4, name: "Chipo", email: "chipo@x.test", phone: "+263731234567", role: "CLERK" },
    ]);
  });

  it("names every problem by its line: no email, a word it cannot read, the same email twice", () => {
    const { problems } = parseMemberLines("Rudo\nFarai, farai@x.test, Teacher\nChipo, chipo@x.test\nChipo again, CHIPO@x.test", roles, "CLERK");
    expect(problems).toEqual([
      "Line 1: “(blank)” is not an email. Write the name, then the email.",
      "Line 2: “Teacher” is neither a mobile number such as +263 77 123 4567 nor a role here.",
      "Line 4: chipo@x.test is on line 3 as well.",
    ]);
    expect(parseMemberLines("  \n", roles, "CLERK").problems).toEqual(["Write one member per line: name, then email."]);
  });
});

describe("adding members", () => {
  it("adds everyone pasted with no password, and logs each on the workspace's chain", async () => {
    const { added } = await addMembers(operator, workspace, {
      text: `Nyasha, nyasha-${run}@x.test, 0712345678\nKuda, kuda-${run}@x.test, Clerk`,
      role: "MANAGER",
    });
    expect(added.map((member) => member.name)).toEqual(["Nyasha", "Kuda"]);
    const users = await prisma.user.findMany({ where: { id: { in: added.map((member) => member.id) } }, orderBy: { name: "asc" } });
    expect(users.map((user) => [user.name, user.role, user.phone, user.password, user.companyId])).toEqual([
      ["Kuda", "CLERK", null, null, workspace.id],
      ["Nyasha", "MANAGER", "+263712345678", null, workspace.id],
    ]);
    expect(await prisma.platformAuditEvent.count({ where: { companyId: workspace.id, eventType: "operator.member.added" } })).toBe(2);
  });

  it("adds nobody while an email is taken anywhere, or a number is taken here, and says where", async () => {
    const before = await prisma.user.count({ where: { companyId: workspace.id } });
    const refusal = await addMembers(operator, workspace, {
      text: `New One, new-${run}@x.test\nTsitsi, TSITSI-${run}@x.test\nNyasha Two, nyasha2-${run}@x.test, 0712345678`,
      role: "CLERK",
    }).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(MemberLinesRefusal);
    expect((refusal as MemberLinesRefusal).problems).toEqual([
      `Line 2: tsitsi-${run}@x.test already signs in to Zuva ${run}.`,
      "Line 3: Nyasha already has +263712345678.",
    ]);
    expect(await prisma.user.count({ where: { companyId: workspace.id } })).toBe(before);
  });

  it("refuses a role the workspace does not have", async () => {
    await expect(addMembers(operator, workspace, { text: `X, x-${run}@x.test`, role: "TEACHER" })).rejects.toThrow(/not a role/);
  });
});

describe("editing a member", () => {
  it("refuses each field in words, and saves nothing", async () => {
    const refusal = await editMember(operator, workspace, clerkId, { name: " ", email: `tsitsi-${run}@x.test`, phone: "12" }).catch(
      (error: unknown) => error,
    );
    expect(refusal).toBeInstanceOf(MemberFieldsRefusal);
    expect(Object.keys((refusal as MemberFieldsRefusal).fields).sort()).toEqual(["email", "name", "phone"]);
    expect((refusal as MemberFieldsRefusal).fields.email).toMatch(/already signs in with that email, in Zuva/);
    await expect(editMember(operator, workspace, clerkId, { name: "Rutendo", email: "", phone: "" })).rejects.toThrow(/cannot be blank/);
  });

  it("saves a name and phone without signing them out, and a new email signs them out", async () => {
    await prisma.user.update({ where: { id: clerkId }, data: { sessionsEndedAt: null } });
    expect(await editMember(operator, workspace, clerkId, { name: "Rutendo Chari", email: `rutendo-${run}@x.test`, phone: "0781234567" })).toEqual({
      signedOut: false,
    });
    let saved = await prisma.user.findUniqueOrThrow({ where: { id: clerkId } });
    expect([saved.name, saved.phone, saved.sessionsEndedAt]).toEqual(["Rutendo Chari", "+263781234567", null]);

    expect(await editMember(operator, workspace, clerkId, { name: "Rutendo Chari", email: `RChari-${run}@x.test`, phone: "0781234567" })).toEqual({
      signedOut: true,
    });
    saved = await prisma.user.findUniqueOrThrow({ where: { id: clerkId } });
    expect(saved.email).toBe(`rchari-${run}@x.test`);
    expect(saved.sessionsEndedAt).toBeInstanceOf(Date);
    const event = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId: workspace.id, eventType: "operator.member.edited", entityId: clerkId } });
    expect(event.actor).toBe(operatorActor(operator.id));
  });

  it("refuses a member of another workspace", async () => {
    await expect(editMember(operator, workspace, strangerId, { name: "T", email: "", phone: "" })).rejects.toThrow(/not in Chikuru/);
  });
});

describe("deleting a member", () => {
  it("needs a reason and never deletes the only owner", async () => {
    await expect(deleteMember(operator, workspace, clerkId, "")).rejects.toThrow(/Say why/);
    await expect(deleteMember(operator, workspace, ownerId, "Testing")).rejects.toThrow(/only owner/);
  });

  it("refuses a member a record points at, and leaves them as they were", async () => {
    const marked = await prisma.user.create({ data: { name: "Tapiwa", email: `tapiwa-${run}@x.test`, role: "CLERK", companyId: workspace.id } });
    // A record of theirs: the member whose access they removed.
    await prisma.user.update({ where: { id: strangerId }, data: { accessRemovedById: marked.id } });
    await expect(deleteMember(operator, workspace, marked.id, "Added twice")).rejects.toThrow(
      `Tapiwa has records in Chikuru ${run}; remove their access instead.`,
    );
    expect(await prisma.user.count({ where: { id: marked.id } })).toBe(1);
    await prisma.user.update({ where: { id: strangerId }, data: { accessRemovedById: null } });
  });

  it("deletes a member nothing points at, with their own settings, and logs why", async () => {
    const spare = await prisma.user.create({ data: { name: "Spare", email: `spare-${run}@x.test`, role: "CLERK", companyId: workspace.id } });
    await prisma.userDisplayPreference.create({ data: { userId: spare.id } }).catch(() => undefined);
    await deleteMember(operator, workspace, spare.id, "Added by mistake");
    expect(await prisma.user.count({ where: { id: spare.id } })).toBe(0);
    const event = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId: workspace.id, eventType: "operator.member.deleted", entityId: spare.id } });
    expect(event.reason).toBe("Added by mistake");
  });
});

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  accessRecordCsv,
  closeWorkspace,
  deleteWorkspaceForGood,
  reinstateWorkspace,
  reopenWorkspace,
  renameWorkspace,
  signEveryoneOut,
  suspendWorkspace,
} from "@/lib/admin/workspace-settings";
import type { SignedInOperator } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";
import { openSignInAs, startSignInAs } from "@/lib/sign-in-as/sessions";

const run = randomUUID().slice(0, 8);
let owner: SignedInOperator;
let workspace: { id: string; name: string; slug: string };
let memberId: string;

beforeAll(async () => {
  const op = await prisma.operator.create({ data: { email: `own-${run}@corelith.test`, name: "Tafadzwa", role: "OWNER" } });
  owner = { sessionId: "o", id: op.id, email: op.email, name: op.name, role: op.role };
  const company = await prisma.company.create({ data: { name: `Kopje ${run}`, slug: `kopje-${run}`, tenantStatus: "ACTIVE" } });
  workspace = { id: company.id, name: company.name, slug: company.slug };
  memberId = (await prisma.user.create({ data: { name: "Brian", email: `brian-${run}@x.test`, role: "SUPERADMIN", companyId: company.id } })).id;
});

afterAll(async () => {
  await prisma.platformAuditEvent.deleteMany({ where: { OR: [{ companyId: workspace.id }, { entityId: workspace.id }] } });
  await prisma.operator.deleteMany({ where: { id: owner.id } });
});

describe("a workspace's settings", () => {
  it("renames within limits", async () => {
    await expect(renameWorkspace(owner, workspace, "K")).rejects.toThrow(/2 to 80/);
    await renameWorkspace(owner, workspace, "  Kopje   Scrap Metals ");
    expect((await prisma.company.findUniqueOrThrow({ where: { id: workspace.id } })).name).toBe("Kopje Scrap Metals");
  });

  it("signs everyone out, sign-in-as sessions included, with a reason", async () => {
    const started = await startSignInAs({ operator: owner, workspace, memberId, mode: "LOOK", reason: "Checking the books with Brian" });
    await expect(signEveryoneOut(owner, workspace, "")).rejects.toThrow(/Say why/);
    expect(await signEveryoneOut(owner, workspace, "Phone stolen")).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: memberId } })).sessionsEndedAt).toBeInstanceOf(Date);
    expect(await openSignInAs(started.session.id)).toBeNull();
  });

  it("writes the access record with the sign-in-as sessions and their reasons", async () => {
    const csv = await accessRecordCsv(owner, workspace);
    expect(csv.split("\n")[0]).toBe("When (UTC),Who,How,As,Until,Reason,Session");
    expect(csv).toContain("Checking the books with Brian");
    expect(csv).toContain("Signed in as, look only");
  });

  it("suspends and reinstates an open workspace", async () => {
    await suspendWorkspace(owner, workspace, "Owner asked, travelling");
    expect((await prisma.company.findUniqueOrThrow({ where: { id: workspace.id } })).tenantStatus).toBe("SUSPENDED");
    await expect(suspendWorkspace(owner, workspace, "again")).rejects.toThrow(/not open/);
    await reinstateWorkspace(owner, workspace, "Owner back");
    expect((await prisma.company.findUniqueOrThrow({ where: { id: workspace.id } })).tenantStatus).toBe("ACTIVE");
  });

  it("closes, reopens and closes again, with a reason each time", async () => {
    await expect(deleteWorkspaceForGood(owner, workspace, "Gone")).rejects.toThrow(/Close it first/);
    await closeWorkspace(owner, workspace, "Business closed down");
    await expect(closeWorkspace(owner, workspace, "again")).rejects.toThrow(/already closed/);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: workspace.id } })).tenantStatus).toBe("DISABLED");
    await reopenWorkspace(owner, workspace, "Opened by mistake");
    expect((await prisma.company.findUniqueOrThrow({ where: { id: workspace.id } })).tenantStatus).toBe("ACTIVE");
    await closeWorkspace(owner, workspace, "Business closed down");
  });

  it("deletes a closed workspace for good, keeping the line that says who did it", async () => {
    await deleteWorkspaceForGood(owner, workspace, "Owner asked for their data to be deleted");
    expect(await prisma.company.findUnique({ where: { id: workspace.id } })).toBeNull();
    expect(await prisma.user.count({ where: { companyId: workspace.id } })).toBe(0);
    const line = await prisma.platformAuditEvent.findFirst({ where: { eventType: "operator.workspace.deleted", entityId: workspace.id } });
    expect(line?.reason).toBe("Owner asked for their data to be deleted");
  });
});

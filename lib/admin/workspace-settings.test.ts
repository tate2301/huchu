import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  accessRecordCsv,
  closeWorkspace,
  reinstateWorkspace,
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
  await prisma.signInAsSession.deleteMany({ where: { companyId: workspace.id } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId: workspace.id } });
  await prisma.user.deleteMany({ where: { companyId: workspace.id } });
  await prisma.company.delete({ where: { id: workspace.id } });
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

  it("closes only when the address is typed exactly", async () => {
    await expect(closeWorkspace(owner, workspace, "kopje", "Closed down")).rejects.toThrow(/Type kopje-/);
    await closeWorkspace(owner, workspace, workspace.slug.toUpperCase(), "Business closed down");
    expect((await prisma.company.findUniqueOrThrow({ where: { id: workspace.id } })).tenantStatus).toBe("DISABLED");
  });
});

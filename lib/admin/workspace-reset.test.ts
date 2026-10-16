import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { previewWorkspaceReset, resetWorkspaceData } from "@/lib/admin/workspace-reset";
import type { SignedInOperator } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";

/** Deleting a workspace's data from Settings, through the reset engine, keeping the workspace and its owners. */

const run = randomUUID().slice(0, 8);
let owner: SignedInOperator;
let workspace: { id: string; name: string; slug: string };
let ownerUserId: string;
let clerkId: string;

beforeAll(async () => {
  const op = await prisma.operator.create({ data: { email: `reset-${run}@corelith.test`, name: "Tafadzwa", role: "OWNER" } });
  owner = { sessionId: "o", id: op.id, email: op.email, name: op.name, role: op.role };
  const company = await prisma.company.create({ data: { name: `Chegutu Mine ${run}`, slug: `chegutu-${run}`, tenantStatus: "ACTIVE" } });
  workspace = { id: company.id, name: company.name, slug: company.slug };
  ownerUserId = (await prisma.user.create({ data: { name: "Brian", email: `brian-${run}@x.test`, role: "SUPERADMIN", companyId: company.id } })).id;
  clerkId = (await prisma.user.create({ data: { name: "Chipo", email: `chipo-${run}@x.test`, role: "CLERK", companyId: company.id } })).id;
  await prisma.site.create({ data: { companyId: company.id, name: "Main Shaft", code: "SITE-0001" } });
});

afterAll(async () => {
  await prisma.platformAuditEvent.deleteMany({ where: { companyId: workspace.id } });
  await prisma.site.deleteMany({ where: { companyId: workspace.id } });
  await prisma.user.deleteMany({ where: { companyId: workspace.id } });
  await prisma.company.deleteMany({ where: { id: workspace.id } });
  await prisma.operator.deleteMany({ where: { id: owner.id } });
});

// Each case reads every company-scoped table and foreign key in the schema, which takes
// seconds on a busy machine; the default 5s is too tight for that.
describe("deleting a workspace's data", { timeout: 30_000 }, () => {
  it("previews the groups and tables that hold its rows, and what it keeps", async () => {
    const preview = await previewWorkspaceReset(workspace);
    expect(preview.confirmation).toBe(`RESET ${workspace.slug}`);
    expect(preview.owners).toBe(1);
    const ids = preview.groups.map((group) => group.id);
    expect(ids).toEqual(expect.arrayContaining(["people-access", "sites-structure"]));
    expect(preview.tables.find((table) => table.table === "Site")).toMatchObject({ group: "sites-structure", rows: 1 });
    expect(preview.keeps.length).toBeGreaterThan(0);
  });

  it("asks for a reason, a choice and the typed words", async () => {
    await expect(resetWorkspaceData(owner, workspace, { groupIds: ["sites-structure"], typed: `RESET ${workspace.slug}`, reason: "" })).rejects.toThrow(/Say why/);
    await expect(resetWorkspaceData(owner, workspace, { groupIds: [], typed: `RESET ${workspace.slug}`, reason: "Fresh start" })).rejects.toThrow(/Choose what/);
    await expect(resetWorkspaceData(owner, workspace, { groupIds: ["sites-structure"], typed: "reset", reason: "Fresh start" })).rejects.toThrow(
      /RESET/,
    );
    expect(await prisma.site.count({ where: { companyId: workspace.id } })).toBe(1);
  });

  it("deletes only the groups chosen, keeps the owners, and names the operator on its audit line", async () => {
    const done = await resetWorkspaceData(owner, workspace, {
      groupIds: ["sites-structure"],
      typed: `RESET ${workspace.slug}`,
      reason: "Owner asked to start the sites again",
    });
    expect(done.rows).toBeGreaterThanOrEqual(1);
    expect(await prisma.site.count({ where: { companyId: workspace.id } })).toBe(0);
    expect(await prisma.user.count({ where: { id: { in: [ownerUserId, clerkId] } } })).toBe(2);

    await resetWorkspaceData(owner, workspace, { groupIds: ["people-access"], typed: `RESET ${workspace.slug}`, reason: "Owner asked to start again" });
    expect(await prisma.user.findUnique({ where: { id: clerkId } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: ownerUserId } })).not.toBeNull();
    const line = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId: workspace.id, eventType: "ORG_RESET_WORKSPACE" } });
    expect(line.actor).toBe(`operator:${owner.id}`);
  });
});

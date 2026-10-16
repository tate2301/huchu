import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bundleState, featureFacts, featureRows } from "@/lib/admin/features";
import { addVertical, applyVerticalFeatures, removeVertical } from "@/lib/admin/verticals";
import type { SignedInOperator } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";

const run = randomUUID().slice(0, 8);
let operator: SignedInOperator;
let workspace: { id: string; name: string };

async function feature(key: string) {
  return featureRows(await featureFacts(workspace.id)).find((candidate) => candidate.key === key)!;
}

beforeAll(async () => {
  const op = await prisma.operator.create({ data: { email: `vert-${run}@corelith.test`, name: "Farai", role: "SUPPORT" } });
  operator = { sessionId: "v", id: op.id, email: op.email, name: op.name, role: op.role };
  const company = await prisma.company.create({ data: { name: `Chegutu Traders ${run}`, slug: `chegutu-${run}`, tenantStatus: "ACTIVE" } });
  workspace = { id: company.id, name: company.name };
  await prisma.companyVertical.create({ data: { companyId: company.id, vertical: "RETAIL" } });
  await applyVerticalFeatures(company.id, "RETAIL");
}, 60_000);

afterAll(async () => {
  await prisma.platformAuditEvent.deleteMany({ where: { companyId: workspace.id } });
  await prisma.company.delete({ where: { id: workspace.id } });
  await prisma.operator.deleteMany({ where: { id: operator.id } });
});

describe("a workspace's verticals", () => {
  it("adds a vertical and turns its features on", async () => {
    await addVertical(operator, workspace, "GOLD");
    expect(await prisma.companyVertical.count({ where: { companyId: workspace.id } })).toBe(2);
    const facts = await featureFacts(workspace.id);
    expect(bundleState(facts, "ADDON_GOLD_CORE")).toBe("Included");
    expect(featureRows(facts).find((row) => row.key === "gold.home")).toMatchObject({ on: true, source: "Vertical" });
    const line = await prisma.platformAuditEvent.findFirst({ where: { companyId: workspace.id, eventType: "operator.features.vertical_added" } });
    expect(line?.entityId).toBe("GOLD");
    await expect(addVertical(operator, workspace, "GOLD")).rejects.toThrow(/has Gold operations already/);
  });

  it("removes a vertical, turning off what only it brought and keeping what another still carries", async () => {
    await removeVertical(operator, workspace, "GOLD", "Mine sold");
    expect(await prisma.companyVertical.count({ where: { companyId: workspace.id } })).toBe(1);
    const facts = await featureFacts(workspace.id);
    expect(bundleState(facts, "ADDON_GOLD_CORE")).toBe("Off");
    // Off, and as Retail says: it keeps gold out.
    expect(featureRows(facts).find((row) => row.key === "gold.home")).toMatchObject({ on: false, source: "Vertical", reason: "Not part of Retail" });
    const flag = await prisma.companyFeatureFlag.findFirst({ where: { companyId: workspace.id, feature: { key: "gold.home" } } });
    expect(flag).toMatchObject({ isEnabled: false, reason: "Came with Gold operations, which was removed" });
    // Stores Core comes with Retail too.
    expect(await feature("stores.inventory")).toMatchObject({ on: true, source: "Vertical" });
    expect(await feature("retail.pos")).toMatchObject({ on: true });
    // The company's own records are not touched.
    expect(await prisma.company.findUnique({ where: { id: workspace.id } })).not.toBeNull();
  });

  it("keeps at least one vertical", async () => {
    await expect(removeVertical(operator, workspace, "RETAIL")).rejects.toThrow(/only vertical/);
    await expect(removeVertical(operator, workspace, "GOLD")).rejects.toThrow(/does not have/);
  });
});

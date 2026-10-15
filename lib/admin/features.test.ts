import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bundleState, featureFacts, featureRows, resetFeature, setBundle, switchFeature } from "@/lib/admin/features";
import { applyVerticalFeatures } from "@/lib/admin/verticals";
import type { SignedInOperator } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";

const run = randomUUID().slice(0, 8);
let operator: SignedInOperator;
let workspace: { id: string; name: string };

async function row(key: string) {
  return featureRows(await featureFacts(workspace.id)).find((candidate) => candidate.key === key)!;
}

beforeAll(async () => {
  const op = await prisma.operator.create({ data: { email: `feat-${run}@corelith.test`, name: "Nyasha", role: "SUPPORT" } });
  operator = { sessionId: "f", id: op.id, email: op.email, name: op.name, role: op.role };
  const company = await prisma.company.create({ data: { name: `Mbare Shop ${run}`, slug: `mbare-${run}`, tenantStatus: "ACTIVE" } });
  workspace = { id: company.id, name: company.name };
  await prisma.companyVertical.create({ data: { companyId: company.id, vertical: "RETAIL" } });
  await applyVerticalFeatures(company.id, "RETAIL");
}, 60_000);

afterAll(async () => {
  await prisma.platformAuditEvent.deleteMany({ where: { companyId: workspace.id } });
  await prisma.company.delete({ where: { id: workspace.id } });
  await prisma.operator.deleteMany({ where: { id: operator.id } });
});

describe("a workspace's features", () => {
  it("says a vertical's feature is on because of the vertical", async () => {
    const pos = await row("retail.pos");
    expect(pos).toMatchObject({ on: true, source: "Vertical", reason: "Comes with Retail", switched: false });
  });

  it("switches a feature off by hand, with a reason", async () => {
    await expect(switchFeature(operator, workspace, "retail.pos", false, " ")).rejects.toThrow(/Say why/);
    await switchFeature(operator, workspace, "retail.pos", false, "Owner asked, no tills yet");
    expect(await row("retail.pos")).toMatchObject({ on: false, source: "Switched off", reason: "Owner asked, no tills yet", switched: true });
    const line = await prisma.platformAuditEvent.findFirst({ where: { companyId: workspace.id, eventType: "operator.features.switched_off" } });
    expect(line?.reason).toBe("Owner asked, no tills yet");
  });

  it("goes back to what its verticals say", async () => {
    await resetFeature(operator, workspace, "retail.pos");
    expect(await row("retail.pos")).toMatchObject({ on: true, source: "Vertical", switched: false });
    await expect(resetFeature(operator, workspace, "retail.pos")).rejects.toThrow(/already as its verticals say/);
  });

  it("switches on a feature nothing carries, and says so", async () => {
    await switchFeature(operator, workspace, "gold.home", true, undefined);
    expect(await row("gold.home")).toMatchObject({ on: true, source: "Switched on", switched: true });
    await expect(switchFeature(operator, workspace, "not.a.feature", true, undefined)).rejects.toThrow(/not in the catalogue/);
  });

  it("keeps a feature the vertical keeps out off when set back", async () => {
    await switchFeature(operator, workspace, "gold.dispatches", true, undefined);
    await resetFeature(operator, workspace, "gold.dispatches");
    expect(await row("gold.dispatches")).toMatchObject({ on: false, source: "Vertical", reason: "Not part of Retail" });
  });
});

describe("a workspace's bundles", () => {
  it("will not turn off a bundle its vertical brings", async () => {
    expect(bundleState(await featureFacts(workspace.id), "ADDON_RETAIL_SUITE")).toBe("Included");
    await expect(setBundle(operator, workspace, "ADDON_RETAIL_SUITE", false)).rejects.toThrow(/comes with Retail/);
  });

  it("turns a bundle on with the bundles it needs", async () => {
    await setBundle(operator, workspace, "ADDON_GOLD_ADVANCED", true);
    const facts = await featureFacts(workspace.id);
    expect(bundleState(facts, "ADDON_GOLD_ADVANCED")).toBe("On");
    expect(bundleState(facts, "ADDON_GOLD_CORE")).toBe("On");
    expect(featureRows(facts).find((feature) => feature.key === "gold.reconciliation")).toMatchObject({ on: true, source: "Bundle" });
    await expect(setBundle(operator, workspace, "ADDON_GOLD_ADVANCED", true)).rejects.toThrow(/on already/);
  });

  it("will not turn off a bundle another needs, and turns features off with the bundle", async () => {
    await expect(setBundle(operator, workspace, "ADDON_GOLD_CORE", false)).rejects.toThrow(/Gold Advanced Controls needs it/);
    await setBundle(operator, workspace, "ADDON_GOLD_ADVANCED", false);
    // Off again, as Retail says (it keeps gold out).
    expect(await row("gold.reconciliation")).toMatchObject({ on: false, source: "Vertical", reason: "Not part of Retail" });
    await setBundle(operator, workspace, "ADDON_GOLD_CORE", false);
    expect(bundleState(await featureFacts(workspace.id), "ADDON_GOLD_CORE")).toBe("Off");
  });
});

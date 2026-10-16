import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bundleCodeFrom,
  catalogueBundleRows,
  editFeature,
  saveBundle,
  setBundleActive,
  setFeatureActive,
  syncCatalogue,
  syncWords,
} from "@/lib/admin/catalogue";
import { bundleState, featureFacts, featureRows, setBundle } from "@/lib/admin/features";
import { operatorActor } from "@/lib/operators/audit";
import type { SignedInOperator } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";

const run = randomUUID().slice(0, 8);
const name = `Field kit ${run}`;
const code = bundleCodeFrom(name);
const looseKey = `test.loose-${run}`;
let owner: SignedInOperator;
let workspace: { id: string; name: string };

beforeAll(async () => {
  const op = await prisma.operator.create({ data: { email: `cat-${run}@corelith.test`, name: "Tendai", role: "OWNER" } });
  owner = { sessionId: "c", id: op.id, email: op.email, name: op.name, role: op.role };
  const company = await prisma.company.create({ data: { name: `Gweru Fitters ${run}`, slug: `gweru-${run}`, tenantStatus: "ACTIVE" } });
  workspace = { id: company.id, name: company.name };
  await prisma.companyVertical.create({ data: { companyId: company.id, vertical: "WORKSHOP" } });
  await prisma.platformFeature.create({ data: { key: looseKey, name: "Loose feature", domain: "core" } });
}, 60_000);

afterAll(async () => {
  await prisma.platformAuditEvent.deleteMany({ where: { OR: [{ companyId: workspace.id }, { actor: operatorActor(owner.id) }] } });
  await prisma.company.delete({ where: { id: workspace.id } });
  await prisma.featureBundle.deleteMany({ where: { code } });
  await prisma.platformFeature.deleteMany({ where: { key: looseKey } });
  await prisma.operator.deleteMany({ where: { id: owner.id } });
});

describe("the catalogue", () => {
  it("syncs from code and says what was new", async () => {
    const outcome = await syncCatalogue(owner);
    expect(outcome.features).toBeGreaterThan(100);
    expect(outcome.newBundles).toBeGreaterThanOrEqual(0);
    expect(syncWords({ ...outcome, newFeatures: 0, newBundles: 0, newItems: 0 })).toMatch(/Nothing was new/);
    expect(syncWords({ ...outcome, newFeatures: 2, newBundles: 1, newItems: 0 })).toMatch(/2 new features, 1 new bundle\./);
  }, 60_000);

  it("makes a bundle, and edits which features it carries", async () => {
    await expect(saveBundle(owner, { name, featureKeys: [] })).rejects.toThrow(/at least one/);
    expect(await saveBundle(owner, { name, featureKeys: ["gold.home", "gold.dispatches"] })).toEqual({ code, created: true });
    await expect(saveBundle(owner, { name, featureKeys: ["gold.home"] })).rejects.toThrow(/exists/);
    await saveBundle(owner, { code, name, description: "For fitters on site", featureKeys: ["gold.home"] });
    const rows = await catalogueBundleRows();
    expect(rows.find((row) => row.code === code)).toMatchObject({ features: 1, inCode: false, isActive: true, workspaces: 0 });
    expect(rows.find((row) => row.code === "ADDON_MAINTENANCE_PRO")?.workspaces).toBeGreaterThanOrEqual(1);
  });

  it("will not edit what the code defines", async () => {
    await expect(saveBundle(owner, { code: "ADDON_GOLD_CORE", name: "Gold", featureKeys: ["gold.home"] })).rejects.toThrow(/defined in code/);
    await expect(setBundleActive(owner, "ADDON_GOLD_CORE", false)).rejects.toThrow(/defined in code/);
    await expect(setFeatureActive(owner, "gold.home", false)).rejects.toThrow(/defined in code/);
  });

  it("edits and retires a feature made outside the code", async () => {
    await expect(editFeature(owner, looseKey, { name: "Loose", domain: "Two words", defaultEnabled: false })).rejects.toThrow(/one lower-case word/);
    await editFeature(owner, looseKey, { name: "Loose one", domain: "core", defaultEnabled: true });
    await setFeatureActive(owner, looseKey, false);
    expect(await prisma.platformFeature.findUniqueOrThrow({ where: { key: looseKey } })).toMatchObject({ name: "Loose one", isActive: false });
  });

  it("turns a bundle made here on in a workspace, and retires it", async () => {
    await setBundle(owner, workspace, code, true);
    const facts = await featureFacts(workspace.id);
    expect(bundleState(facts, code)).toBe("On");
    expect(featureRows(facts).find((row) => row.key === "gold.home")).toMatchObject({ on: true, source: "Bundle" });
    await setBundleActive(owner, code, false);
    await setBundle(owner, workspace, code, false);
    await expect(setBundle(owner, workspace, code, true)).rejects.toThrow(/retired/);
  });
});

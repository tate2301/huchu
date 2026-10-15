import type { Vertical } from "@prisma/client";

import { catalogueBundles, grantBundle, switchOffUncarried, verticalBundleCodes } from "@/lib/admin/features";
import { AdminRefusal } from "@/lib/admin/refusal";
import { recordOperatorEvent } from "@/lib/operators/audit";
import type { SignedInOperator } from "@/lib/operators/guards";
import { getClientTemplateDefinition } from "@/lib/platform/client-templates";
import { repriceCompany } from "@/lib/platform/entitlements";
import { normalizeFeatureKey } from "@/lib/platform/gating/catalog-utils";
import { VERTICAL_ORDER, VERTICALS } from "@/lib/platform/verticals";
import { prisma } from "@/lib/prisma";

/**
 * A workspace's verticals: the lines of business it pays for. Adding one
 * turns on what its client template carries; removing one stops its charge
 * and turns off what only it brought. The data stays either way.
 */

type Workspace = { id: string; name: string };

export function isVertical(value: string): value is Vertical {
  return (VERTICAL_ORDER as readonly string[]).includes(value);
}

/** Every feature a vertical's template switches on: its bundles' and its own. */
async function verticalFeatureKeys(vertical: Vertical): Promise<string[]> {
  const bundles = new Map((await catalogueBundles()).map((bundle) => [bundle.code, bundle.features]));
  const keys = verticalBundleCodes(vertical).flatMap((code) => bundles.get(code) ?? []);
  const template = getClientTemplateDefinition(VERTICALS[vertical].templateCode);
  return [...new Set([...keys, ...(template?.featureKeys ?? []).map(normalizeFeatureKey)])];
}

/**
 * Turns a vertical's features on in a workspace: every bundle of its client
 * template granted (add-on row and features switched on, over any off a
 * template left), and the template's own features switched on. No row, no
 * audit line, no repricing: the caller does those. Safe to run again.
 */
export async function applyVerticalFeatures(companyId: string, vertical: Vertical): Promise<{ bundles: string[] }> {
  const label = VERTICALS[vertical].label;
  const reason = `Comes with ${label}`;
  const bundles = verticalBundleCodes(vertical);
  for (const code of bundles) await grantBundle(companyId, code, reason);
  const own = (getClientTemplateDefinition(VERTICALS[vertical].templateCode)?.featureKeys ?? []).map(normalizeFeatureKey);
  if (own.length) {
    const features = await prisma.platformFeature.findMany({ where: { key: { in: own } }, select: { id: true } });
    for (const feature of features) {
      await prisma.companyFeatureFlag.upsert({
        where: { companyId_featureId: { companyId, featureId: feature.id } },
        update: { isEnabled: true, reason, expiresAt: null },
        create: { companyId, featureId: feature.id, isEnabled: true, reason },
      });
    }
  }
  return { bundles };
}

export async function addVertical(operator: SignedInOperator, workspace: Workspace, vertical: Vertical) {
  const label = VERTICALS[vertical].label;
  const held = await prisma.companyVertical.findUnique({ where: { companyId_vertical: { companyId: workspace.id, vertical } } });
  if (held) throw new AdminRefusal(`It has ${label} already.`);
  await prisma.companyVertical.create({ data: { companyId: workspace.id, vertical } });
  const { bundles } = await applyVerticalFeatures(workspace.id, vertical);
  await recordOperatorEvent({
    operatorId: operator.id,
    companyId: workspace.id,
    eventType: "operator.features.vertical_added",
    entityType: "vertical",
    entityId: vertical,
    payload: { vertical: label, bundles },
  });
  await repriceCompany(workspace.id);
}

/**
 * Removes a vertical: its charge stops, the bundles only it brought go off,
 * and the features nothing else still carries are switched off. A workspace
 * keeps at least one vertical. Its records are kept.
 */
export async function removeVertical(operator: SignedInOperator, workspace: Workspace, vertical: Vertical, reason?: string) {
  const label = VERTICALS[vertical].label;
  const rows = await prisma.companyVertical.findMany({ where: { companyId: workspace.id }, select: { vertical: true } });
  if (!rows.some((row) => row.vertical === vertical)) throw new AdminRefusal(`It does not have ${label}.`);
  if (rows.length === 1) throw new AdminRefusal(`${label} is its only vertical. Add another first; a workspace keeps at least one.`);

  const kept = new Set(rows.filter((row) => row.vertical !== vertical).flatMap((row) => verticalBundleCodes(row.vertical)));
  const leaving = verticalBundleCodes(vertical).filter((code) => !kept.has(code));
  const why = `${label} removed by ${operator.name}`;

  await prisma.companyVertical.delete({ where: { companyId_vertical: { companyId: workspace.id, vertical } } });
  const bundleRows = await prisma.featureBundle.findMany({ where: { code: { in: leaving } }, select: { id: true } });
  await prisma.companySubscriptionAddon.updateMany({
    where: { companyId: workspace.id, bundleId: { in: bundleRows.map((row) => row.id) } },
    data: { isEnabled: false, reason: why },
  });
  const off = await switchOffUncarried(workspace.id, await verticalFeatureKeys(vertical), `Came with ${label}, which was removed`);

  await recordOperatorEvent({
    operatorId: operator.id,
    companyId: workspace.id,
    eventType: "operator.features.vertical_removed",
    entityType: "vertical",
    entityId: vertical,
    reason: reason?.trim() || undefined,
    payload: { vertical: label, bundlesOff: leaving, featuresOff: off },
  });
  await repriceCompany(workspace.id);
}

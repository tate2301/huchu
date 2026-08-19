import "dotenv/config";

import type { WorkspaceProfile } from "@prisma/client";

import { getCompanyFeatureMap } from "@/lib/platform/entitlements";
import { getBundleDefinition, getTierDefinition } from "@/lib/platform/feature-catalog";
import { isKnownFeatureKey, normalizeFeatureKey } from "@/lib/platform/gating/catalog-utils";
import { prisma } from "@/lib/prisma";

/**
 * ST-0.1 — tenant usage audit for every feature slated for removal.
 *
 * Answers two questions per dropped/parked module, per tenant:
 *   1. Is the module *entitled* — granted by the tier, by a paid addon bundle,
 *      or by an explicit `CompanyFeatureFlag`?
 *   2. Is there *data* — how many rows sit in the module's own tables?
 *
 * Those are independent signals and both matter. A tenant with the bundle and
 * no rows is a billing conversation; a tenant with rows and no bundle is data
 * that a schema drop would destroy silently (master plan risk #16). Row counts
 * are therefore taken for every company, not only entitled ones.
 *
 * Read-only. Warn-only: it always exits 0 so it can run in a pipeline ahead of
 * the export story (ST-0.2) without gating it.
 *
 *   pnpm rollout:audit-usage
 *   pnpm rollout:audit-usage --json > audit.json
 *   pnpm rollout:audit-usage --company-id <uuid> --all
 */

type Disposition = "DROP" | "DELETE";

interface ModuleTable {
  /** Model name exactly as it reads in `prisma/schema.prisma`. */
  model: string;
  /** Rows belonging to one company, via companyId or the nearest scoped parent. */
  countForCompany: (companyId: string) => Promise<number>;
  /** Rows in the whole table, so unattributable rows cannot hide. */
  countAll: () => Promise<number>;
}

interface AuditModule {
  id: string;
  label: string;
  disposition: Disposition;
  /** Scope-trim stories that act on this module. */
  stories: string[];
  bundleCodes: string[];
  featureKeys: string[];
  workspaceProfiles: WorkspaceProfile[];
  tables: ModuleTable[];
}

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  tenantStatus: string;
  workspaceProfile: WorkspaceProfile;
}

interface CompanyEntitlements {
  planCode: string | null;
  tierCode: string | null;
  /** Addon bundles the tenant has switched on. */
  addonBundleCodes: string[];
  /** Bundles the tenant's tier includes. */
  tierBundleCodes: string[];
  /** Feature keys with an explicit, unexpired, enabled CompanyFeatureFlag row. */
  explicitFlagKeys: string[];
  /** Effective feature map, i.e. what the gate would actually answer today. */
  enabledFeatureKeys: Set<string>;
}

interface TenantFinding {
  companyId: string;
  name: string;
  slug: string;
  tenantStatus: string;
  workspaceProfile: WorkspaceProfile;
  workspaceProfileMatch: boolean;
  grantedBundles: string[];
  explicitFlags: string[];
  enabledFeatures: string[];
  rowCounts: Record<string, number>;
  totalRows: number;
  entitled: boolean;
  hasData: boolean;
}

interface TableFinding {
  model: string;
  totalRows: number;
  attributedRows: number;
  unattributedRows: number;
}

interface ModuleFinding {
  id: string;
  label: string;
  disposition: Disposition;
  stories: string[];
  bundleCodes: string[];
  featureKeys: string[];
  featureKeysMissingFromCatalog: string[];
  tables: TableFinding[];
  tenants: TenantFinding[];
  totals: {
    tenantsEntitled: number;
    tenantsWithData: number;
    rows: number;
  };
}

interface AuditReport {
  generatedAt: string;
  companyCount: number;
  companyIdFilter: string | null;
  modules: ModuleFinding[];
}

function parseArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function distinct(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function table(
  model: string,
  countForCompany: (companyId: string) => Promise<number>,
  countAll: () => Promise<number>,
): ModuleTable {
  return { model, countForCompany, countAll };
}

/**
 * A table this audit is about to see deleted, counted through raw SQL.
 *
 * ST-3 removes these models from `prisma/schema.prisma`, so `prisma.nVR` and
 * its siblings stop existing the moment the client is regenerated. The audit is
 * the tool an operator reaches for when deciding whether a drop is safe, and it
 * has to keep working against a database that has not been migrated yet — which
 * is the only database on which those counts are anything but zero. Raw SQL is
 * what lets it outlive the schema it reports on.
 *
 * `to_regclass` returning NULL means the table is already gone on this
 * database, which is a count of zero and not a failure: a migrated environment
 * must still produce a complete report rather than aborting on its first
 * dropped module.
 *
 * `$queryRawUnsafe` is safe here because nothing user-supplied reaches the SQL
 * text: `model` and `whereSql` are literals in this file, and the company id is
 * bound as `$1`.
 */
async function countDropped(model: string, whereSql: string, params: unknown[]) {
  const [{ present }] = await prisma.$queryRawUnsafe<{ present: boolean }[]>(
    `SELECT to_regclass($1) IS NOT NULL AS present`,
    `public."${model}"`,
  );
  if (!present) return 0;
  const [{ count }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*)::bigint AS count FROM "${model}" t${whereSql ? ` WHERE ${whereSql}` : ""}`,
    ...params,
  );
  return Number(count);
}

/** A dropped table, wired into the module list the same way `table` is. */
function droppedTable(model: string, whereSql: string): ModuleTable {
  return table(
    model,
    (companyId) => countDropped(model, whereSql, [companyId]),
    () => countDropped(model, "", []),
  );
}

/** Rows scoped to a company only through the site they were installed at. */
const SITE_OF_COMPANY = `(SELECT s."id" FROM "Site" s WHERE s."companyId" = $1)`;
const CAMERA_OF_COMPANY = `(SELECT c."id" FROM "Camera" c WHERE c."siteId" IN ${SITE_OF_COMPANY})`;
const OWN_COMPANY = `t."companyId" = $1`;

/**
 * The removal set, straight from `docs/rollout/scope-trim-roadmap.md`.
 *
 * `lib/commodity-billing.ts` is deliberately absent: it is gold billing, not
 * scrap-metal code, and it stays.
 */
const AUDIT_MODULES: AuditModule[] = [
  {
    id: "cctv",
    label: "CCTV",
    disposition: "DROP",
    stories: ["ST-1.1", "ST-2.1", "ST-3.1"],
    bundleCodes: ["ADDON_CCTV_SUITE"],
    featureKeys: [
      "cctv.overview",
      "cctv.live",
      "cctv.cameras",
      "cctv.nvrs",
      "cctv.events",
      "cctv.playback",
      "cctv.access-logs",
      "cctv.streaming-control",
      "reports.cctv-events",
    ],
    workspaceProfiles: [],
    tables: [
      // CCTV hangs off Site, not Company: scope through the site.
      droppedTable("NVR", `t."siteId" IN ${SITE_OF_COMPANY}`),
      droppedTable("Camera", `t."siteId" IN ${SITE_OF_COMPANY}`),
      droppedTable(
        "CCTVEvent",
        `(t."nvrId" IN (SELECT n."id" FROM "NVR" n WHERE n."siteId" IN ${SITE_OF_COMPANY})
          OR t."cameraId" IN ${CAMERA_OF_COMPANY})`,
      ),
      droppedTable("CameraAccessLog", `t."cameraId" IN ${CAMERA_OF_COMPANY}`),
    ],
  },
  {
    id: "autos",
    label: "Autos / car sales",
    disposition: "DROP",
    stories: ["ST-1.1", "ST-2.2", "ST-2.5", "ST-3.1"],
    bundleCodes: ["ADDON_AUTOS_SUITE"],
    featureKeys: [
      "autos.core",
      "autos.inventory",
      "autos.leads",
      "autos.deals",
      "autos.financing",
      "portal.autos",
    ],
    workspaceProfiles: ["AUTOS"],
    tables: [
      droppedTable("CarSalesVehicle", OWN_COMPANY),
      droppedTable("CarSalesLead", OWN_COMPANY),
      droppedTable("CarSalesDeal", OWN_COMPANY),
      droppedTable("CarSalesPayment", OWN_COMPANY),
    ],
  },
  {
    id: "scrap-metal",
    label: "Scrap metal",
    disposition: "DROP",
    stories: ["ST-1.1", "ST-2.3", "ST-2.5", "ST-3.1", "ST-3.3"],
    bundleCodes: ["ADDON_SCRAP_METAL_SUITE"],
    featureKeys: [
      "scrap-metal.home",
      "scrap-metal.purchases",
      "scrap-metal.batches",
      "scrap-metal.sales",
      "scrap-metal.pricing",
      // Ships in ADDON_SETTLEMENTS, which survives; listed so the scrap-shaped
      // half of the settlements surface is not dropped or kept blind.
      "settlements.scrap",
    ],
    workspaceProfiles: ["SCRAP_METAL"],
    tables: [
      droppedTable("ScrapMaterial", OWN_COMPANY),
      droppedTable("ScrapSellerProfile", OWN_COMPANY),
      droppedTable("ScrapMetalPrice", OWN_COMPANY),
      droppedTable("ScrapMetalPurchase", OWN_COMPANY),
      droppedTable("ScrapMetalBatch", OWN_COMPANY),
      droppedTable(
        "ScrapMetalBatchItem",
        `t."batchId" IN (SELECT b."id" FROM "ScrapMetalBatch" b WHERE b."companyId" = $1)`,
      ),
      droppedTable("ScrapMetalSale", OWN_COMPANY),
      droppedTable("ScrapMetalEmployeeBalance", OWN_COMPANY),
      droppedTable("ScrapMetalBalanceEntry", OWN_COMPANY),
      droppedTable("ScrapTicketComplianceRule", OWN_COMPANY),
    ],
  },
  {
    id: "accounting-fixed-assets",
    label: "Accounting — fixed assets",
    disposition: "DELETE",
    stories: ["ST-2.4", "ST-3.2", "ST-3.4"],
    // ADDON_ACCOUNTING_ADVANCED also grants features that survive the trim, so
    // a bundle hit here is not on its own a reason to keep fixed assets.
    bundleCodes: ["ADDON_ACCOUNTING_ADVANCED"],
    featureKeys: ["accounting.fixed-assets"],
    workspaceProfiles: [],
    tables: [
      droppedTable("FixedAsset", OWN_COMPANY),
    ],
  },
  {
    id: "accounting-budgets",
    label: "Accounting — budgets",
    disposition: "DELETE",
    stories: ["ST-2.4", "ST-3.2", "ST-3.4"],
    bundleCodes: ["ADDON_ACCOUNTING_ADVANCED"],
    featureKeys: ["accounting.budgets"],
    workspaceProfiles: [],
    tables: [
      droppedTable("Budget", OWN_COMPANY),
      droppedTable("BudgetLine", OWN_COMPANY),
    ],
  },
];

async function loadCompanies(companyIdFilter: string | undefined): Promise<CompanyRow[]> {
  return prisma.company.findMany({
    where: companyIdFilter ? { id: companyIdFilter } : undefined,
    select: {
      id: true,
      name: true,
      slug: true,
      tenantStatus: true,
      workspaceProfile: true,
    },
    orderBy: [{ slug: "asc" }],
  });
}

async function loadEntitlements(companies: CompanyRow[]): Promise<Map<string, CompanyEntitlements>> {
  const result = new Map<string, CompanyEntitlements>();
  if (companies.length === 0) return result;

  const companyIds = companies.map((company) => company.id);

  const [addons, flags, subscriptions] = await Promise.all([
    prisma.companySubscriptionAddon.findMany({
      where: { companyId: { in: companyIds }, isEnabled: true },
      select: { companyId: true, bundle: { select: { code: true } } },
    }),
    prisma.companyFeatureFlag.findMany({
      where: {
        companyId: { in: companyIds },
        isEnabled: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { companyId: true, feature: { select: { key: true } } },
    }),
    // Same selection rule as `getCompanyFeatureMap`: the most recently updated
    // subscription row is the one that decides the tier.
    prisma.companySubscription.findMany({
      where: { companyId: { in: companyIds } },
      select: { companyId: true, updatedAt: true, plan: { select: { code: true } } },
      orderBy: [{ updatedAt: "desc" }],
    }),
  ]);

  const addonsByCompany = new Map<string, string[]>();
  for (const addon of addons) {
    const codes = addonsByCompany.get(addon.companyId) ?? [];
    codes.push(addon.bundle.code.trim().toUpperCase());
    addonsByCompany.set(addon.companyId, codes);
  }

  const flagsByCompany = new Map<string, string[]>();
  for (const flag of flags) {
    const keys = flagsByCompany.get(flag.companyId) ?? [];
    keys.push(normalizeFeatureKey(flag.feature.key));
    flagsByCompany.set(flag.companyId, keys);
  }

  const planCodeByCompany = new Map<string, string>();
  for (const subscription of subscriptions) {
    if (planCodeByCompany.has(subscription.companyId)) continue;
    planCodeByCompany.set(subscription.companyId, subscription.plan.code);
  }

  for (const company of companies) {
    const planCode = planCodeByCompany.get(company.id) ?? null;
    const tier = getTierDefinition(planCode);
    const featureMap = await getCompanyFeatureMap(company.id);

    result.set(company.id, {
      planCode,
      tierCode: tier?.code ?? null,
      addonBundleCodes: distinct(addonsByCompany.get(company.id) ?? []),
      tierBundleCodes: distinct(tier?.includedBundles ?? []),
      explicitFlagKeys: distinct(flagsByCompany.get(company.id) ?? []),
      enabledFeatureKeys: new Set(Object.keys(featureMap).filter((key) => featureMap[key])),
    });
  }

  return result;
}

async function auditModule(
  auditedModule: AuditModule,
  companies: CompanyRow[],
  entitlements: Map<string, CompanyEntitlements>,
): Promise<ModuleFinding> {
  const moduleFeatureKeys = auditedModule.featureKeys.map((key) => normalizeFeatureKey(key));
  const tenants: TenantFinding[] = [];
  const attributedByModel = new Map<string, number>(
    auditedModule.tables.map((moduleTable) => [moduleTable.model, 0]),
  );

  for (const company of companies) {
    const entitlement = entitlements.get(company.id);
    const counts = await Promise.all(
      auditedModule.tables.map((moduleTable) => moduleTable.countForCompany(company.id)),
    );

    const rowCounts: Record<string, number> = {};
    auditedModule.tables.forEach((moduleTable, index) => {
      rowCounts[moduleTable.model] = counts[index];
      attributedByModel.set(moduleTable.model, (attributedByModel.get(moduleTable.model) ?? 0) + counts[index]);
    });
    const totalRows = counts.reduce((sum, value) => sum + value, 0);

    const grantedBundles = distinct(
      [...(entitlement?.addonBundleCodes ?? []), ...(entitlement?.tierBundleCodes ?? [])].filter((code) =>
        auditedModule.bundleCodes.includes(code),
      ),
    );
    const explicitFlags = distinct(
      (entitlement?.explicitFlagKeys ?? []).filter((key) => moduleFeatureKeys.includes(key)),
    );
    const enabledFeatures = moduleFeatureKeys.filter((key) => entitlement?.enabledFeatureKeys.has(key));
    const workspaceProfileMatch = auditedModule.workspaceProfiles.includes(company.workspaceProfile);

    const entitled =
      grantedBundles.length > 0 || explicitFlags.length > 0 || enabledFeatures.length > 0;

    tenants.push({
      companyId: company.id,
      name: company.name,
      slug: company.slug,
      tenantStatus: company.tenantStatus,
      workspaceProfile: company.workspaceProfile,
      workspaceProfileMatch,
      grantedBundles,
      explicitFlags,
      enabledFeatures: distinct(enabledFeatures),
      rowCounts,
      totalRows,
      entitled,
      hasData: totalRows > 0,
    });
  }

  const totalsByModel = await Promise.all(
    auditedModule.tables.map((moduleTable) => moduleTable.countAll()),
  );

  const tables: TableFinding[] = auditedModule.tables.map((moduleTable, index) => {
    const totalRows = totalsByModel[index];
    const attributedRows = attributedByModel.get(moduleTable.model) ?? 0;
    return {
      model: moduleTable.model,
      totalRows,
      attributedRows,
      // Only meaningful on a full run; a --company-id run attributes one tenant.
      unattributedRows: Math.max(0, totalRows - attributedRows),
    };
  });

  return {
    id: auditedModule.id,
    label: auditedModule.label,
    disposition: auditedModule.disposition,
    stories: auditedModule.stories,
    bundleCodes: auditedModule.bundleCodes,
    featureKeys: moduleFeatureKeys,
    featureKeysMissingFromCatalog: moduleFeatureKeys.filter((key) => !isKnownFeatureKey(key)),
    tables,
    tenants,
    totals: {
      tenantsEntitled: tenants.filter((tenant) => tenant.entitled).length,
      tenantsWithData: tenants.filter((tenant) => tenant.hasData).length,
      rows: tables.reduce((sum, tableFinding) => sum + tableFinding.totalRows, 0),
    },
  };
}

function renderTable(headers: string[], rows: string[][]) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? "").length)),
  );
  const line = (cells: string[]) =>
    cells.map((cell, index) => (cell ?? "").padEnd(widths[index])).join("  ").trimEnd();

  console.log(line(headers));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    console.log(line(row));
  }
}

function describeEntitlement(tenant: TenantFinding): string {
  const parts: string[] = [];
  if (tenant.grantedBundles.length > 0) parts.push(`bundle:${tenant.grantedBundles.join("+")}`);
  if (tenant.explicitFlags.length > 0) parts.push(`flag:${tenant.explicitFlags.length}`);
  if (tenant.enabledFeatures.length > 0) parts.push(`enabled:${tenant.enabledFeatures.length}`);
  if (tenant.workspaceProfileMatch) parts.push(`profile:${tenant.workspaceProfile}`);
  return parts.length > 0 ? parts.join(" ") : "none";
}

function printReport(report: AuditReport, showAllTenants: boolean) {
  console.log("Rollout Feature Usage Audit (ST-0.1)");
  console.log("===================================");
  console.log(`Generated: ${report.generatedAt}`);
  console.log(
    `Companies inspected: ${report.companyCount}${report.companyIdFilter ? ` (filtered to ${report.companyIdFilter})` : ""}`,
  );

  if (report.companyCount === 0) {
    console.log("\nNo companies found. Nothing is at risk from a drop on this database.");
  }

  for (const moduleFinding of report.modules) {
    console.log("");
    console.log(`## ${moduleFinding.label} — ${moduleFinding.disposition}`);
    console.log(`Stories: ${moduleFinding.stories.join(", ")}`);
    console.log(`Bundles: ${moduleFinding.bundleCodes.map(describeBundle).join(", ") || "none"}`);
    console.log(
      `Tenants entitled: ${moduleFinding.totals.tenantsEntitled} · tenants with data: ${moduleFinding.totals.tenantsWithData} · rows: ${moduleFinding.totals.rows}`,
    );
    if (moduleFinding.featureKeysMissingFromCatalog.length > 0) {
      console.log(
        `Note: no longer in FEATURE_CATALOG: ${moduleFinding.featureKeysMissingFromCatalog.join(", ")}`,
      );
    }

    const visibleTenants = showAllTenants
      ? moduleFinding.tenants
      : moduleFinding.tenants.filter((tenant) => tenant.entitled || tenant.hasData || tenant.workspaceProfileMatch);

    if (visibleTenants.length === 0) {
      console.log("Tenants: none entitled and none holding data.");
    } else {
      renderTable(
        ["Tenant", "Slug", "Status", "Profile", "Entitlement", "Rows"],
        visibleTenants.map((tenant) => [
          tenant.name,
          tenant.slug,
          tenant.tenantStatus,
          tenant.workspaceProfile,
          describeEntitlement(tenant),
          String(tenant.totalRows),
        ]),
      );

      for (const tenant of visibleTenants) {
        const nonZero = Object.entries(tenant.rowCounts).filter(([, count]) => count > 0);
        if (nonZero.length === 0) continue;
        console.log(
          `  ${tenant.slug}: ${nonZero.map(([model, count]) => `${model}=${count}`).join(", ")}`,
        );
      }
    }

    const tablesWithRows = moduleFinding.tables.filter(
      (tableFinding) => tableFinding.totalRows > 0 || tableFinding.unattributedRows > 0,
    );
    if (tablesWithRows.length > 0) {
      console.log("");
      renderTable(
        ["Table", "Total rows", "Attributed", "Unattributed"],
        tablesWithRows.map((tableFinding) => [
          tableFinding.model,
          String(tableFinding.totalRows),
          String(tableFinding.attributedRows),
          String(tableFinding.unattributedRows),
        ]),
      );
    } else {
      console.log(`Tables: all ${moduleFinding.tables.length} empty.`);
    }
  }

  console.log("");
  console.log(
    "Read-only audit; exits 0 by design. Nothing is dropped while a tenant is entitled or holds rows until its export story (ST-0.2) is done.",
  );
}

function describeBundle(code: string): string {
  const definition = getBundleDefinition(code);
  return definition ? `${code} (${definition.name})` : `${code} (not in catalog)`;
}

async function main() {
  const asJson = process.argv.includes("--json");
  const showAllTenants = process.argv.includes("--all");
  const companyIdFilter = parseArg("--company-id");

  const companies = await loadCompanies(companyIdFilter);
  const entitlements = await loadEntitlements(companies);

  const modules: ModuleFinding[] = [];
  for (const auditedModule of AUDIT_MODULES) {
    modules.push(await auditModule(auditedModule, companies, entitlements));
  }

  const report: AuditReport = {
    generatedAt: new Date().toISOString(),
    companyCount: companies.length,
    companyIdFilter: companyIdFilter ?? null,
    modules,
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printReport(report, showAllTenants);
}

main()
  .catch((error) => {
    console.error("[rollout/audit-feature-usage] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

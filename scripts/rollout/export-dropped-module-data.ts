import "dotenv/config";

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";

/**
 * ST-0.2 — per-tenant export of every dropped module's data, taken BEFORE the
 * schema drop in ST-3.
 *
 * This script is the undo for an irreversible step. ST-2 (code deletion) and
 * ST-3 (schema deletion) are blocked on it: once the tables are gone the rows
 * cannot be recovered from the application, only from a database backup, and a
 * backup is not something an operator can hand back to one tenant.
 *
 * Three properties matter more than tidiness here:
 *   1. Completeness — every row of every table the drop migration will touch,
 *      including tables that only hang off a dropped table (StreamSession,
 *      PlaybackRecord) and would fall with it.
 *   2. Recoverability of the links — scrap rows point at SalesInvoice,
 *      PurchaseBill, Vendor and friends, and those accounting documents are NOT
 *      deleted. After the scrap tables are gone the surviving document is the
 *      only trace of the transaction, so the id pairs are exported alongside
 *      enough identity (number, date, total) for a human to find them again.
 *   3. Re-runnability — an operator will run this more than once, and the last
 *      run must be the whole truth. Files are overwritten and stale module
 *      files are pruned; company directories from an earlier run are reported
 *      but never deleted, because a tenant removed since the last run is
 *      exactly the case where this export is the only copy.
 *
 * Read-only against the database. An empty database is a valid, successful run:
 * it produces an empty manifest and exits 0, so this can sit in a pipeline
 * ahead of the deletion stories on any environment.
 *
 *   pnpm rollout:export-dropped-data
 *   pnpm rollout:export-dropped-data --out ./exports/2026-08-18
 *   pnpm rollout:export-dropped-data --company-id <uuid>
 */

const DEFAULT_OUT_DIR = "exports/rollout/dropped-module-data";

type RowRecord = Record<string, unknown>;

interface ExportTable {
  /** Model name exactly as it reads in `prisma/schema.prisma`. */
  model: string;
  /** Every row belonging to one company, via companyId or the nearest scoped parent. */
  fetch: (companyId: string) => Promise<unknown[]>;
}

/** A surviving record a dropped-module row points at, and how to look it up. */
interface DocumentLinkSpec {
  model: string;
  /** Dropped-module columns holding the foreign key. */
  from: { model: string; field: string }[];
  fetch: (ids: string[]) => Promise<unknown[]>;
}

interface ExportModule {
  /** Also the file stem: `<company>/<id>.json`. */
  id: string;
  label: string;
  /** Scope-trim stories that delete this module. */
  stories: string[];
  tables: ExportTable[];
  documentLinks: DocumentLinkSpec[];
}

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  tenantStatus: string;
  workspaceProfile: string;
}

interface DocumentLinkFinding {
  model: string;
  /** Ids referenced by dropped rows whose target row could not be read back. */
  danglingIds: string[];
  references: { id: string; referencedBy: { model: string; rowId: string; field: string }[] }[];
  records: unknown[];
}

interface ModuleExport {
  story: "ST-0.2";
  generatedAt: string;
  module: { id: string; label: string; stories: string[] };
  company: CompanyRow;
  rowCounts: Record<string, number>;
  totalRows: number;
  tables: Record<string, unknown[]>;
  /**
   * Records outside the module that its rows reference and that the drop keeps.
   * Empty for modules whose rows only point at other dropped rows.
   */
  documentLinks: DocumentLinkFinding[];
}

interface CompanyManifestEntry {
  company: CompanyRow;
  directory: string;
  modules: {
    id: string;
    file: string;
    rowCounts: Record<string, number>;
    totalRows: number;
    documentLinkCounts: Record<string, number>;
  }[];
  totalRows: number;
}

interface Manifest {
  story: "ST-0.2";
  generatedAt: string;
  outDir: string;
  companyIdFilter: string | null;
  companyCount: number;
  totalRows: number;
  companies: CompanyManifestEntry[];
  /** Company directories from an earlier run that this run did not refresh. */
  untouchedDirectories: string[];
}

function parseArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function table(model: string, fetch: (companyId: string) => Promise<unknown[]>): ExportTable {
  return { model, fetch };
}

function readStringField(row: unknown, field: string): string | null {
  if (typeof row !== "object" || row === null) return null;
  const value = (row as RowRecord)[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Prisma can hand back BigInt (and Decimal) values that `JSON.stringify` refuses. */
function jsonReplacer(_key: string, value: unknown) {
  if (typeof value === "bigint") return value.toString();
  return value;
}

/**
 * A dropped table, read through raw SQL rather than the Prisma client.
 *
 * ST-3 removes these models from `prisma/schema.prisma`, so `prisma.nVR` and
 * its siblings stop existing the moment the client is regenerated and a typed
 * read here would no longer compile. Deleting this script alongside them was
 * the alternative, and it is the wrong one: the export is the undo for an
 * irreversible step, and the database an operator restores in order to hand a
 * tenant its rows back is precisely a database that still has these tables.
 * Raw SQL is what lets the script outlive the schema it reads.
 *
 * The `to_regclass` guard is what keeps it honest on a database that has
 * already been migrated: an absent table exports as zero rows rather than
 * aborting the whole run, so a mixed estate — some environments migrated, some
 * not — still produces one complete manifest.
 *
 * `$queryRawUnsafe` is safe here because nothing user-supplied reaches the SQL
 * text: `model` and `whereSql` are literals in this file, and the only runtime
 * value, the company id, is bound as `$1`.
 */
function droppedTable(model: string, whereSql: string): ExportTable {
  return table(model, async (companyId) => {
    const [{ present }] = await prisma.$queryRawUnsafe<{ present: boolean }[]>(
      `SELECT to_regclass($1) IS NOT NULL AS present`,
      `public."${model}"`,
    );
    if (!present) return [];
    return prisma.$queryRawUnsafe<unknown[]>(
      `SELECT t.* FROM "${model}" t WHERE ${whereSql} ORDER BY t."id" ASC`,
      companyId,
    );
  });
}

/** Rows scoped to a company only through the site they were installed at. */
const SITE_OF_COMPANY = `(SELECT s."id" FROM "Site" s WHERE s."companyId" = $1)`;
const CAMERA_OF_COMPANY = `(SELECT c."id" FROM "Camera" c WHERE c."siteId" IN ${SITE_OF_COMPANY})`;
const OWN_COMPANY = `t."companyId" = $1`;

/**
 * The accounting documents scrap rows point at. These rows SURVIVE the drop
 * (ST-3.1 drops from the dependent side precisely so they do), which is why the
 * pairing is worth exporting: after the scrap tables are gone, a bill or an
 * invoice is the only remaining evidence that a purchase or sale happened, and
 * nothing in the surviving schema says which scrap ticket it came from.
 */
const SCRAP_DOCUMENT_LINKS: DocumentLinkSpec[] = [
  {
    model: "PurchaseBill",
    from: [{ model: "ScrapMetalPurchase", field: "purchaseBillId" }],
    fetch: (ids) =>
      prisma.purchaseBill.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          companyId: true,
          vendorId: true,
          billNumber: true,
          billDate: true,
          status: true,
          total: true,
        },
        orderBy: { id: "asc" },
      }),
  },
  {
    model: "PurchasePayment",
    from: [{ model: "ScrapMetalPurchase", field: "purchasePaymentId" }],
    fetch: (ids) =>
      prisma.purchasePayment.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          companyId: true,
          billId: true,
          paymentNumber: true,
          paidAt: true,
          amount: true,
          method: true,
          reference: true,
        },
        orderBy: { id: "asc" },
      }),
  },
  {
    model: "Vendor",
    from: [{ model: "ScrapMetalPurchase", field: "vendorId" }],
    fetch: (ids) =>
      prisma.vendor.findMany({
        where: { id: { in: ids } },
        select: { id: true, companyId: true, name: true, phone: true, email: true, taxNumber: true },
        orderBy: { id: "asc" },
      }),
  },
  {
    model: "SalesInvoice",
    from: [{ model: "ScrapMetalSale", field: "salesInvoiceId" }],
    fetch: (ids) =>
      prisma.salesInvoice.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          companyId: true,
          customerId: true,
          invoiceNumber: true,
          invoiceDate: true,
          status: true,
          total: true,
        },
        orderBy: { id: "asc" },
      }),
  },
  {
    model: "SalesReceipt",
    from: [{ model: "ScrapMetalSale", field: "salesReceiptId" }],
    fetch: (ids) =>
      prisma.salesReceipt.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          companyId: true,
          invoiceId: true,
          receiptNumber: true,
          receivedAt: true,
          amount: true,
          method: true,
          reference: true,
        },
        orderBy: { id: "asc" },
      }),
  },
  {
    model: "Customer",
    from: [{ model: "ScrapMetalSale", field: "customerId" }],
    fetch: (ids) =>
      prisma.customer.findMany({
        where: { id: { in: ids } },
        select: { id: true, companyId: true, name: true, phone: true, email: true, taxNumber: true },
        orderBy: { id: "asc" },
      }),
  },
];

/**
 * The three dropped modules from `docs/rollout/scope-trim-roadmap.md`, with the
 * same table lists the ST-3.1 drop migration will act on.
 *
 * `lib/commodity-billing.ts` and its gold tables are deliberately absent: gold
 * survives the trim and must not appear in an export that reads as "this is
 * what we deleted".
 */
const EXPORT_MODULES: ExportModule[] = [
  {
    id: "cctv",
    label: "CCTV",
    stories: ["ST-2.1", "ST-3.1"],
    tables: [
      // CCTV hangs off Site, not Company: scope through the site.
      droppedTable("NVR", `t."siteId" IN ${SITE_OF_COMPANY}`),
      droppedTable("Camera", `t."siteId" IN ${SITE_OF_COMPANY}`),
      // An event names an NVR, a camera, or both — either one places it.
      droppedTable(
        "CCTVEvent",
        `(t."nvrId" IN (SELECT n."id" FROM "NVR" n WHERE n."siteId" IN ${SITE_OF_COMPANY})
          OR t."cameraId" IN ${CAMERA_OF_COMPANY})`,
      ),
      droppedTable("CameraAccessLog", `t."cameraId" IN ${CAMERA_OF_COMPANY}`),
      // StreamSession and PlaybackRecord are not named in ST-3.1, but they hold
      // a required FK to Camera and cannot outlive it. Exporting them here is
      // what keeps the drop from losing rows nobody listed.
      droppedTable("StreamSession", `t."siteId" IN ${SITE_OF_COMPANY}`),
      droppedTable("PlaybackRecord", `t."cameraId" IN ${CAMERA_OF_COMPANY}`),
    ],
    documentLinks: [],
  },
  {
    id: "autos",
    label: "Autos / car sales",
    stories: ["ST-2.2", "ST-2.5", "ST-3.1"],
    tables: [
      droppedTable("CarSalesVehicle", OWN_COMPANY),
      droppedTable("CarSalesLead", OWN_COMPANY),
      droppedTable("CarSalesDeal", OWN_COMPANY),
      droppedTable("CarSalesPayment", OWN_COMPANY),
    ],
    // Car sales never posted to the ledger: deals and payments reference only
    // other CarSales rows and users, all of which are in this export already.
    documentLinks: [],
  },
  {
    id: "scrap-metal",
    label: "Scrap metal",
    stories: ["ST-2.3", "ST-2.5", "ST-3.1", "ST-3.3"],
    tables: [
      droppedTable("ScrapMaterial", OWN_COMPANY),
      droppedTable("ScrapSellerProfile", OWN_COMPANY),
      droppedTable("ScrapMetalPrice", OWN_COMPANY),
      droppedTable("ScrapMetalPurchase", OWN_COMPANY),
      droppedTable("ScrapMetalBatch", OWN_COMPANY),
      // Batch items carry no companyId of their own; scope through the batch.
      droppedTable(
        "ScrapMetalBatchItem",
        `t."batchId" IN (SELECT b."id" FROM "ScrapMetalBatch" b WHERE b."companyId" = $1)`,
      ),
      droppedTable("ScrapMetalSale", OWN_COMPANY),
      droppedTable("ScrapMetalEmployeeBalance", OWN_COMPANY),
      droppedTable("ScrapMetalBalanceEntry", OWN_COMPANY),
      droppedTable("ScrapTicketComplianceRule", OWN_COMPANY),
    ],
    documentLinks: SCRAP_DOCUMENT_LINKS,
  },
];

async function loadCompanies(companyIdFilter: string | undefined): Promise<CompanyRow[]> {
  return prisma.company.findMany({
    where: companyIdFilter ? { id: companyIdFilter } : undefined,
    select: { id: true, name: true, slug: true, tenantStatus: true, workspaceProfile: true },
    orderBy: [{ slug: "asc" }],
  });
}

async function resolveDocumentLinks(
  specs: DocumentLinkSpec[],
  tables: Record<string, unknown[]>,
): Promise<DocumentLinkFinding[]> {
  const findings: DocumentLinkFinding[] = [];

  for (const spec of specs) {
    const referencedBy = new Map<string, { model: string; rowId: string; field: string }[]>();

    for (const source of spec.from) {
      for (const row of tables[source.model] ?? []) {
        const targetId = readStringField(row, source.field);
        if (!targetId) continue;
        const rowId = readStringField(row, "id") ?? "";
        const existing = referencedBy.get(targetId) ?? [];
        existing.push({ model: source.model, rowId, field: source.field });
        referencedBy.set(targetId, existing);
      }
    }

    const ids = Array.from(referencedBy.keys()).sort();
    const records = ids.length > 0 ? await spec.fetch(ids) : [];
    const foundIds = new Set(
      records.map((record) => readStringField(record, "id")).filter((id): id is string => id !== null),
    );

    findings.push({
      model: spec.model,
      // A dangling id means the document was already gone before the export —
      // worth surfacing, since the link is then unrecoverable either way.
      danglingIds: ids.filter((id) => !foundIds.has(id)),
      references: ids.map((id) => ({ id, referencedBy: referencedBy.get(id) ?? [] })),
      records,
    });
  }

  return findings;
}

async function exportModuleForCompany(
  exportModule: ExportModule,
  company: CompanyRow,
  generatedAt: string,
): Promise<ModuleExport> {
  const tables: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};

  for (const exportTable of exportModule.tables) {
    const rows = await exportTable.fetch(company.id);
    tables[exportTable.model] = rows;
    rowCounts[exportTable.model] = rows.length;
  }

  return {
    story: "ST-0.2",
    generatedAt,
    module: { id: exportModule.id, label: exportModule.label, stories: exportModule.stories },
    company,
    rowCounts,
    totalRows: Object.values(rowCounts).reduce((sum, count) => sum + count, 0),
    tables,
    documentLinks: await resolveDocumentLinks(exportModule.documentLinks, tables),
  };
}

/** Directory names have to survive a filesystem; slugs mostly already do. */
function toDirectoryName(company: CompanyRow, taken: Set<string>): string {
  const base = (company.slug || company.name || company.id)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safe = base.length > 0 ? base : `company-${company.id}`;
  // Slugs are unique in the database today; the suffix is insurance so two
  // tenants can never silently overwrite each other's export.
  const name = taken.has(safe) ? `${safe}__${company.id}` : safe;
  taken.add(name);
  return name;
}

/**
 * Drop module files this run did not write. Without this a module removed from
 * EXPORT_MODULES would leave an old file behind and the directory would read as
 * a complete export when it is not.
 */
async function pruneStaleModuleFiles(directory: string, expected: Set<string>) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json") || expected.has(entry.name)) continue;
    await rm(path.join(directory, entry.name));
  }
}

async function findUntouchedDirectories(outDir: string, written: Set<string>): Promise<string[]> {
  const entries = await readdir(outDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && !written.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function describeModule(moduleExport: ModuleExport): string {
  const nonZero = Object.entries(moduleExport.rowCounts).filter(([, count]) => count > 0);
  const links = moduleExport.documentLinks.filter((link) => link.references.length > 0);
  const parts = [nonZero.map(([model, count]) => `${model}=${count}`).join(", ")];
  if (links.length > 0) {
    parts.push(`links: ${links.map((link) => `${link.model}=${link.references.length}`).join(", ")}`);
  }
  return parts.filter((part) => part.length > 0).join(" · ");
}

async function main() {
  const generatedAt = new Date().toISOString();
  const companyIdFilter = parseArg("--company-id");
  const outDir = path.resolve(process.cwd(), parseArg("--out") ?? DEFAULT_OUT_DIR);

  await mkdir(outDir, { recursive: true });

  const companies = await loadCompanies(companyIdFilter);
  const entries: CompanyManifestEntry[] = [];
  const directoryNames = new Set<string>();

  console.log("Dropped-module data export (ST-0.2)");
  console.log("===================================");
  console.log(`Generated: ${generatedAt}`);
  console.log(`Output:    ${outDir}`);
  console.log(
    `Companies: ${companies.length}${companyIdFilter ? ` (filtered to ${companyIdFilter})` : ""}`,
  );
  console.log("");

  for (const company of companies) {
    const directoryName = toDirectoryName(company, directoryNames);
    const directory = path.join(outDir, directoryName);
    await mkdir(directory, { recursive: true });

    const entry: CompanyManifestEntry = {
      company,
      directory: directoryName,
      modules: [],
      totalRows: 0,
    };
    const written = new Set<string>();
    const detail: string[] = [];

    for (const exportModule of EXPORT_MODULES) {
      const moduleExport = await exportModuleForCompany(exportModule, company, generatedAt);
      const file = `${exportModule.id}.json`;
      await writeFile(
        path.join(directory, file),
        `${JSON.stringify(moduleExport, jsonReplacer, 2)}\n`,
        "utf8",
      );
      written.add(file);

      const documentLinkCounts: Record<string, number> = {};
      for (const link of moduleExport.documentLinks) {
        documentLinkCounts[link.model] = link.references.length;
      }

      entry.modules.push({
        id: exportModule.id,
        file: path.join(directoryName, file),
        rowCounts: moduleExport.rowCounts,
        totalRows: moduleExport.totalRows,
        documentLinkCounts,
      });
      entry.totalRows += moduleExport.totalRows;
      if (moduleExport.totalRows > 0) {
        detail.push(`  ${exportModule.id}: ${describeModule(moduleExport)}`);
      }
    }

    await pruneStaleModuleFiles(directory, written);
    entries.push(entry);

    // One line per company: the operator's at-a-glance answer to "is anything
    // at stake for this tenant if we drop these tables?".
    const perModule = entry.modules.map((module) => `${module.id}=${module.totalRows}`).join(" ");
    console.log(`${directoryName}  ${perModule}  total=${entry.totalRows}`);
    for (const line of detail) console.log(line);
  }

  const manifest: Manifest = {
    story: "ST-0.2",
    generatedAt,
    outDir,
    companyIdFilter: companyIdFilter ?? null,
    companyCount: companies.length,
    totalRows: entries.reduce((sum, entry) => sum + entry.totalRows, 0),
    companies: entries,
    untouchedDirectories: await findUntouchedDirectories(outDir, directoryNames),
  };

  await writeFile(
    path.join(outDir, "manifest.json"),
    `${JSON.stringify(manifest, jsonReplacer, 2)}\n`,
    "utf8",
  );

  console.log("");
  if (companies.length === 0) {
    console.log("No companies found. Empty export written; nothing is at stake on this database.");
  } else {
    console.log(`Exported ${manifest.totalRows} rows across ${companies.length} companies.`);
  }
  if (manifest.untouchedDirectories.length > 0) {
    // Never deleted: a tenant that has gone away since the last run is exactly
    // the case where this directory is the only surviving copy of its data.
    console.log(
      `Kept ${manifest.untouchedDirectories.length} directory(ies) from an earlier run: ${manifest.untouchedDirectories.join(", ")}`,
    );
  }
  console.log(`Manifest: ${path.join(outDir, "manifest.json")}`);
}

main()
  .catch((error) => {
    console.error("[rollout/export-dropped-module-data] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

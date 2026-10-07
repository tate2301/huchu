/**
 * The migration witness for `20261006090000_custom_reports`, and who may open
 * and change a custom report through the store.
 *
 * Read from `information_schema` rather than trusted from the schema file: a
 * green `prisma generate` says nothing about whether the table exists.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { starterDocument } from "./document";
import {
  createCustomReport,
  deleteCustomReport,
  listCustomReports,
  readCustomReport,
  ShareRefused,
  updateCustomReport,
  type Reader,
} from "./store";

type ColumnRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };

let companyId = "";
let otherId = "";
let maker: Reader;
let colleague: Reader;
let manager: Reader;
let owner: Reader;
let bursar: Reader;

beforeAll(async () => {
  const stamp = Date.now();
  const [company, other] = await Promise.all([
    prisma.company.create({ data: { name: `Custom reports ${stamp}`, slug: `custom-reports-${stamp}` } }),
    prisma.company.create({ data: { name: `Custom reports other ${stamp}`, slug: `custom-reports-other-${stamp}` } }),
  ]);
  companyId = company.id;
  otherId = other.id;
  maker = { companyId, userId: `maker-${stamp}`, role: "CLERK" };
  colleague = { companyId, userId: `colleague-${stamp}`, role: "CLERK" };
  manager = { companyId, userId: `manager-${stamp}`, role: "MANAGER" };
  owner = { companyId, userId: `owner-${stamp}`, role: "SUPERADMIN" };
  bursar = { companyId, userId: `bursar-${stamp}`, role: "BURSAR" };
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherId] } } });
});

const input = (shared: boolean) => ({
  title: "Won deals by owner",
  description: null,
  audience: shared ? ("EVERYONE" as const) : ("JUST_ME" as const),
  document: starterDocument({ key: "crm-deals" }),
});

describe("20261006090000_custom_reports", () => {
  it("creates CustomReport with the columns the store reads", async () => {
    const rows = await prisma.$queryRaw<ColumnRow[]>`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'CustomReport'
    `;
    const cols = new Map(rows.map((row) => [row.column_name, row]));
    expect(cols.get("document")).toMatchObject({ data_type: "jsonb", is_nullable: "NO" });
    expect(cols.get("createdById")?.is_nullable).toBe("NO");
    // 20261007090000_custom_report_audience: its maker's alone until shared, the way a template is.
    expect(cols.get("audience")).toMatchObject({ data_type: "USER-DEFINED", is_nullable: "NO" });
    expect(cols.get("audience")?.column_default).toContain("JUST_ME");
    expect(cols.has("shared")).toBe(false);
  });
});

describe("a custom report", () => {
  it("is its maker's alone until shared", async () => {
    const report = await createCustomReport(maker, input(false));
    expect(report).toMatchObject({ mine: true, editable: true, audience: "JUST_ME" });
    expect(report.document.blocks[0]).toMatchObject({ type: "query", query: "select *\nfrom crm_deals\n" });

    expect(await readCustomReport(colleague, report.id)).toBeNull();
    expect(await readCustomReport(manager, report.id)).toBeNull();
    expect((await listCustomReports(colleague)).map((entry) => entry.id)).not.toContain(report.id);
  });

  it("opens for everybody once shared, and is changed by its maker or the owner", async () => {
    // A manager shares; a clerk keeps reports to themselves (below).
    const report = await createCustomReport(manager, input(true));
    expect(await readCustomReport(colleague, report.id)).toMatchObject({ mine: false, editable: false });
    expect(await readCustomReport(bursar, report.id)).toMatchObject({ mine: false, editable: false });
    expect(await readCustomReport(owner, report.id)).toMatchObject({ mine: false, editable: true });

    expect(await updateCustomReport(colleague, report.id, { title: "Mine now" })).toEqual({ error: "forbidden" });
    const renamed = await updateCustomReport(owner, report.id, { title: "Won deals" });
    expect("report" in renamed && renamed.report.title).toBe("Won deals");

    expect(await deleteCustomReport(colleague, report.id)).toBe("forbidden");
    expect(await deleteCustomReport(manager, report.id)).toBe("deleted");
    expect(await readCustomReport(manager, report.id)).toBeNull();
  });

  it("is shown to the managers when shared with them, and only managers share", async () => {
    const report = await createCustomReport(manager, { ...input(false), audience: "MANAGERS" });
    expect(await readCustomReport(colleague, report.id)).toBeNull();
    expect(await readCustomReport(bursar, report.id)).toMatchObject({ editable: false });
    expect((await listCustomReports(colleague)).map((entry) => entry.id)).not.toContain(report.id);

    // A clerk keeps reports to themselves; sharing one is a manager's call.
    await expect(createCustomReport(maker, { ...input(false), audience: "EVERYONE" })).rejects.toBeInstanceOf(ShareRefused);
    const own = await createCustomReport(maker, input(false));
    expect(await updateCustomReport(maker, own.id, { audience: "EVERYONE" })).toEqual({ error: "forbidden" });
  });

  it("stays in its own workspace", async () => {
    const report = await createCustomReport(manager, input(true));
    expect(await readCustomReport({ ...maker, companyId: otherId }, report.id)).toBeNull();
    expect(await deleteCustomReport({ ...manager, companyId: otherId }, report.id)).toBe("missing");
  });

  it("opens as an empty page when what was stored no longer reads", async () => {
    const report = await createCustomReport(maker, input(false));
    await prisma.customReport.update({ where: { id: report.id }, data: { document: { blocks: "not a list" } } });
    const read = await readCustomReport(maker, report.id);
    expect(read?.title).toBe("Won deals by owner");
    expect(read?.document.blocks).toEqual([]);
  });
});

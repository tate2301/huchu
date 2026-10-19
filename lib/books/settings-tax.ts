import type { PrismaClient } from "@prisma/client";

import { taxSettings, type ResolvedTaxSettings } from "@/lib/books/core/tax-settings";

import { shortDay, storedDay } from "./format";

/**
 * Books → Settings → Tax codes & rules (BkSettingsTax): the tax codes a
 * document carries (it keeps the rate of its date), how many categories,
 * templates and rules there are, and ZIMRA's dates, rates and thresholds
 * from the tax settings (`tax-settings.ts`), each value the research could
 * not confirm marked "To confirm" until somebody saves it.
 */

type Db = PrismaClient;

export type TaxCodeRow = { id: string; code: string; name: string; rate: number; type: string; from: string | null; usedFor: string; active: boolean };

export type SettingsTaxPage = {
  codes: TaxCodeRow[];
  counts: { codes: number; categories: number; templates: number; rules: number; toConfirm: number };
  active: number;
  settings: ResolvedTaxSettings;
  finding: { fact: string; rest: string | null };
};

const USED: Record<string, string> = { SALES: "Sales", PURCHASE: "Bills", BOTH: "Sales, bills" };

export function codeUse(type: string, appliesTo: string): string {
  if (type === "WITHHOLDING") return "Supplier payments";
  return USED[appliesTo] ?? "Sales, bills";
}

export async function readSettingsTax(db: Db, companyId: string, { q = "", kind = "all" }: { q?: string; kind?: string } = {}): Promise<SettingsTaxPage> {
  const [codes, categories, templates, rules, settings] = await Promise.all([
    db.taxCode.findMany({ where: { companyId }, orderBy: [{ isActive: "desc" }, { code: "asc" }], select: { id: true, code: true, name: true, rate: true, type: true, appliesTo: true, effectiveFrom: true, isActive: true } }),
    db.taxCategory.count({ where: { companyId } }),
    db.taxTemplate.count({ where: { companyId } }),
    db.taxRule.count({ where: { companyId } }),
    taxSettings(companyId, db),
  ]);
  const needle = q.trim().toLowerCase();
  const rows: TaxCodeRow[] = codes
    .filter((row) => (kind === "all" || row.type === kind) && (!needle || `${row.code} ${row.name}`.toLowerCase().includes(needle)))
    .map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      rate: row.rate,
      type: row.type,
      from: row.effectiveFrom ? `${shortDay(storedDay(row.effectiveFrom))} ${row.effectiveFrom.getUTCFullYear()}` : null,
      usedFor: codeUse(row.type, row.appliesTo),
      active: row.isActive,
    }));
  const standard = codes.filter((row) => row.type === "VAT" && row.isActive && row.rate > 0).sort((a, b) => (b.effectiveFrom?.getTime() ?? 0) - (a.effectiveFrom?.getTime() ?? 0));
  const current = standard[0];
  const before = standard.find((row) => row.rate !== current?.rate);
  return {
    codes: rows,
    counts: { codes: codes.length, categories, templates, rules, toConfirm: settings.toConfirm.length },
    active: codes.filter((row) => row.isActive).length,
    settings,
    finding: {
      fact: "Documents keep the rate of their date.",
      rest: current ? `${current.rate}%${current.effectiveFrom ? ` from ${shortDay(storedDay(current.effectiveFrom))}` : ""}${before ? `, ${before.rate}% before` : ""}.` : "No VAT code is active yet.",
    },
  };
}

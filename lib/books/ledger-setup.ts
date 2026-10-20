import { AccountingSourceType, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { getAccountingSetupReadiness, type AccountingSetupReadiness } from "@/lib/accounting/bootstrap";

import { ledgerAccounts, movements } from "./core/ledger";
import { dayOf, money } from "./format";
import { sourceLabel } from "./journals";

/**
 * Books → Ledger: Chart of accounts (BkChart), Cost centres, Posting rules
 * (BkPostingRules), read and shaped for their pages. The writes stay on the
 * routes that already do them, now behind `canDo("setup")`.
 */

type Db = PrismaClient;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The accounts Books' core seeds into a chart where their codes were free (P2, P3: D12, D13, D16, D17, D19). */
export const BOOKS_ADDED_CODES = new Set(["1150", "1170", "2010", "2180", "2185", "2190", "2195", "2215", "2280", "4210", "4220", "5460", "5465", "5650"]);

const TYPE_HEAD: Record<string, string> = { ASSET: "Assets", LIABILITY: "Liabilities", EQUITY: "Equity", INCOME: "Income", EXPENSE: "Expenses" };
const TYPE_WORD: Record<string, string> = { ASSET: "Asset", LIABILITY: "Liability", EQUITY: "Equity", INCOME: "Income", EXPENSE: "Expense" };
const CATEGORY_HEAD: Record<string, string> = { cash: "Bank and cash", receivables: "Owed to you and advances", payables: "You owe suppliers", tax: "Tax", payroll: "Payroll", revenue: "Sales", cogs: "Cost of sales", operations: "Running costs" };
const ORDER = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];

/* ── Chart of accounts ───────────────────────────────────────────────── */

export const chartQuery = z.object({
  q: z.string().trim().max(100).catch(""),
  type: z.enum(["all", "ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]).catch("all"),
  inactive: z.enum(["hide", "show"]).catch("hide"),
  collapse: z.enum(["no", "yes"]).catch("no"),
});
export type ChartQuery = z.infer<typeof chartQuery>;

export type ChartRow =
  | { kind: "head"; key: string; code: string; label: string; level: 1 | 2 }
  | { kind: "account"; id: string; code: string; name: string; word: string; type: string; category: string | null; parentId: string | null; description: string | null; taxCode: string | null; balance: number; active: boolean; added: boolean; hasLines: boolean };

export type ChartPage = {
  finding: { fact: string; rest: string | null };
  query: ChartQuery;
  rows: ChartRow[];
  total: number;
  inactive: number;
  added: number;
  shown: number;
  baseCurrency: string;
  groups: Array<{ id: string; label: string; type: string }>;
  can: { change: boolean };
};

/** The Type column's word: what the account is to a person (Bank, Cash, Receivable…), else its type. Pure. */
export function accountWord(account: { type: string; category: string | null; bankKind?: string | null }): string {
  const category = (account.category ?? "").toLowerCase();
  if (account.bankKind) return account.bankKind === "CASH" ? "Cash" : account.bankKind === "MOBILE" ? "Mobile money" : "Bank";
  if (category === "cash") return "Cash";
  if (category === "receivables") return "Receivable";
  if (category === "payables") return "Payable";
  if (category === "tax") return "Tax";
  return TYPE_WORD[account.type] ?? account.type;
}

export async function readChart(db: Db, companyId: string, query: ChartQuery, can: ChartPage["can"], now = new Date()): Promise<ChartPage> {
  const [accounts, moved, banks, ruleTaxes, used, settings] = await Promise.all([
    ledgerAccounts(db, companyId),
    movements(db, companyId, { to: dayOf(now) }),
    db.bankAccount.findMany({ where: { companyId, ledgerAccountId: { not: null } }, select: { ledgerAccountId: true, kind: true } }),
    db.postingRuleLine.findMany({ where: { rule: { companyId }, taxCodeId: { not: null }, accountId: { not: null } }, select: { accountId: true, taxCode: { select: { code: true } } } }),
    db.journalLine.groupBy({ by: ["accountId"], where: { entry: { companyId } }, _count: { _all: true } }),
    db.accountingSettings.findUnique({ where: { companyId }, select: { baseCurrency: true } }),
  ]);
  const descriptions = new Map((await db.chartOfAccount.findMany({ where: { companyId }, select: { id: true, description: true } })).map((row) => [row.id, row.description]));
  const bankKind = new Map(banks.map((bank) => [bank.ledgerAccountId!, String(bank.kind)]));
  const taxOf = new Map<string, string>();
  for (const line of ruleTaxes) if (line.accountId && line.taxCode && !taxOf.has(line.accountId)) taxOf.set(line.accountId, line.taxCode.code);
  const hasLines = new Set(used.map((row) => row.accountId));
  const needle = query.q.toLowerCase();
  const visible = accounts.filter(
    (account) =>
      (query.inactive === "show" || account.isActive) &&
      (query.type === "all" || account.type === query.type) &&
      (!needle || account.code.toLowerCase().includes(needle) || account.name.toLowerCase().includes(needle)),
  );
  const ledger = (account: (typeof accounts)[number]): ChartRow => {
    const move = moved.get(account.id);
    const raw = (move?.debit ?? 0) - (move?.credit ?? 0);
    const sign = ["LIABILITY", "EQUITY", "INCOME"].includes(account.type) ? -1 : 1;
    return {
      kind: "account",
      id: account.id,
      code: account.code,
      name: account.name,
      word: accountWord({ type: account.type, category: account.category, bankKind: bankKind.get(account.id) }),
      type: account.type,
      category: account.category,
      parentId: account.parentId,
      description: descriptions.get(account.id) ?? null,
      taxCode: taxOf.get(account.id) ?? null,
      balance: round2(sign * raw),
      active: account.isActive,
      added: BOOKS_ADDED_CODES.has(account.code),
      hasLines: hasLines.has(account.id),
    };
  };
  const rows: ChartRow[] = [];
  const groups = accounts.filter((account) => account.nodeType === "GROUP");
  if (groups.length) {
    // The chart's own tree: each heading, then what sits under it.
    const children = new Map<string | null, typeof accounts>();
    for (const account of accounts) children.set(account.parentId, [...(children.get(account.parentId) ?? []), account]);
    const shown = new Set(visible.map((account) => account.id));
    const walk = (parent: string | null, depth: number) => {
      for (const account of children.get(parent) ?? []) {
        if (account.nodeType === "GROUP") {
          rows.push({ kind: "head", key: account.id, code: account.code, label: account.name, level: depth <= 1 ? 1 : 2 });
          walk(account.id, depth + 1);
        } else if (shown.has(account.id) && query.collapse === "no") rows.push(ledger(account));
      }
    };
    walk(null, 1);
  } else {
    // A flat chart: headed by type, then by category, as an accountant reads it.
    for (const type of ORDER) {
      const ofType = visible.filter((account) => account.type === type);
      if (!ofType.length) continue;
      rows.push({ kind: "head", key: type, code: ofType[0].code, label: TYPE_HEAD[type], level: 1 });
      const categories = [...new Set(ofType.map((account) => account.category ?? ""))];
      for (const category of categories) {
        const inCategory = ofType.filter((account) => (account.category ?? "") === category);
        if (category && categories.length > 1) rows.push({ kind: "head", key: `${type}-${category}`, code: inCategory[0].code, label: CATEGORY_HEAD[category.toLowerCase()] ?? category, level: 2 });
        if (query.collapse === "no") rows.push(...inCategory.map(ledger));
      }
    }
  }
  const inactive = accounts.filter((account) => !account.isActive).length;
  const added = accounts.filter((account) => BOOKS_ADDED_CODES.has(account.code)).length;
  const ledgers = accounts.filter((account) => account.nodeType === "LEDGER").length;
  return {
    finding: {
      fact: `${ledgers} accounts, in the layout your accountant knows.`,
      rest: added ? `Books added ${added} where the codes were free.` : null,
    },
    query,
    rows,
    total: ledgers,
    inactive,
    added,
    shown: visible.filter((account) => account.nodeType === "LEDGER").length,
    baseCurrency: settings?.baseCurrency ?? "USD",
    groups: groups.map((group) => ({ id: group.id, label: `${group.code} ${group.name}`, type: group.type })),
    can,
  };
}

/* ── Cost centres ────────────────────────────────────────────────────── */

export const costCentreQuery = z.object({
  q: z.string().trim().max(100).catch(""),
  view: z.enum(["active", "inactive", "all"]).catch("active"),
});
export type CostCentreQuery = z.infer<typeof costCentreQuery>;

export type CostCentreRow = { id: string; code: string; name: string; active: boolean; usedBy: string | null; thisMonth: number; lines: number };

export type CostCentresPage = {
  finding: { fact: string; rest: string | null };
  query: CostCentreQuery;
  counts: Record<CostCentreQuery["view"], number>;
  rows: CostCentreRow[];
  thisMonth: number;
  month: string;
  baseCurrency: string;
  can: { change: boolean };
};

export async function readCostCentres(db: Db, companyId: string, query: CostCentreQuery, can: CostCentresPage["can"], now = new Date()): Promise<CostCentresPage> {
  const today = dayOf(now);
  const from = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
  const [centres, month, all, settings] = await Promise.all([
    db.costCenter.findMany({ where: { companyId }, select: { id: true, code: true, name: true, isActive: true, crmProjects: { select: { name: true }, take: 2 }, departments: { select: { name: true }, take: 2 } }, orderBy: { code: "asc" } }),
    db.journalLine.groupBy({ by: ["costCenterId"], where: { costCenterId: { not: null }, entry: { companyId, status: "POSTED", entryDate: { gte: from } } }, _sum: { debit: true, credit: true } }),
    db.journalLine.groupBy({ by: ["costCenterId"], where: { costCenterId: { not: null }, entry: { companyId } }, _count: { _all: true } }),
    db.accountingSettings.findUnique({ where: { companyId }, select: { baseCurrency: true } }),
  ]);
  const spent = new Map(month.map((row) => [row.costCenterId!, round2(row._sum.debit ?? 0)]));
  const lines = new Map(all.map((row) => [row.costCenterId!, row._count._all]));
  const needle = query.q.toLowerCase();
  const shaped = centres.map((centre) => ({
    id: centre.id,
    code: centre.code,
    name: centre.name,
    active: centre.isActive,
    usedBy: centre.crmProjects.length ? `Project ${centre.crmProjects[0].name}` : centre.departments.length ? `Department ${centre.departments[0].name}` : null,
    thisMonth: spent.get(centre.id) ?? 0,
    lines: lines.get(centre.id) ?? 0,
  }));
  const rows = shaped.filter((row) => (query.view === "all" || (query.view === "active") === row.active) && (!needle || row.name.toLowerCase().includes(needle) || row.code.toLowerCase().includes(needle)));
  const c = settings?.baseCurrency ?? "USD";
  const thisMonth = round2(shaped.reduce((sum, row) => sum + row.thisMonth, 0));
  const busiest = [...shaped].sort((a, b) => b.thisMonth - a.thisMonth)[0];
  const active = shaped.filter((row) => row.active).length;
  return {
    finding: shaped.length === 0
      ? { fact: "No cost centres yet.", rest: "Add one for a job, a site or a department; CRM projects make their own." }
      : { fact: `${active} cost ${active === 1 ? "centre" : "centres"} in use.`, rest: busiest && busiest.thisMonth > 0 ? `${busiest.name} has the most this month: ${money(busiest.thisMonth, c)}.` : "Nothing has been charged to one this month." },
    query,
    counts: { active, inactive: shaped.length - active, all: shaped.length },
    rows,
    thisMonth,
    month: new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(from),
    baseCurrency: c,
    can,
  };
}

/* ── Posting rules ───────────────────────────────────────────────────── */

export const postingRulesQuery = z.object({
  tab: z.enum(["rules", "tenders", "readiness"]).catch("rules"),
  q: z.string().trim().max(100).catch(""),
  source: z.string().max(60).catch(""),
});
export type PostingRulesQuery = z.infer<typeof postingRulesQuery>;

export type PostingRuleRow = {
  id: string;
  name: string;
  /** "Every invoice", "When 2 conditions hold". */
  when: string;
  sourceType: string;
  debit: string;
  credit: string;
  thisMonth: number;
  state: "Ready" | "Needs an account" | "Inactive";
};

export type PostingRulesPage = {
  finding: { fact: string; rest: string | null };
  query: PostingRulesQuery;
  counts: { rules: number; tenders: number };
  rows: PostingRuleRow[];
  ready: number;
  needs: number;
  sources: Array<{ value: string; label: string }>;
  /** Every kind of document a new rule can post. */
  allSources: Array<{ value: string; label: string }>;
  tenders: Array<{ id: string; tender: string; currency: string; where: string; clearing: string; offset: string | null; active: boolean }>;
  readiness: AccountingSetupReadiness | null;
  can: { change: boolean };
};

type RuleLine = { direction: string; accountSource: string; accountRole: string | null; eventAccountKey: string | null; account: { code: string; name: string } | null; basis: string };

/** Where a side posts, in words: "1100 Accounts Receivable · 2200 VAT Output", "The tender's account". Pure. */
export function sideWords(lines: RuleLine[]): string {
  const words = lines.map((line) => {
    if (line.account) return `${line.account.code} ${line.account.name}`;
    if (line.accountSource === "TENDER_MAPPING") return "The tender’s account";
    if (line.eventAccountKey) return `The ${line.eventAccountKey.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ").toLowerCase()} account`;
    if (line.accountRole) return `The ${line.accountRole.toLowerCase().replace(/_/g, " ")} account`;
    return "No account yet";
  });
  const unique = [...new Set(words)];
  // Several accounts on one side read as their codes, as the board writes "2100 · 2110 · 2120".
  if (unique.length > 2) return [...new Set(lines.map((line, index) => line.account?.code ?? words[index]))].join(" · ");
  return unique.join(" · ") || "—";
}

/** A rule needs an account when a fixed-account line has none. Pure. */
export const ruleNeedsAccount = (lines: Array<Pick<RuleLine, "accountSource" | "accountRole" | "eventAccountKey" | "account">>) =>
  lines.some((line) => line.accountSource === "FIXED_ACCOUNT" && !line.account && !line.accountRole && !line.eventAccountKey);

export async function readPostingRules(db: Db, companyId: string, query: PostingRulesQuery, can: PostingRulesPage["can"], now = new Date()): Promise<PostingRulesPage> {
  const today = dayOf(now);
  const from = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
  const [rules, posted, tenders, readiness] = await Promise.all([
    db.postingRule.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        sourceType: true,
        isActive: true,
        priority: true,
        conditions: { select: { id: true } },
        lines: { select: { direction: true, accountSource: true, accountRole: true, eventAccountKey: true, basis: true, account: { select: { code: true, name: true } } }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: [{ sourceType: "asc" }, { priority: "asc" }, { name: "asc" }],
    }),
    db.journalEntry.groupBy({ by: ["sourceType"], where: { companyId, status: "POSTED", entryDate: { gte: from } }, _count: { _all: true } }),
    db.tenderAccountMapping.findMany({ where: { companyId }, select: { id: true, tenderType: true, currency: true, registerCode: true, isActive: true, site: { select: { name: true } }, clearingAccount: { select: { code: true, name: true } }, offsetAccount: { select: { code: true, name: true } } }, orderBy: [{ tenderType: "asc" }, { priority: "asc" }] }),
    query.tab === "readiness" ? getAccountingSetupReadiness(companyId) : Promise.resolve(null),
  ]);
  const counts = new Map(posted.map((row) => [row.sourceType as string, row._count._all]));
  const all: PostingRuleRow[] = rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    when: rule.conditions.length ? `When ${rule.conditions.length} ${rule.conditions.length === 1 ? "condition holds" : "conditions hold"}` : `Every ${sourceLabel(rule.sourceType).toLowerCase()}`,
    sourceType: rule.sourceType,
    debit: sideWords(rule.lines.filter((line) => line.direction === "DEBIT") as RuleLine[]),
    credit: sideWords(rule.lines.filter((line) => line.direction === "CREDIT") as RuleLine[]),
    thisMonth: counts.get(rule.sourceType) ?? 0,
    state: !rule.isActive ? "Inactive" : ruleNeedsAccount(rule.lines as RuleLine[]) ? "Needs an account" : "Ready",
  }));
  const needle = query.q.toLowerCase();
  const rows = all.filter((row) => (!query.source || row.sourceType === query.source) && (!needle || row.name.toLowerCase().includes(needle)));
  const ready = all.filter((row) => row.state === "Ready").length;
  const needs = all.filter((row) => row.state === "Needs an account");
  const live = all.filter((row) => row.state !== "Inactive").length;
  return {
    finding: all.length === 0
      ? { fact: "No posting rules yet.", rest: "Set up the books to add the standard ones." }
      : needs.length === 0
        ? { fact: `All ${live} rules in use are ready.`, rest: null }
        : { fact: `${ready} of ${live} rules are ready.`, rest: `${needs[0].name} has no account for one of its lines.` },
    query,
    counts: { rules: all.length, tenders: tenders.length },
    rows,
    ready,
    needs: needs.length,
    sources: [...new Set(all.map((row) => row.sourceType))].map((value) => ({ value, label: sourceLabel(value) })).sort((a, b) => a.label.localeCompare(b.label)),
    allSources: Object.values(AccountingSourceType).map((value) => ({ value, label: sourceLabel(value) })).sort((a, b) => a.label.localeCompare(b.label)),
    tenders: tenders.map((row) => ({
      id: row.id,
      tender: row.tenderType.charAt(0) + row.tenderType.slice(1).toLowerCase().replace(/_/g, " "),
      currency: row.currency ?? "Any",
      where: [row.site?.name, row.registerCode].filter(Boolean).join(", ") || "Every till",
      clearing: `${row.clearingAccount.code} ${row.clearingAccount.name}`,
      offset: row.offsetAccount ? `${row.offsetAccount.code} ${row.offsetAccount.name}` : null,
      active: row.isActive,
    })),
    readiness,
    can,
  };
}

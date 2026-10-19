import type { PrismaClient, VatReturnStatus } from "@prisma/client";

import { canDo, isSuperuser, tierOf, type BooksActor } from "@/lib/books/core/can-do";
import { taxSettings } from "@/lib/books/core/tax-settings";
import { vatDueDates, vatFigures, vatPeriodFor, type VatFigures, type VatSourceKey, type VatSourceRow } from "@/lib/books/core/vat-figures";
import { resolveBaseCurrency } from "@/lib/money";

import { asOf, dayOf, money, monthName, shortDay, storedDay } from "./format";
import type { VatCurrencyView, VatTab } from "./vat-labels";

/**
 * Books → Tax → VAT returns (BkVatReturn): the return for a period as one
 * table, output then input then what was withheld, every source the core
 * gathers (`vatFigures`: invoices less credit notes, the tills, fees, bills
 * with a valid FTI less debit notes, claims and requisitions, VAT withheld),
 * by currency or all in the base currency, and the tie-out to 2200 and 2210
 * in the foot. A difference must be explained before Finalise; the server
 * refuses it otherwise.
 */

type Db = PrismaClient;

const TAB_OF: Record<VatReturnStatus, VatTab | null> = { DRAFT: "draft", REVIEWED: "reviewed", FINALIZED: "finalised", FILED: "filed", VOIDED: null };

export type VatLine = { key: string; label: string; docs: number; value: number; vat: number; muted?: boolean };

export type VatReturnView = {
  id: string | null;
  status: VatReturnStatus | null;
  state: VatTab | "none";
  period: { start: string; end: string; words: string };
  returnDue: string;
  paymentDue: string;
  gatheredAt: string | null;
  currency: string;
  output: VatLine[];
  input: VatLine[];
  withheld: VatLine[];
  totals: { output: number; input: number; withheld: number; net: number; documents: number };
  tieOut: VatFigures["tieOut"];
  missingRates: string[];
  notes: string | null;
  reference: string | null;
  preparedBy: string | null;
  reviewedBy: string | null;
  /** The VAT 7 boxes, for the working schedule. */
  boxes: Record<string, number> | null;
};

export type VatPage = {
  baseCurrency: string;
  tab: VatTab;
  view: VatCurrencyView;
  finding: { fact: string; rest: string | null };
  counts: Record<VatTab, number>;
  /** The returns in the tab, when it holds more than one: pick one. */
  list: Array<{ id: string; period: string; net: number; state: VatTab; reference: string | null; filed: string | null }>;
  current: VatReturnView | null;
  /** Another keeper than the one preparing, for "Send for review". */
  reviewers: string[];
  can: { prepare: boolean; file: boolean; void: boolean; why: { prepare: string | null; file: string | null; void: string | null } };
  you: string;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const OUTPUT_LABEL: Partial<Record<VatSourceKey, string>> = {
  invoices: "Standard-rated sales, invoices",
  "invoice-voids": "Less invoices voided",
  "credit-notes": "Less credit notes",
  till: "Till sales",
  fees: "Exempt sales, school fees",
  "other-output": "Other postings to VAT output",
};
const INPUT_LABEL: Partial<Record<VatSourceKey, string>> = {
  bills: "Bills with an FTI that is Valid on FDMS",
  "debit-notes": "Less debit notes",
  claims: "Requisition slips, claims and petty cash with a valid FTI",
  "other-input": "Other postings to VAT input",
};
const WITHHELD_LABEL: Partial<Record<VatSourceKey, string>> = {
  "withheld-by-customers": "VAT withheld by our customers",
  "withheld-as-agent": "VAT we withheld as an agent, to pay over",
};

/** A return's rows for one view: every currency in the base, or one currency in its own. */
export function vatLines(sources: VatSourceRow[], view: VatCurrencyView, base: string) {
  const pick = sources.filter((row) => view === "all" || row.currency.toUpperCase() === view);
  const sum = (keys: Partial<Record<VatSourceKey, string>>, always: VatSourceKey[]) => {
    const out: VatLine[] = [];
    for (const key of Object.keys(keys) as VatSourceKey[]) {
      const rows = pick.filter((row) => row.key === key);
      if (!rows.length && !always.includes(key)) continue;
      const own = view !== "all";
      out.push({
        key,
        label: keys[key]!,
        docs: rows.reduce((total, row) => total + row.count, 0),
        value: round2(rows.reduce((total, row) => total + (own ? row.value : row.baseValue), 0)),
        vat: round2(rows.reduce((total, row) => total + (own ? row.vat : row.baseVat), 0)),
      });
    }
    return out;
  };
  const output = sum(OUTPUT_LABEL, ["invoices", "credit-notes"]);
  const input = sum(INPUT_LABEL, ["bills", "debit-notes"]);
  const withheld = sum(WITHHELD_LABEL, ["withheld-by-customers"]);
  const outputVat = round2(output.filter((row) => row.key !== "fees").reduce((total, row) => total + row.vat, 0));
  const inputVat = round2(input.reduce((total, row) => total + row.vat, 0));
  const credit = round2(withheld.filter((row) => row.key === "withheld-by-customers").reduce((total, row) => total + row.vat, 0));
  return {
    output,
    input,
    withheld,
    currency: view === "all" ? base : view,
    totals: { output: outputVat, input: inputVat, withheld: credit, net: round2(outputVat - inputVat - credit), documents: [...output, ...input, ...withheld].reduce((total, row) => total + row.docs, 0) },
  };
}

export function vatPageFinding(current: VatReturnView | null, today: string, base: string): { fact: string; rest: string | null } {
  if (!current) return { fact: "No VAT return yet.", rest: "Refresh the figures to gather this period’s." };
  const month = current.period.words.replace(/ \d{4}$/, "");
  const due = `Return by ${Number(current.returnDue.slice(8))} ${monthName(current.returnDue)}, payment by ${Number(current.paymentDue.slice(8))} ${monthName(current.paymentDue)}.`;
  if (current.state === "filed") return { fact: `${month}’s VAT return is filed: ${money(current.totals.net, base)}.`, rest: current.reference ? `TaRMS reference ${current.reference}.` : null };
  const so = current.period.end >= today ? " so far" : "";
  if (current.state === "finalised") return { fact: `${month}’s VAT return is finalised: ${money(current.totals.net, base)}.`, rest: `File it in TaRMS by ${Number(current.returnDue.slice(8))} ${monthName(current.returnDue)}.` };
  if (!current.tieOut.ties) return { fact: `${month}’s VAT stands at ${money(current.totals.net, base)}${so}.`, rest: "It differs from the ledger: explain the difference before finalising." };
  return { fact: `${month}’s VAT stands at ${money(current.totals.net, base)}${so}.`, rest: due };
}

function figuresOf(schedulesJson: string | null): VatFigures | null {
  try {
    return schedulesJson ? ((JSON.parse(schedulesJson) as { books?: VatFigures }).books ?? null) : null;
  } catch {
    return null;
  }
}

function boxesOf(json: string | null): Record<string, number> | null {
  try {
    return json ? (JSON.parse(json) as Record<string, number>) : null;
  } catch {
    return null;
  }
}

export async function readVatPage(db: Db, companyId: string, { tab, id = null, view = "all", actor }: { tab?: VatTab | null; id?: string | null; view?: VatCurrencyView; actor: BooksActor }, now = new Date()): Promise<VatPage> {
  const today = dayOf(now);
  const base = (await resolveBaseCurrency(companyId)).toUpperCase();
  const [returns, settings, people] = await Promise.all([
    db.vatReturn.findMany({
      where: { companyId, status: { not: "VOIDED" } },
      orderBy: { periodStart: "desc" },
      select: { id: true, status: true, periodStart: true, periodEnd: true, netTax: true, referenceNumber: true, filedAt: true, updatedAt: true, schedulesJson: true, vat7BoxesJson: true, notes: true, preparedById: true, reviewedById: true },
    }),
    taxSettings(companyId, db),
    db.user.findMany({ where: { companyId, isActive: true, role: { in: ["SUPERADMIN", "MANAGER", "FINANCE_OFFICER"] } }, select: { id: true, name: true } }),
  ]);
  const nameOf = (userId: string | null) => people.find((person) => person.id === userId)?.name ?? null;
  const counts: Record<VatTab, number> = { draft: 0, reviewed: 0, finalised: 0, filed: 0 };
  for (const ret of returns) {
    const key = TAB_OF[ret.status];
    if (key) counts[key] += 1;
  }
  const chosen = id ? returns.find((ret) => ret.id === id) : null;
  const activeTab: VatTab = tab ?? (chosen ? TAB_OF[chosen.status] : null) ?? (counts.draft ? "draft" : counts.reviewed ? "reviewed" : counts.finalised ? "finalised" : counts.filed ? "filed" : "draft");
  const inTab = returns.filter((ret) => TAB_OF[ret.status] === activeTab);
  const pick = chosen ?? (inTab.length === 1 || activeTab !== "filed" ? inTab[0] : null) ?? null;

  let current: VatReturnView | null = null;
  const period = pick ? { start: pick.periodStart, end: pick.periodEnd } : vatPeriodFor(new Date(`${today}T00:00:00Z`), settings.vat);
  if (pick || (activeTab === "draft" && counts.draft === 0)) {
    const figures = (pick ? figuresOf(pick.schedulesJson) : null) ?? (await vatFigures(companyId, period.start, period.end, db));
    const lines = vatLines(figures.sources, view, base);
    const dues = vatDueDates(period.end, settings.vat);
    const startDay = storedDay(period.start);
    const endDay = storedDay(period.end);
    current = {
      id: pick?.id ?? null,
      status: pick?.status ?? null,
      state: pick ? (TAB_OF[pick.status] ?? "draft") : "none",
      period: { start: startDay, end: endDay, words: startDay.slice(0, 7) === endDay.slice(0, 7) ? `${monthName(endDay)} ${endDay.slice(0, 4)}` : `${monthName(startDay)} to ${monthName(endDay)} ${endDay.slice(0, 4)}` },
      returnDue: figures.returnDue ?? dues.returnDue,
      paymentDue: figures.paymentDue ?? dues.paymentDue,
      gatheredAt: pick ? asOf(pick.updatedAt, now) : null,
      currency: lines.currency,
      output: lines.output,
      input: lines.input,
      withheld: lines.withheld,
      totals: lines.totals,
      tieOut: figures.tieOut,
      missingRates: figures.missingRates,
      notes: pick?.notes ?? null,
      reference: pick?.referenceNumber ?? null,
      preparedBy: nameOf(pick?.preparedById ?? null),
      reviewedBy: nameOf(pick?.reviewedById ?? null),
      boxes: boxesOf(pick?.vat7BoxesJson ?? null),
    };
  }
  const tier = tierOf(actor);
  const owner = tier === "owner" || isSuperuser(actor);
  const prepare = canDo(actor, "vat.prepare");
  const file = canDo(actor, "vat.file");
  return {
    baseCurrency: base,
    tab: activeTab,
    view,
    finding: vatPageFinding(current, today, base),
    counts,
    list: inTab.map((ret) => ({
      id: ret.id,
      period: `${monthName(storedDay(ret.periodEnd))} ${ret.periodEnd.getUTCFullYear()}`,
      net: ret.netTax,
      state: TAB_OF[ret.status] ?? "draft",
      reference: ret.referenceNumber,
      filed: ret.filedAt ? shortDay(storedDay(ret.filedAt)) : null,
    })),
    current,
    reviewers: people.filter((person) => person.id !== (pick?.preparedById ?? actor.userId)).map((person) => person.name),
    can: {
      prepare: prepare.allowed,
      file: file.allowed,
      void: owner,
      why: { prepare: prepare.allowed ? null : prepare.reason, file: file.allowed ? null : file.reason, void: owner ? null : "Only the owner can void a VAT return." },
    },
    you: actor.userId,
  };
}


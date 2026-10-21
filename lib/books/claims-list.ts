import type { ExpenseClaimStatus, PettyCashVoucherStatus, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { dayOf, money, monthName, monthStart, shortDay } from "./format";
import { periodRange, PERIODS } from "./period";

/**
 * Books → Bills & spending → Claims & petty cash (BkClaims): what people spent
 * from their own pocket and are paid back (claims, D13), the petty cash floats
 * with what each has spent since its top-up, and the vouchers spent from them.
 * Reads only; the moves are the core's (`lib/books/core/claims.ts`,
 * `petty-cash.ts`).
 */

export const CLAIM_VIEWS = ["claims", "floats", "vouchers"] as const;
export type ClaimView = (typeof CLAIM_VIEWS)[number];
export const CLAIM_TAB_LABEL: Record<ClaimView, string> = { claims: "Claims", floats: "Floats", vouchers: "Vouchers" };

export const CLAIM_STATE: Record<ExpenseClaimStatus, string> = { DRAFT: "Draft", SUBMITTED: "To approve", APPROVED: "To pay back", REJECTED: "Not approved", PAID: "Paid", VOIDED: "Void" };
export const VOUCHER_STATE: Record<PettyCashVoucherStatus, string> = { DRAFT: "Draft", TO_APPROVE: "To approve", POSTED: "Posted", VOIDED: "Void" };

export const CLAIM_STATE_FILTERS = ["to-approve", "to-pay", "paid"] as const;
export type ClaimStateFilter = (typeof CLAIM_STATE_FILTERS)[number];
export const CLAIM_STATE_FILTER_LABEL: Record<ClaimStateFilter, string> = { "to-approve": "To approve", "to-pay": "To pay back", paid: "Paid" };
const STATE_FILTER: Record<ClaimStateFilter, ExpenseClaimStatus> = { "to-approve": "SUBMITTED", "to-pay": "APPROVED", paid: "PAID" };

export const CLAIMS_PAGE_SIZE = 50;

export const claimQuerySchema = z.object({
  view: z.enum(CLAIM_VIEWS).catch("claims"),
  q: z.string().trim().max(100).catch(""),
  person: z.string().uuid().nullable().catch(null),
  state: z.enum(CLAIM_STATE_FILTERS).nullable().catch(null),
  period: z.enum(PERIODS).catch("any"),
  sort: z.enum(["newest", "oldest"]).catch("newest"),
  page: z.coerce.number().int().min(1).catch(1),
});
export type ClaimQuery = z.infer<typeof claimQuerySchema>;

export function readClaimQuery(params: URLSearchParams): ClaimQuery {
  return claimQuerySchema.parse({
    view: params.get("view") ?? undefined,
    q: params.get("q") ?? undefined,
    person: params.get("person") || null,
    state: params.get("state") || null,
    period: params.get("period") ?? undefined,
    sort: params.get("sort") ?? undefined,
    page: params.get("page") ?? undefined,
  });
}

export type ClaimRow = { id: string; number: string; person: { id: string; name: string; image: string | null }; forWhat: string; status: ExpenseClaimStatus; state: string; amount: number; currency: string };
export type FloatRow = { id: string; name: string; holder: string | null; holderImage: string | null; currency: string; imprest: number; spent: number; vouchers: number; left: number };
export type VoucherRow = { id: string; number: string; float: string; forWhat: string; date: string; slip: boolean; status: PettyCashVoucherStatus; state: string; amount: number; currency: string; createdById: string; kind: "SPEND" | "TOP_UP" };

export type ClaimsView = {
  finding: { fact: string; rest: string | null };
  counts: Record<ClaimView, number>;
  claims: ClaimRow[];
  floats: FloatRow[];
  vouchers: VoucherRow[];
  range: { from: number; to: number; of: number };
  sums: { toApprove: number; toPay: number; paidMonth: number; monthName: string };
  currency: string;
  people: Array<{ id: string; name: string; image: string | null }>;
  query: ClaimQuery;
};

type Db = Pick<PrismaClient, "expenseClaim" | "pettyCashVoucher" | "bankAccount">;

const round = (n: number) => Math.round(n * 100) / 100;
const harareStart = (day: string) => new Date(`${day}T00:00:00.000+02:00`);
const possessive = (name: string) => `${name}${name.endsWith("s") ? "'" : "'s"}`;

/** "1 claim waits for you: Simba Gondo, $23.00." / "Tinashe Moyo's $36.00 waits to be paid back." */
export function claimsFinding(waiting: Array<{ name: string; amount: number }>, toPay: Array<{ name: string; amount: number }>, currency = "USD"): { fact: string; rest: string | null } {
  const fact =
    waiting.length === 0
      ? "No claim waits for you."
      : waiting.length === 1
        ? `1 claim waits for you: ${waiting[0].name}, ${money(waiting[0].amount, currency)}.`
        : `${waiting.length} claims wait for you, ${money(waiting.reduce((sum, row) => sum + row.amount, 0), currency)}.`;
  if (toPay.length === 0) return { fact, rest: null };
  if (toPay.length === 1) return { fact, rest: `${possessive(toPay[0].name)} ${money(toPay[0].amount, currency)} waits to be paid back.` };
  return { fact, rest: `${toPay.length} wait to be paid back, ${money(toPay.reduce((sum, row) => sum + row.amount, 0), currency)} in all.` };
}

export function claimWhere(companyId: string, query: ClaimQuery, scope: { everyone: boolean; userId: string }, today = dayOf(new Date())): Prisma.ExpenseClaimWhereInput {
  const where: Prisma.ExpenseClaimWhereInput = { companyId, ...(scope.everyone ? {} : { claimantId: scope.userId }) };
  const range = periodRange(query.period, today);
  if (range) where.createdAt = range;
  if (query.person) where.claimantId = query.person;
  if (query.state) where.status = STATE_FILTER[query.state];
  if (query.q) {
    const q = { contains: query.q, mode: "insensitive" as const };
    where.OR = [{ claimNo: q }, { notes: q }, { claimant: { name: q } }, { lines: { some: { description: q } } }];
  }
  return where;
}

export async function readClaims(db: Db, companyId: string, query: ClaimQuery, scope: { everyone: boolean; userId: string }, base = "USD", now = new Date()): Promise<ClaimsView> {
  const today = dayOf(now);
  const where = claimWhere(companyId, query, scope, today);
  const range = periodRange(query.period, today);
  const voucherWhere: Prisma.PettyCashVoucherWhereInput = {
    companyId,
    ...(range ? { spentAt: range } : {}),
    ...(query.q ? { OR: [{ voucherNo: { contains: query.q, mode: "insensitive" } }, { description: { contains: query.q, mode: "insensitive" } }] } : {}),
  };
  const order = query.sort === "oldest" ? "asc" : "desc";
  const skip = (query.page - 1) * CLAIMS_PAGE_SIZE;
  const [claims, claimCount, voucherRows, voucherCount, floats, waiting, toPay, paidMonth, people] = await Promise.all([
    query.view === "claims"
      ? db.expenseClaim.findMany({ where, orderBy: { createdAt: order }, skip, take: CLAIMS_PAGE_SIZE, include: { claimant: { select: { id: true, name: true, image: true } }, lines: { orderBy: { sortOrder: "asc" }, take: 1, select: { description: true } } } })
      : Promise.resolve([]),
    db.expenseClaim.count({ where: query.view === "claims" ? where : { companyId, ...(scope.everyone ? {} : { claimantId: scope.userId }) } }),
    query.view === "vouchers"
      ? db.pettyCashVoucher.findMany({
          where: voucherWhere,
          orderBy: { spentAt: order },
          skip,
          take: CLAIMS_PAGE_SIZE,
          include: { float: { select: { name: true, currency: true } } },
        })
      : Promise.resolve([]),
    db.pettyCashVoucher.count({ where: voucherWhere }),
    db.bankAccount.findMany({ where: { companyId, isFloat: true, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, currency: true, imprestAmount: true, holder: { select: { name: true, image: true } } } }),
    db.expenseClaim.findMany({ where: { companyId, status: "SUBMITTED", currency: base, claimantId: { not: scope.userId } }, select: { total: true, claimant: { select: { name: true } } } }),
    db.expenseClaim.findMany({ where: { companyId, status: "APPROVED", currency: base }, orderBy: { approvedAt: "asc" }, select: { total: true, claimant: { select: { name: true } } } }),
    db.expenseClaim.aggregate({ where: { companyId, status: "PAID", currency: base, paidAt: { gte: harareStart(monthStart(today)) } }, _sum: { total: true } }),
    db.expenseClaim.findMany({ where: { companyId, ...(scope.everyone ? {} : { claimantId: scope.userId }) }, select: { claimant: { select: { id: true, name: true, image: true } } }, distinct: ["claimantId"] }),
  ]);
  // Each float: what it has spent since its last top-up (what a top-up brings back), and what is left of its imprest.
  const floatRows: FloatRow[] = [];
  for (const float of floats) {
    const last = await db.pettyCashVoucher.findFirst({ where: { companyId, bankAccountId: float.id, kind: "TOP_UP", status: "POSTED" }, orderBy: { postedAt: "desc" }, select: { postedAt: true } });
    const spent = await db.pettyCashVoucher.aggregate({ where: { companyId, bankAccountId: float.id, kind: "SPEND", status: "POSTED", ...(last?.postedAt ? { postedAt: { gt: last.postedAt } } : {}) }, _sum: { amount: true }, _count: true });
    const imprest = round(Number(float.imprestAmount ?? 0));
    const used = round(Number(spent._sum.amount ?? 0));
    floatRows.push({ id: float.id, name: float.name, holder: float.holder?.name ?? null, holderImage: float.holder?.image ?? null, currency: float.currency, imprest, spent: used, vouchers: spent._count, left: round(imprest - used) });
  }
  const of = query.view === "claims" ? claimCount : query.view === "vouchers" ? voucherCount : floatRows.length;
  const shown = query.view === "claims" ? claims.length : query.view === "vouchers" ? voucherRows.length : floatRows.length;
  const from = of === 0 ? 0 : query.view === "floats" ? 1 : skip + 1;
  const sum = (rows: Array<{ total: Prisma.Decimal | number }>) => round(rows.reduce((total, row) => total + Number(row.total), 0));
  return {
    finding: claimsFinding(
      waiting.map((row) => ({ name: row.claimant.name, amount: round(Number(row.total)) })),
      toPay.map((row) => ({ name: row.claimant.name, amount: round(Number(row.total)) })),
      base,
    ),
    counts: {
      claims: await db.expenseClaim.count({ where: { companyId, ...(scope.everyone ? {} : { claimantId: scope.userId }) } }),
      floats: floatRows.length,
      vouchers: await db.pettyCashVoucher.count({ where: { companyId } }),
    },
    claims: claims.map((claim) => ({
      id: claim.id,
      number: claim.claimNo ?? "Draft",
      person: claim.claimant,
      forWhat: claim.notes ?? claim.lines[0]?.description ?? "—",
      status: claim.status,
      state: CLAIM_STATE[claim.status],
      amount: round(Number(claim.total)),
      currency: claim.currency,
    })),
    floats: floatRows,
    vouchers: voucherRows.map((voucher) => ({
      id: voucher.id,
      number: voucher.voucherNo ?? "Draft",
      float: voucher.float.name,
      forWhat: voucher.description,
      date: shortDay(dayOf(voucher.spentAt)),
      slip: Boolean(voucher.receiptUrl),
      status: voucher.status,
      state: VOUCHER_STATE[voucher.status],
      amount: round(Number(voucher.amount)),
      currency: voucher.float.currency,
      createdById: voucher.createdById,
      kind: voucher.kind,
    })),
    range: { from, to: from === 0 ? 0 : from + shown - 1, of },
    sums: { toApprove: sum(waiting), toPay: sum(toPay), paidMonth: round(Number(paidMonth._sum.total ?? 0)), monthName: monthName(today) },
    currency: base,
    people: people.map((row) => row.claimant).sort((a, b) => a.name.localeCompare(b.name)),
    query,
  };
}

/** The page's read, with what this person may do and the money accounts a claim is paid back from (`GET /api/books/claims`). */
export type ClaimsPage = ClaimsView & {
  can: { approve: boolean; pay: boolean; topUp: boolean };
  me: string;
  accounts: Array<{ id: string; name: string; currency: string; isFloat: boolean }>;
};

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The tab as it reads, for Export: claims, floats or vouchers. */
export function claimsCsv(view: ClaimsView): string {
  const rows: Array<Array<string | number>> =
    view.query.view === "floats"
      ? [["Float", "Held by", "Imprest", "Spent since top-up", "Left"], ...view.floats.map((row) => [row.name, row.holder ?? "", row.imprest.toFixed(2), row.spent.toFixed(2), row.left.toFixed(2)])]
      : view.query.view === "vouchers"
        ? [["Voucher", "Float", "For", "Date", "Slip", "State", "Currency", "Amount"], ...view.vouchers.map((row) => [row.number, row.float, row.forWhat, row.date, row.slip ? "Photo" : "", row.state, row.currency, row.amount.toFixed(2)])]
        : [["Claim", "Person", "For", "State", "Currency", "Amount"], ...view.claims.map((row) => [row.number, row.person.name, row.forWhat, row.state, row.currency, row.amount.toFixed(2)])];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

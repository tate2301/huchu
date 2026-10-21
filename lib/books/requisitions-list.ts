import type { CrmRequisitionStatus, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { count, money, shortDay, dayOf } from "./format";
import { periodRange, PERIODS } from "./period";

/**
 * Books → Bills & spending → Requisitions (BkRequisitions): the CRM's and the
 * shop's requisitions as one list (books-final §4.11, §5.3), with where each
 * came from. The tabs follow the money: waiting for a yes, approved and
 * waiting to be paid out, paid out and waiting for its slips, done.
 */

export const REQUISITION_VIEWS = ["to-approve", "to-pay", "to-account", "done", "all"] as const;
export type RequisitionView = (typeof REQUISITION_VIEWS)[number];

export const REQUISITION_TAB_LABEL: Record<RequisitionView, string> = {
  "to-approve": "To approve",
  "to-pay": "To pay",
  "to-account": "To account for",
  done: "Done",
  all: "All",
};

const VIEW_STATUS: Record<Exclude<RequisitionView, "all">, CrmRequisitionStatus> = {
  "to-approve": "SUBMITTED",
  "to-pay": "APPROVED",
  "to-account": "DISBURSED",
  done: "ACQUITTED",
};

export const REQUISITION_STATE: Record<CrmRequisitionStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "To approve",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  DISBURSED: "Disbursed",
  ACQUITTED: "Acquitted",
  CANCELLED: "Cancelled",
};

export const REQUISITIONS_PAGE_SIZE = 50;

export const requisitionQuerySchema = z.object({
  view: z.enum(REQUISITION_VIEWS).catch("to-approve"),
  q: z.string().trim().max(100).catch(""),
  source: z.enum(["crm", "retail"]).nullable().catch(null),
  person: z.string().uuid().nullable().catch(null),
  period: z.enum(PERIODS).catch("any"),
  sort: z.enum(["newest", "oldest"]).catch("newest"),
  page: z.coerce.number().int().min(1).catch(1),
});
export type RequisitionQuery = z.infer<typeof requisitionQuerySchema>;

export function readRequisitionQuery(params: URLSearchParams): RequisitionQuery {
  return requisitionQuerySchema.parse({
    view: params.get("view") ?? undefined,
    q: params.get("q") ?? undefined,
    source: params.get("source") || null,
    person: params.get("person") || null,
    period: params.get("period") ?? undefined,
    sort: params.get("sort") ?? undefined,
    page: params.get("page") ?? undefined,
  });
}

export type RequisitionRow = {
  id: string;
  number: string;
  askedBy: { id: string; name: string; image: string | null };
  source: "CRM" | "Retail";
  purpose: string;
  /** The job it is for: the CRM deal's project, or the shop; null for fuel, airtime and the like. */
  job: string | null;
  asked: string;
  amount: number;
  currency: string;
  status: CrmRequisitionStatus;
  state: string;
  /** Over the limit it was asked under: only the owner approves it. */
  overLimit: boolean;
};

export type RequisitionsView = {
  finding: { fact: string; rest: string | null };
  rows: RequisitionRow[];
  range: { from: number; to: number; of: number };
  counts: Record<RequisitionView, number>;
  toApprove: number;
  currency: string;
  people: Array<{ id: string; name: string; image: string | null }>;
  query: RequisitionQuery;
};

type Db = Pick<PrismaClient, "crmRequisition">;

const round = (n: number) => Math.round(n * 100) / 100;
const payable = (row: { amount: Prisma.Decimal | number; approvedAmount: Prisma.Decimal | number | null; paidAmount?: Prisma.Decimal | number | null }) =>
  Number(row.paidAmount ?? row.approvedAmount ?? row.amount);
const possessive = (name: string) => `${name}${name.endsWith("s") ? "'" : "'s"}`;

/** "2 requisitions wait for you, $98.00." / "Simba Gondo's $95.00 is not accounted for yet." */
export function requisitionsFinding(
  forMe: { count: number; amount: number },
  unaccounted: Array<{ name: string; amount: number }>,
  currency = "USD",
): { fact: string; rest: string | null } {
  const fact = forMe.count === 0 ? "No requisition waits for you." : `${count(forMe.count, "requisition")} ${forMe.count === 1 ? "waits" : "wait"} for you, ${money(forMe.amount, currency)}.`;
  if (unaccounted.length === 0) return { fact, rest: null };
  if (unaccounted.length === 1) return { fact, rest: `${possessive(unaccounted[0].name)} ${money(unaccounted[0].amount, currency)} is not accounted for yet.` };
  return { fact, rest: `${unaccounted.length} paid out are not accounted for yet, ${money(unaccounted.reduce((sum, row) => sum + row.amount, 0), currency)} in all.` };
}

export function requisitionWhere(companyId: string, query: RequisitionQuery, today = dayOf(new Date())): Prisma.CrmRequisitionWhereInput {
  const where: Prisma.CrmRequisitionWhereInput = { companyId };
  if (query.view === "all") where.status = { not: "DRAFT" };
  else where.status = VIEW_STATUS[query.view];
  if (query.source === "crm") where.siteId = null;
  if (query.source === "retail") where.siteId = { not: null };
  if (query.person) where.requestedById = query.person;
  const range = periodRange(query.period, today);
  if (range) where.createdAt = range;
  if (query.q) {
    const q = { contains: query.q, mode: "insensitive" as const };
    where.OR = [{ requisitionNo: q }, { purpose: q }, { requestedBy: { name: q } }];
  }
  return where;
}

const rowSelect = {
  id: true,
  requisitionNo: true,
  status: true,
  siteId: true,
  purpose: true,
  amount: true,
  approvedAmount: true,
  paidAmount: true,
  approvalLimit: true,
  currency: true,
  submittedAt: true,
  createdAt: true,
  project: { select: { name: true } },
  site: { select: { name: true } },
  requestedBy: { select: { id: true, name: true, image: true } },
} satisfies Prisma.CrmRequisitionSelect;

type RowRecord = Prisma.CrmRequisitionGetPayload<{ select: typeof rowSelect }>;

export function toRequisitionRow(record: RowRecord): RequisitionRow {
  const amount = round(payable(record));
  return {
    id: record.id,
    number: record.requisitionNo ?? "Draft",
    askedBy: record.requestedBy,
    source: record.siteId ? "Retail" : "CRM",
    purpose: record.purpose,
    job: record.project?.name ?? record.site?.name ?? null,
    asked: shortDay(dayOf(record.submittedAt ?? record.createdAt)),
    amount,
    currency: record.currency,
    status: record.status,
    state: REQUISITION_STATE[record.status],
    overLimit: record.approvalLimit != null && amount > Number(record.approvalLimit) + 0.004,
  };
}

export async function readRequisitions(db: Db, companyId: string, query: RequisitionQuery, me: { userId: string; owner: boolean }, base = "USD"): Promise<RequisitionsView> {
  const where = requisitionWhere(companyId, query);
  const [records, matching, grouped, waiting, unaccounted, people] = await Promise.all([
    db.crmRequisition.findMany({ where, select: rowSelect, orderBy: [{ createdAt: query.sort === "oldest" ? "asc" : "desc" }], skip: (query.page - 1) * REQUISITIONS_PAGE_SIZE, take: REQUISITIONS_PAGE_SIZE }),
    db.crmRequisition.count({ where }),
    db.crmRequisition.groupBy({ by: ["status"], where: { companyId }, _count: true }),
    db.crmRequisition.findMany({ where: { companyId, status: "SUBMITTED", currency: base }, select: { amount: true, approvedAmount: true, approvalLimit: true, requestedById: true } }),
    db.crmRequisition.findMany({ where: { companyId, status: "DISBURSED", currency: base }, orderBy: { disbursedAt: "asc" }, select: { amount: true, approvedAmount: true, paidAmount: true, requestedBy: { select: { name: true } } } }),
    db.crmRequisition.findMany({ where: { companyId, status: { not: "DRAFT" } }, select: { requestedBy: { select: { id: true, name: true, image: true } } }, distinct: ["requestedById"] }),
  ]);
  const byStatus = new Map(grouped.map((row) => [row.status, row._count]));
  const counts: Record<RequisitionView, number> = {
    "to-approve": byStatus.get("SUBMITTED") ?? 0,
    "to-pay": byStatus.get("APPROVED") ?? 0,
    "to-account": byStatus.get("DISBURSED") ?? 0,
    done: byStatus.get("ACQUITTED") ?? 0,
    all: grouped.filter((row) => row.status !== "DRAFT").reduce((sum, row) => sum + row._count, 0),
  };
  // Waiting for this person: not their own, and over its limit only for the owner.
  const mine = waiting.filter((row) => row.requestedById !== me.userId && (me.owner || row.approvalLimit == null || payable(row) <= Number(row.approvalLimit) + 0.004));
  const rows = records.map(toRequisitionRow);
  const from = matching === 0 ? 0 : (query.page - 1) * REQUISITIONS_PAGE_SIZE + 1;
  return {
    finding: requisitionsFinding(
      { count: mine.length, amount: round(mine.reduce((sum, row) => sum + payable(row), 0)) },
      unaccounted.map((row) => ({ name: row.requestedBy.name, amount: round(payable(row)) })),
      base,
    ),
    rows,
    range: { from, to: from === 0 ? 0 : from + rows.length - 1, of: matching },
    counts,
    toApprove: round(waiting.reduce((sum, row) => sum + payable(row), 0)),
    currency: base,
    people: people.map((row) => row.requestedBy).sort((a, b) => a.name.localeCompare(b.name)),
    query,
  };
}

/** The list as its page reads it, with what this person may do (`GET /api/books/requisitions`). */
export type RequisitionsPage = RequisitionsView & { can: { approve: boolean; create: boolean }; me: string; owner: boolean };

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The list as filtered, every page, for Export. */
export async function requisitionsCsv(db: Db, companyId: string, query: RequisitionQuery): Promise<string> {
  const records = await db.crmRequisition.findMany({ where: requisitionWhere(companyId, query), select: rowSelect, orderBy: [{ createdAt: "desc" }], take: 10_000 });
  const lines = [["Number", "Who", "For", "Job", "Source", "State", "Currency", "Amount"].join(",")];
  for (const record of records) {
    const row = toRequisitionRow(record);
    lines.push([row.number, row.askedBy.name, row.purpose, row.job ?? "", row.source, row.state, row.currency, row.amount.toFixed(2)].map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

import type { CrmRequisitionStatus, PrismaClient } from "@prisma/client";

import { dayOf, shortDay, weekdayDay } from "./format";
import { facesOf, historyOf, historyWhen, postingRows, type Faces, type HistoryItem, type PostingRow } from "./record-view";
import { REQUISITION_STATE } from "./requisitions-list";

/**
 * One requisition (BkRequisition, and BkRequisitionPhone on a phone), the
 * CRM's or the shop's: the request, its approval, the money paid out, the
 * slips it was accounted for with, the change returned or the top-up, what
 * it posted (through cash advances, books-final §4.11) and its history.
 */

export const CATEGORY_WORD: Record<string, string> = {
  FUEL: "Fuel",
  AIRTIME: "Airtime",
  TRANSPORT: "Transport",
  MATERIALS: "Materials",
  EQUIPMENT: "Equipment",
  LABOUR: "Labour",
  SUBSISTENCE: "Food",
  ACCOMMODATION: "Accommodation",
  OTHER: "Other",
  STOCK: "Stock purchase",
};

export type RequisitionSlip = { id: string; slip: { url: string; name: string } | null; what: string; expense: string; fdms: "Not checked" | null; vat: number | null; amount: number };

export type RequisitionRecord = {
  id: string;
  number: string;
  status: CrmRequisitionStatus;
  state: string;
  source: "CRM" | "Retail";
  purpose: string;
  currency: string;
  asked: number;
  askedBy: { id: string; name: string; role: string | null };
  /** Given (paid out), spent (the slips), the change handed back, a top-up paid; null before each happened. */
  money: { given: number | null; givenHow: string | null; spent: number | null; change: number | null; changeOn: string | null; topUp: number | null; withThem: number | null };
  slips: RequisitionSlip[];
  posting: PostingRow[];
  entries: number;
  history: HistoryItem[];
  /** Every person it names, with their photo: the asker, the approver, who paid out, who closed. */
  faces: Faces;
  request: { for: string | null; needed: string | null; paidFrom: string | null; costCentre: string | null };
  people: { approved: string | null; paidOut: string | null; closed: string | null };
  /** The requester's three before this one: how many are accounted for. */
  lastThree: { count: number; accounted: number };
  /** Who usually pays out: the last person who paid out one of theirs. */
  paysOut: string | null;
  requestedById: string;
  overLimit: boolean;
  decisionNote: string | null;
};

type Db = Pick<PrismaClient, "crmRequisition" | "journalEntry" | "retailAttachment">;

const round = (n: number) => Math.round(n * 100) / 100;
const num = (value: unknown) => (value === null || value === undefined ? null : round(Number(value)));
const ROLE_WORD: Record<string, string> = { SUPERADMIN: "owner", MANAGER: "manager", FINANCE_OFFICER: "accountant", SALES_REP: "rep", SALES_EXEC: "rep", CLERK: "clerk", CASHIER: "cashier", STOCK_CLERK: "stock clerk", SHOP_MANAGER: "shop manager" };

const SOURCES = ["CRM_REQUISITION_DISBURSEMENT", "RETAIL_REQUISITION_PAYOUT", "REQUISITION_ACQUITTAL", "CRM_REQUISITION_REFUND", "CRM_REQUISITION_TOPUP", "RETAIL_REQUISITION_CHANGE"] as const;

export async function readRequisitionRecord(db: Db, companyId: string, id: string, now = new Date()): Promise<RequisitionRecord | null> {
  const row = await db.crmRequisition.findFirst({
    where: { id, companyId },
    include: {
      requestedBy: { select: { id: true, name: true, role: true, image: true } },
      approvedBy: { select: { name: true, image: true } },
      disbursedBy: { select: { name: true, image: true } },
      acquittedBy: { select: { name: true, image: true } },
      cancelledBy: { select: { name: true, image: true } },
      bankAccount: { select: { name: true } },
      changeAccount: { select: { name: true } },
      project: { select: { name: true, costCenter: { select: { name: true } } } },
      site: { select: { name: true } },
      costEntries: { where: { direction: "SPENT" }, orderBy: { createdAt: "asc" }, select: { id: true, description: true, category: true, amount: true, receiptUrl: true, createdAt: true, log: { select: { user: { select: { name: true, image: true } } } } } },
    },
  });
  if (!row) return null;
  const [entries, receipts, earlier, payer] = await Promise.all([
    db.journalEntry.findMany({
      where: {
        companyId,
        sourceType: { in: [...SOURCES] },
        OR: [{ sourceId: id }, { sourceId: { startsWith: `${id}:` } }, { sourceId: `void:${id}` }, { sourceId: { startsWith: `void:${id}:` } }],
      },
      orderBy: [{ entryDate: "asc" }, { entryNumber: "asc" }],
      select: { entryNumber: true, entryDate: true, lines: { select: { debit: true, credit: true, account: { select: { code: true, name: true } } } } },
    }),
    row.siteId ? db.retailAttachment.findMany({ where: { companyId, entityType: "CrmRequisition", entityId: id, kind: "RECEIPT" }, orderBy: { createdAt: "asc" }, select: { id: true, url: true, name: true } }) : Promise.resolve([]),
    db.crmRequisition.findMany({ where: { companyId, requestedById: row.requestedById, id: { not: id }, status: { in: ["DISBURSED", "ACQUITTED"] }, createdAt: { lt: row.createdAt } }, orderBy: { createdAt: "desc" }, take: 3, select: { status: true } }),
    db.crmRequisition.findFirst({ where: { companyId, requestedById: row.requestedById, disbursedById: { not: null }, id: { not: id } }, orderBy: { disbursedAt: "desc" }, select: { disbursedBy: { select: { name: true, image: true } } } }),
  ]);
  const asked = round(Number(row.approvedAmount ?? row.amount));
  const given = num(row.paidAmount ?? (row.disbursedAt ? (row.approvedAmount ?? row.amount) : null));
  const spentLines = row.costEntries.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const spent = row.acquittedAt ? num(row.acquittedAmount ?? spentLines) : row.costEntries.length ? round(spentLines) : null;
  const change = num(row.changeAmount);
  const topUp = row.acquittedAt && given !== null && spent !== null && spent > given + 0.004 ? round(spent - given) : null;
  const withThem = given === null ? null : row.acquittedAt ? 0 : round(given - (spent ?? 0));
  const slips: RequisitionSlip[] = row.siteId
    ? receipts.map((receipt) => ({ id: receipt.id, slip: { url: receipt.url, name: receipt.name }, what: receipt.name, expense: CATEGORY_WORD[row.category] ?? "Other", fdms: "Not checked", vat: null, amount: 0 }))
    : row.costEntries.map((entry) => ({
        id: entry.id,
        slip: entry.receiptUrl ? { url: entry.receiptUrl, name: "Slip" } : null,
        what: entry.description,
        expense: CATEGORY_WORD[entry.category] ?? "Other",
        fdms: "Not checked",
        vat: null,
        amount: round(Number(entry.amount)),
      }));

  const history: Array<HistoryItem & { at: Date }> = [];
  const when = (value: Date) => historyWhen(value, now);
  const asker = row.requestedBy.name;
  history.push({ tone: "", text: `${asker} asked for ${row.currency === "USD" ? "$" : `${row.currency} `}${asked.toFixed(2)}`, when: when(row.submittedAt ?? row.createdAt), at: row.submittedAt ?? row.createdAt });
  if (row.approvedAt && row.status !== "REJECTED") history.push({ tone: "ok", text: `${row.approvedBy?.name ?? "Someone"} approved it`, when: when(row.approvedAt), at: row.approvedAt });
  if (row.status === "REJECTED" && row.approvedAt) history.push({ tone: "wa", text: `${row.approvedBy?.name ?? "Someone"} did not approve it${row.decisionNote ? `: ${row.decisionNote}` : ""}`, when: when(row.approvedAt), at: row.approvedAt });
  if (row.disbursedAt) history.push({ tone: "in", text: `${row.disbursedBy?.name ?? "Someone"} paid out ${given?.toFixed(2) ?? ""}${row.bankAccount ? ` from ${row.bankAccount.name}` : ""}`, when: when(row.disbursedAt), at: row.disbursedAt });
  if (slips.length && (row.costEntries.length || receipts.length)) {
    const last = row.costEntries[row.costEntries.length - 1]?.createdAt ?? row.acquittedAt ?? row.updatedAt;
    history.push({ tone: "in", text: `${row.costEntries[0]?.log.user.name ?? asker} added ${slips.length === 1 ? "1 slip" : `${slips.length} slips`}`, when: when(last), at: last });
  }
  if (row.acquittedAt) history.push({ tone: "ok", text: `${row.acquittedBy?.name ?? "Someone"} closed it`, when: when(row.acquittedAt), at: new Date(row.acquittedAt.getTime() + 1) });
  if (row.cancelledAt) history.push({ tone: "wa", text: `${row.cancelledBy?.name ?? "Someone"} cancelled it`, when: when(row.cancelledAt), at: row.cancelledAt });

  return {
    id: row.id,
    number: row.requisitionNo ?? "Draft",
    status: row.status,
    state: REQUISITION_STATE[row.status],
    source: row.siteId ? "Retail" : "CRM",
    purpose: row.purpose,
    currency: row.currency,
    asked,
    askedBy: { id: row.requestedBy.id, name: row.requestedBy.name, role: ROLE_WORD[(row.requestedBy.role ?? "").toUpperCase()] ?? null },
    money: {
      given,
      givenHow: row.disbursedAt ? `${row.payoutMethod === "BANK_TRANSFER" ? "Transfer" : row.payoutMethod === "ECOCASH" ? "EcoCash" : "Cash"}, ${shortDay(dayOf(row.disbursedAt))}` : null,
      spent,
      change,
      changeOn: change && row.acquittedAt ? `Counted ${shortDay(dayOf(row.acquittedAt))}` : null,
      topUp,
      withThem,
    },
    slips,
    posting: postingRows(entries),
    entries: entries.length,
    history: historyOf(history),
    faces: facesOf(row.requestedBy, row.approvedBy, row.disbursedBy, row.acquittedBy, row.cancelledBy, row.costEntries[0]?.log.user, payer?.disbursedBy),
    request: {
      for: row.project?.name ?? row.site?.name ?? null,
      needed: row.neededBy ? weekdayDay(dayOf(row.neededBy)) : null,
      paidFrom: row.bankAccount?.name ?? null,
      costCentre: row.project?.costCenter?.name ?? (row.project ? `Project · ${row.project.name}` : null),
    },
    people: { approved: row.status === "REJECTED" ? null : (row.approvedBy?.name ?? null), paidOut: row.disbursedBy?.name ?? null, closed: row.acquittedBy?.name ?? null },
    lastThree: { count: earlier.length, accounted: earlier.filter((one) => one.status === "ACQUITTED").length },
    paysOut: payer?.disbursedBy?.name ?? null,
    requestedById: row.requestedById,
    overLimit: row.approvalLimit != null && asked > Number(row.approvalLimit) + 0.004,
    decisionNote: row.decisionNote,
  };
}

/** The requisition as its page reads it, with what this person may do (`GET /api/books/requisitions/[id]`). */
export type RequisitionRecordPage = RequisitionRecord & {
  can: { decide: boolean; why: string | null; reopen: boolean };
  /** Where it is paid out and accounted for: the CRM's or the shop's own page. */
  sourceHref: string;
};

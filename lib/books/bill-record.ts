import type { FdmsCheckStatus, PrismaClient } from "@prisma/client";

import { docLabel } from "./doc-number";
import { billState, EXPENSE_STATE_LABEL, type ExpenseState } from "./expenses";
import { count, dayOf, shortDay, storedDay } from "./format";
import { historyOf, historyWhen, postingRows, type HistoryItem, type PostingRow } from "./record-view";

/**
 * One supplier's bill (BkBill): its total and state, the FDMS check on the
 * supplier's fiscal invoice (D16), its lines and sums, the order and goods
 * receipt it matches (D12), the payments on it (drafts and those waiting for
 * approval too, D5), what it posted and its history. On the right, their
 * fiscal invoice and the details. Read from the records; nothing is kept twice.
 */

export const PAYMENT_STATE_LABEL: Record<string, string> = { DRAFT: "Draft", TO_APPROVE: "To approve", APPROVED: "Approved", PAID: "Paid", VOIDED: "Void" };

export type BillMatchRow = { item: string; ordered: string | null; received: string | null; billed: string | null; differs: boolean };

export type BillRecord = {
  id: string;
  number: string;
  status: "DRAFT" | "RECEIVED" | "PAID" | "VOIDED";
  state: ExpenseState;
  stateLabel: string;
  /** "Due 16 Oct, 2 days ago", "Due 30 Oct", "Paid". */
  dueLine: string;
  supplier: { id: string; name: string; vatNumber: string | null; terms: string };
  currency: string;
  subTotal: number;
  taxTotal: number;
  /** "VAT at 15.5%" when every line has one rate. */
  taxLabel: string;
  total: number;
  paid: number;
  debitNotes: number;
  writtenOff: number;
  balance: number;
  lines: Array<{ id: string; description: string; quantity: number; unitPrice: number; amount: number; taxRate: number; taxCodeId: string | null }>;
  fti: { number: string | null; dated: string; fdms: FdmsCheckStatus; checked: string | null };
  /** The order and goods receipt it was made from; null when it was entered by hand. */
  match: {
    order: { id: string; number: string } | null;
    /** `account`: where the goods receipt put the goods ("1200 Stock"), what each of its lines is billed to. */
    receipt: { id: string; number: string; counted: string | null; by: string | null; account: string | null } | null;
    rows: BillMatchRow[];
    differs: number;
  } | null;
  payments: Array<{ id: string; number: string; date: string; from: string | null; state: string; status: string; amount: number }>;
  posting: PostingRow[];
  entries: number;
  history: HistoryItem[];
  details: { for: string | null; madeBy: string | null; approvedBy: string | null };
  photo: { url: string; name: string } | null;
  needsReview: boolean;
  notes: string | null;
};

type Db = Pick<PrismaClient, "purchaseBill" | "journalEntry" | "retailAttachment" | "user">;

const round = (n: number) => Math.round(n * 100) / 100;
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
const key = (name: string) => name.trim().toLowerCase();

export function termsWord(days: number | null | undefined): string {
  if (days === null || days === undefined) return "On delivery";
  if (days === 0) return "On receipt";
  return `${days} days`;
}

/** "Due 16 Oct, 2 days ago" for one overdue; "Due 30 Oct"; the state's own words otherwise. */
export function dueLine(state: ExpenseState, due: string | null, today: string): string {
  if (!due) return state === "paid" ? "Paid" : "No due date";
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000);
  if (state === "overdue") return `Due ${shortDay(due)}, ${count(days, "day")} ago`;
  if (state === "paid") return "Paid";
  if (state === "void") return "Void";
  return days === 0 ? "Due today" : `Due ${shortDay(due)}`;
}

/** Ordered, received and billed, item by item, by name: "40 m²", "40 m², 12 Oct". */
export function matchRows(
  ordered: Array<{ itemName: string; quantity: number }>,
  received: Array<{ itemName: string; quantity: number; day: string | null }>,
  billed: Array<{ description: string; quantity: number }>,
): BillMatchRow[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const name of [...ordered.map((row) => row.itemName), ...received.map((row) => row.itemName), ...billed.map((row) => row.description)]) {
    if (seen.has(key(name))) continue;
    seen.add(key(name));
    names.push(name);
  }
  const sum = <T>(rows: T[], name: string, pick: (row: T) => string, amount: (row: T) => number) =>
    rows.filter((row) => key(pick(row)) === key(name)).reduce((total, row) => total + amount(row), 0);
  return names.map((name) => {
    const o = ordered.some((row) => key(row.itemName) === key(name)) ? sum(ordered, name, (row) => row.itemName, (row) => row.quantity) : null;
    const r = received.some((row) => key(row.itemName) === key(name)) ? sum(received, name, (row) => row.itemName, (row) => row.quantity) : null;
    const b = billed.some((row) => key(row.description) === key(name)) ? sum(billed, name, (row) => row.description, (row) => row.quantity) : null;
    const day = received.find((row) => key(row.itemName) === key(name))?.day ?? null;
    const present = [ordered.length ? o : undefined, received.length ? r : undefined, b].filter((value) => value !== undefined);
    const differs = present.some((value) => value === null || Math.abs((value ?? 0) - (present[0] ?? 0)) > 0.0001);
    return {
      item: name,
      ordered: o === null ? null : qty(o),
      received: r === null ? null : `${qty(r)}${day ? `, ${shortDay(day)}` : ""}`,
      billed: b === null ? null : qty(b),
      differs,
    };
  });
}

export async function readBillRecord(db: Db, companyId: string, id: string, now = new Date()): Promise<BillRecord | null> {
  const bill = await db.purchaseBill.findFirst({
    where: { id, companyId },
    include: {
      vendor: { select: { id: true, name: true, vatNumber: true, payTermsDays: true } },
      lines: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "asc" }, include: { bankAccount: { select: { name: true, bankName: true, currency: true } }, createdBy: { select: { name: true } } } },
      debitNotes: { select: { noteNumber: true, status: true, total: true, issuedAt: true, createdAt: true } },
      writeOffs: { select: { writeOffNumber: true, amount: true, createdAt: true, status: true } },
      purchaseOrder: { select: { id: true, poNo: true, site: { select: { name: true } }, lines: { select: { itemName: true, quantity: true } } } },
      goodsReceipt: {
        select: {
          id: true,
          receiptNo: true,
          postedAt: true,
          createdAt: true,
          countedBy: { select: { name: true } },
          receivedBy: { select: { name: true } },
          purchaseOrder: { select: { id: true, poNo: true, site: { select: { name: true } }, lines: { select: { itemName: true, quantity: true } } } },
          lines: { select: { itemName: true, quantity: true } },
        },
      },
      createdBy: { select: { name: true } },
      issuedBy: { select: { name: true } },
    },
  });
  if (!bill) return null;
  const today = dayOf(now);
  const read = billState(bill, today);
  const due = bill.dueDate ? storedDay(bill.dueDate) : null;
  const paymentIds = bill.payments.map((payment) => payment.id);
  const [entries, photo, people] = await Promise.all([
    db.journalEntry.findMany({
      where: {
        companyId,
        OR: [
          { sourceType: "PURCHASE_BILL", sourceId: { in: [bill.id, `${bill.id}:fdms`] } },
          { sourceId: { in: [`void:${bill.id}`, `void:${bill.id}:fdms`] } },
          ...(bill.goodsReceiptId ? [{ sourceType: "RETAIL_GOODS_RECEIPT" as const, sourceId: bill.goodsReceiptId }] : []),
          ...(paymentIds.length ? [{ sourceType: "PURCHASE_PAYMENT" as const, sourceId: { in: paymentIds } }] : []),
        ],
      },
      orderBy: [{ entryDate: "asc" }, { entryNumber: "asc" }],
      select: { entryNumber: true, entryDate: true, sourceType: true, lines: { select: { debit: true, credit: true, account: { select: { code: true, name: true } } } } },
    }),
    db.retailAttachment.findFirst({ where: { companyId, entityType: "PurchaseBill", entityId: bill.id }, orderBy: { createdAt: "desc" }, select: { url: true, name: true } }),
    db.user.findMany({ where: { id: { in: [bill.approvedById, bill.fdmsCheckedById].filter((value): value is string => Boolean(value)) } }, select: { id: true, name: true } }),
  ]);
  const name = new Map(people.map((person) => [person.id, person.name]));
  const stocked = entries.find((entry) => entry.sourceType === "RETAIL_GOODS_RECEIPT")?.lines.find((line) => line.debit > 0)?.account;
  const order = bill.purchaseOrder ?? bill.goodsReceipt?.purchaseOrder ?? null;
  const receipt = bill.goodsReceipt;
  const receivedDay = receipt ? dayOf(receipt.postedAt ?? receipt.createdAt) : null;
  const rows =
    order || receipt
      ? matchRows(
          (order?.lines ?? []).map((line) => ({ itemName: line.itemName, quantity: Number(line.quantity) })),
          (receipt?.lines ?? []).map((line) => ({ itemName: line.itemName, quantity: Number(line.quantity), day: receivedDay })),
          bill.lines.map((line) => ({ description: line.description, quantity: line.quantity })),
        )
      : [];
  const rates = [...new Set(bill.lines.map((line) => line.taxRate))];
  const paidLive = bill.payments.filter((payment) => payment.status === "PAID");

  const history: Array<HistoryItem & { at: Date }> = [];
  const when = (value: Date) => historyWhen(value, now);
  history.push({ tone: "", text: receipt ? `Draft bill made from ${receipt.receiptNo}` : `${bill.createdBy?.name ?? "Someone"} drafted it`, when: when(bill.createdAt), at: bill.createdAt });
  if (receipt) {
    const counted = receipt.postedAt ?? receipt.createdAt;
    history.push({ tone: "ok", text: `${receipt.countedBy?.name ?? receipt.receivedBy?.name ?? "Someone"} counted in ${receipt.receiptNo}`, when: when(counted), at: new Date(counted.getTime() - 1) });
  }
  if (bill.approvedAt) history.push({ tone: "ok", text: `${name.get(bill.approvedById ?? "") ?? "The owner"} approved it`, when: when(bill.approvedAt), at: bill.approvedAt });
  if (bill.issuedAt) history.push({ tone: "in", text: `${bill.issuedBy?.name ?? "Someone"} recorded it`, when: when(bill.issuedAt), at: bill.issuedAt });
  if (bill.fdmsCheckedAt && bill.fdmsStatus !== "NOT_CHECKED") {
    history.push({ tone: bill.fdmsStatus === "VALID" ? "ok" : "wa", text: `${name.get(bill.fdmsCheckedById ?? "") ?? "Someone"} checked it on FDMS: ${bill.fdmsStatus === "VALID" ? "valid" : "not valid"}`, when: when(bill.fdmsCheckedAt), at: bill.fdmsCheckedAt });
  }
  if (read.state === "overdue" && due) history.push({ tone: "wa", text: `Overdue: it was due on ${shortDay(due)}`, when: shortDay(due), at: new Date(`${due}T23:59:59Z`) });
  for (const payment of bill.payments) {
    const number = payment.paymentNumber ?? "a payment";
    if (payment.status === "PAID") history.push({ tone: "ok", text: `${number} paid it`, when: when(payment.paidAt), at: payment.paidAt });
    else if (payment.status !== "VOIDED") history.push({ tone: "wa", text: `${payment.createdBy?.name ?? "Someone"} drafted a payment for you`, when: when(payment.createdAt), at: payment.createdAt });
    if (payment.voidedAt) history.push({ tone: "wa", text: `${number} was voided`, when: when(payment.voidedAt), at: payment.voidedAt });
  }
  for (const note of bill.debitNotes) {
    if (note.status === "DRAFT") continue;
    const at = note.issuedAt ?? note.createdAt;
    history.push({ tone: "wa", text: `${note.noteNumber ?? "A debit note"} took ${note.total.toFixed(2)} off it`, when: when(at), at });
  }
  for (const writeOff of bill.writeOffs) history.push({ tone: "wa", text: `${writeOff.writeOffNumber ?? "A write-off"} wrote off what was left`, when: when(writeOff.createdAt), at: writeOff.createdAt });

  const centre = order?.site?.name ?? null;
  return {
    id: bill.id,
    number: docLabel(bill.billNumber, "bill"),
    status: bill.status,
    state: read.state,
    stateLabel: EXPENSE_STATE_LABEL[read.state],
    dueLine: dueLine(read.state, due, today),
    supplier: { id: bill.vendor.id, name: bill.vendor.name, vatNumber: bill.vendor.vatNumber, terms: termsWord(bill.vendor.payTermsDays) },
    currency: bill.currency,
    subTotal: round(bill.subTotal),
    taxTotal: round(bill.taxTotal),
    taxLabel: rates.length === 1 && rates[0]! > 0 ? `VAT at ${rates[0]}%` : "VAT",
    total: round(bill.total),
    paid: round(paidLive.reduce((sum, payment) => sum + payment.amount, 0)),
    debitNotes: round(bill.debitNoteTotal),
    writtenOff: round(bill.writeOffTotal),
    balance: read.balance,
    lines: bill.lines.map((line) => ({ id: line.id, description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, amount: round(line.quantity * line.unitPrice), taxRate: line.taxRate, taxCodeId: line.taxCodeId })),
    fti: {
      number: bill.supplierFtiNumber,
      dated: storedDay(bill.billDate),
      fdms: bill.fdmsStatus,
      checked: bill.fdmsCheckedAt ? when(bill.fdmsCheckedAt) : null,
    },
    match:
      order || receipt
        ? {
            order: order ? { id: order.id, number: order.poNo } : null,
            receipt: receipt
              ? { id: receipt.id, number: receipt.receiptNo, counted: receivedDay ? shortDay(receivedDay) : null, by: receipt.countedBy?.name ?? receipt.receivedBy?.name ?? null, account: stocked ? `${stocked.code} ${stocked.name}` : null }
              : null,
            rows,
            differs: rows.filter((row) => row.differs).length,
          }
        : null,
    payments: bill.payments.map((payment) => ({
      id: payment.id,
      number: payment.paymentNumber ?? "Draft",
      date: shortDay(storedDay(payment.paidAt)),
      from: payment.bankAccount ? `${payment.bankAccount.bankName || payment.bankAccount.name}, ${payment.bankAccount.currency}` : null,
      state: PAYMENT_STATE_LABEL[payment.status] ?? payment.status,
      status: payment.status,
      amount: round(payment.amount),
    })),
    posting: postingRows(entries, { code: "2000", name: bill.vendor.name }),
    entries: entries.length,
    history: historyOf(history),
    details: { for: centre, madeBy: bill.createdBy?.name ?? null, approvedBy: name.get(bill.approvedById ?? "") ?? null },
    photo,
    needsReview: bill.needsReview,
    notes: bill.notes,
  };
}

/** The bill as its page reads it: the record, the limit it is held to, and what this person may do (`/api/books/bills/[id]`). */
export type BillRecordPage = BillRecord & {
  limit: number;
  owner: string | null;
  can: {
    record: boolean;
    approve: boolean;
    check: boolean;
    pay: boolean;
    approvePayment: { id: string; number: string; allowed: boolean } | null;
    payApproved: { id: string; allowed: boolean } | null;
    note: boolean;
    writeOff: boolean;
    void: boolean;
    delete: boolean;
  };
};

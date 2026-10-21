import type { PrismaClient, PurchasePaymentStatus } from "@prisma/client";

import { imttOn } from "./core/bank";
import { moneyLimits } from "./core/approvals";
import { taxSettings } from "./core/tax-settings";
import { quoteWithholding } from "./core/withholding";
import { docLabel } from "./doc-number";
import { dayOf, shortDay, storedDay } from "./format";
import { itf263State } from "./itf263";
import { PAYMENT_OUT_STATE } from "./payments-out";
import { facesOf, historyOf, historyWhen, postingRows, type Faces, type HistoryItem, type PostingRow } from "./record-view";
import { resolveBaseCurrency } from "@/lib/money";

/**
 * One payment made (BkPaymentMade): who is paid and from which account, the
 * bill it clears, what is withheld for ZIMRA and the IMTT the bank takes
 * (D17, §5.8.3), the approval chain (D5: nobody approves their own; the
 * approver does not also pay; over the limit the owner approves, the limit
 * as it was when it was sent), what it posted and its history.
 */

export type PaymentOutStep = {
  key: "drafted" | "approves" | "pays";
  label: string;
  /** Who did it, or null while nobody has. */
  person: { name: string; image: string | null } | null;
  done: boolean;
  /** Their role and why: "Owner, over the US$500.00 limit". */
  sub: string | null;
};

export type PaymentOutRecord = {
  id: string;
  number: string | null;
  status: PurchasePaymentStatus;
  state: string;
  currency: string;
  supplier: { id: string; name: string; itf263: "Valid" | "Expired" | "None" } | null;
  bill: { id: string; number: string; theirFti: string | null; due: string | null; owing: number } | null;
  from: { name: string; currency: string } | null;
  /** The day it is to be paid, or was. */
  on: string;
  reference: string | null;
  method: string;
  gross: number;
  withheld: number;
  /** What the supplier is paid. */
  paid: number;
  imtt: number;
  /** What leaves the account: paid plus the IMTT. */
  leaves: number;
  withholding: { rate: number; type: string | null; certificateNo: string | null; dueBy: string };
  imttRate: number;
  chain: PaymentOutStep[];
  posting: PostingRow[];
  entries: number;
  history: HistoryItem[];
  faces: Faces;
  madeById: string | null;
  approvedById: string | null;
  voided: { on: string; reason: string | null } | null;
};

type Db = Pick<PrismaClient, "purchasePayment" | "journalEntry" | "user">;

const round = (n: number) => Math.round(n * 100) / 100;
const ROLE_WORD: Record<string, string> = { SUPERADMIN: "Owner", MANAGER: "Manager", FINANCE_OFFICER: "Accountant", SALES_REP: "Rep", SALES_EXEC: "Rep", CLERK: "Clerk", CASHIER: "Cashier", STOCK_CLERK: "Stock clerk", SHOP_MANAGER: "Shop manager" };

export async function readPaymentOutRecord(db: Db, companyId: string, id: string, base?: string, now = new Date()): Promise<PaymentOutRecord | null> {
  const row = await db.purchasePayment.findFirst({
    where: { id, companyId },
    include: {
      vendor: { select: { id: true, name: true, itf263Number: true, itf263ExpiresAt: true } },
      bankAccount: { select: { name: true, currency: true } },
      createdBy: { select: { id: true, name: true, role: true, image: true } },
      bill: { select: { id: true, billNumber: true, currency: true, dueDate: true, supplierFtiNumber: true, total: true, amountPaid: true, debitNoteTotal: true, writeOffTotal: true, vendor: { select: { id: true, name: true, itf263Number: true, itf263ExpiresAt: true } } } },
    },
  });
  if (!row) return null;
  const supplier = row.vendor ?? row.bill?.vendor ?? null;
  const baseCurrency = base ?? (await resolveBaseCurrency(companyId)).toUpperCase();
  const currency = (row.bill?.currency ?? row.bankAccount?.currency ?? baseCurrency).toUpperCase();
  const settled = row.status === "PAID" || row.status === "VOIDED";
  const [settings, limits, entries, people] = await Promise.all([
    taxSettings(companyId),
    moneyLimits(companyId),
    db.journalEntry.findMany({
      where: { companyId, OR: [{ sourceType: "PURCHASE_PAYMENT", sourceId: id }, { sourceId: `void:${id}` }] },
      orderBy: [{ entryDate: "asc" }, { entryNumber: "asc" }],
      select: { entryNumber: true, entryDate: true, lines: { select: { debit: true, credit: true, account: { select: { code: true, name: true } } } } },
    }),
    db.user.findMany({ where: { id: { in: [row.approverId, row.approvedById, row.paidById, row.voidedById].filter((value): value is string => Boolean(value)) } }, select: { id: true, name: true, role: true, image: true } }),
  ]);
  const who = new Map(people.map((person) => [person.id, person]));
  const withheld = settled
    ? round(row.withholdingAmount)
    : (await quoteWithholding(companyId, { vendorId: supplier?.id ?? null, billId: row.bill?.id ?? null, amount: row.amount, currency, date: now, exceptPaymentId: row.id })).total;
  const paid = round(row.amount - withheld);
  const imtt = paid > 0 ? imttOn(paid, currency, settings, baseCurrency, row.exchangeRate) : 0;
  const due = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, settings.withholding.paymentDay));

  const limit = row.approvalLimit != null ? Number(row.approvalLimit) : limits.paymentOwnerOver;
  const limitWord = `${currency === "USD" ? "US$" : `${currency} `}${limit.toFixed(2)}`;
  const over = row.amount > limit + 0.004;
  const approver = (row.approvedById && who.get(row.approvedById)) || (row.approverId && who.get(row.approverId)) || null;
  const approverPerson = approver ? { name: approver.name, image: approver.image ?? null } : null;
  const approved = row.status === "APPROVED" || row.status === "PAID" || row.status === "VOIDED";
  const payer = row.paidById ? who.get(row.paidById) : null;
  const chain: PaymentOutStep[] = [
    { key: "drafted", label: "Drafted by", person: row.createdBy ? { name: row.createdBy.name, image: row.createdBy.image ?? null } : null, done: true, sub: ROLE_WORD[(row.createdBy?.role ?? "").toUpperCase()] ?? null },
    {
      key: "approves",
      label: row.status === "DRAFT" ? "Approves" : approved ? "Approved by" : "Approves",
      person: approverPerson ?? (row.status === "DRAFT" && over && limits.ownerApprover ? { name: limits.ownerApprover.name, image: null } : null),
      done: approved,
      sub: over ? `${ROLE_WORD[(approver?.role ?? "SUPERADMIN").toUpperCase()] ?? "Owner"}, over the ${limitWord} limit` : approved && !approver ? `Within the ${limitWord} limit` : row.status === "DRAFT" ? `Not needed within the ${limitWord} limit` : approver ? (ROLE_WORD[(approver.role ?? "").toUpperCase()] ?? null) : null,
    },
    {
      key: "pays",
      label: row.status === "PAID" || row.status === "VOIDED" ? "Paid by" : "Pays",
      person: payer ? { name: payer.name, image: payer.image ?? null } : null,
      done: Boolean(row.paidById),
      sub: payer ? (ROLE_WORD[(payer.role ?? "").toUpperCase()] ?? null) : approver ? `Not ${approver.name}` : "Not the one who approved",
    },
  ];

  const when = (value: Date) => historyWhen(value, now);
  const history: Array<HistoryItem & { at: Date }> = [{ tone: "", text: `${row.createdBy?.name ?? "Someone"} drafted it`, when: when(row.createdAt), at: row.createdAt }];
  if (row.submittedAt) history.push({ tone: "in", text: `${row.createdBy?.name ?? "Someone"} sent it for approval`, when: when(row.submittedAt), at: row.submittedAt });
  if (row.approvedAt) history.push({ tone: "ok", text: `${approver?.name ?? "Someone"} approved it`, when: when(row.approvedAt), at: row.approvedAt });
  if (row.status === "PAID" || row.status === "VOIDED") history.push({ tone: "ok", text: `${payer?.name ?? "Someone"} paid it`, when: when(row.paidAt), at: row.paidAt });
  if (row.voidedAt) history.push({ tone: "wa", text: `${(row.voidedById && who.get(row.voidedById)?.name) || "Someone"} voided it${row.voidReason ? `: ${row.voidReason}` : ""}`, when: when(row.voidedAt), at: row.voidedAt });

  const bill = row.bill;
  return {
    id: row.id,
    number: row.paymentNumber ?? row.groupNo ?? null,
    status: row.status,
    state: PAYMENT_OUT_STATE[row.status],
    currency,
    supplier: supplier ? { id: supplier.id, name: supplier.name, itf263: itf263State(supplier, now).state } : null,
    bill: bill ? { id: bill.id, number: docLabel(bill.billNumber, "bill"), theirFti: bill.supplierFtiNumber, due: bill.dueDate ? shortDay(storedDay(bill.dueDate)) : null, owing: round(bill.total - bill.amountPaid - bill.debitNoteTotal - bill.writeOffTotal + (row.status === "PAID" ? row.amount : 0)) } : null,
    from: row.bankAccount ? { name: row.bankAccount.name, currency: row.bankAccount.currency } : null,
    on: shortDay(storedDay(row.paidAt)),
    reference: row.reference,
    method: row.method,
    gross: round(row.amount),
    withheld: round(withheld),
    paid,
    imtt: round(imtt),
    leaves: round(paid + imtt),
    withholding: { rate: settings.withholding.contractRate, type: row.withholdingType, certificateNo: row.certificateNo, dueBy: shortDay(dayOf(due)) },
    imttRate: currency === "ZWG" ? settings.imtt.zwgRate : settings.imtt.usdRate,
    chain,
    posting: postingRows(entries, supplier ? { code: "2000", name: supplier.name } : null),
    entries: entries.length,
    history: historyOf(history),
    faces: facesOf(row.createdBy, ...people),
    madeById: row.createdById,
    approvedById: row.approvedById,
    voided: row.voidedAt ? { on: shortDay(dayOf(row.voidedAt)), reason: row.voidReason } : null,
  };
}

/** The payment as its page reads it, with what this person may do (`GET /api/books/payments-made/[id]`). */
export type PaymentOutRecordPage = PaymentOutRecord & {
  can: {
    submit: boolean;
    approve: { allowed: boolean; reason: string | null };
    pay: { allowed: boolean; reason: string | null };
    void: boolean;
    delete: boolean;
  };
  me: string;
};

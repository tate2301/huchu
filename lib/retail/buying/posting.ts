import { postRetailJournal } from "@/app/api/v2/retail/_helpers";
import { sumMoney, money, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/**
 * Money out to the books (40-buying 3.5, BUY-05): a requisition paid out, the
 * change brought back on it, and a payment to a supplier. Each is one event
 * of one amount, posted after the facts commit (as a delivery is): a locked
 * period or a shop that posts at the end of the day leaves it PENDING, and
 * the money that moved stands either way. The accounts the rules read are the
 * event's own (`accounts` in its payload): the money account's ledger, the
 * expense type's account, and the ledger of the account the change went into.
 */

export type PostedBy = { userId: string; userRole?: string | null };

export type AccountingResult = Awaited<ReturnType<typeof postRetailJournal>>;

const REQUISITION = {
  id: true,
  companyId: true,
  requisitionNo: true,
  siteId: true,
  currency: true,
  purpose: true,
  purchaseOrderId: true,
  paidAmount: true,
  disbursedAt: true,
  changeAmount: true,
  acquittedAt: true,
  bankAccount: { select: { ledgerAccountId: true } },
  changeAccount: { select: { ledgerAccountId: true } },
  expenseType: { select: { ledgerAccountId: true } },
  payee: { select: { name: true } },
  paidTo: { select: { name: true } },
} as const;

async function readRequisition(companyId: string, id: string) {
  return prisma.crmRequisition.findFirstOrThrow({ where: { id, companyId }, select: REQUISITION });
}

type Requisition = Awaited<ReturnType<typeof readRequisition>>;

/** "REQ-0014 · Afdis Distillers": the supplier, else whoever the money went to, else what it was for. */
export function requisitionMemo(requisition: Pick<Requisition, "requisitionNo" | "purpose" | "payee" | "paidTo">): string {
  return `${requisition.requisitionNo} · ${requisition.payee?.name ?? requisition.paidTo?.name ?? requisition.purpose}`;
}

const subtypeOf = (requisition: Pick<Requisition, "purchaseOrderId">) => (requisition.purchaseOrderId ? "ORDER" : "EXPENSE");

/** A requisition's payout: Dr 2000 (order) or the expense type's account / Cr the money account. */
export async function postPayout(companyId: string, requisitionId: string, by: PostedBy): Promise<AccountingResult> {
  const requisition = await readRequisition(companyId, requisitionId);
  const amount = toNumberOrZero(requisition.paidAmount);
  return postRetailJournal({
    companyId,
    sourceType: "RETAIL_REQUISITION_PAYOUT",
    sourceId: requisition.id,
    sourceSubtype: subtypeOf(requisition),
    siteId: requisition.siteId,
    entryDate: requisition.disbursedAt ?? new Date(),
    description: requisitionMemo(requisition),
    createdById: by.userId,
    actorRole: by.userRole ?? null,
    amount,
    netAmount: amount,
    grossAmount: amount,
    taxAmount: 0,
    currency: requisition.currency,
    payload: {
      requisitionNo: requisition.requisitionNo,
      accounts: {
        moneyAccount: requisition.bankAccount?.ledgerAccountId ?? null,
        expenseAccount: requisition.expenseType?.ledgerAccountId ?? null,
      },
    },
  });
}

/** The change brought back: Dr the account it went into / Cr 2000 (order) or the expense type's account. */
export async function postChange(companyId: string, requisitionId: string, by: PostedBy): Promise<AccountingResult> {
  const requisition = await readRequisition(companyId, requisitionId);
  const amount = toNumberOrZero(requisition.changeAmount);
  return postRetailJournal({
    companyId,
    sourceType: "RETAIL_REQUISITION_CHANGE",
    sourceId: requisition.id,
    sourceSubtype: subtypeOf(requisition),
    siteId: requisition.siteId,
    entryDate: requisition.acquittedAt ?? new Date(),
    description: requisitionMemo(requisition),
    createdById: by.userId,
    actorRole: by.userRole ?? null,
    amount,
    netAmount: amount,
    grossAmount: amount,
    taxAmount: 0,
    currency: requisition.currency,
    payload: {
      requisitionNo: requisition.requisitionNo,
      accounts: {
        changeAccount: requisition.changeAccount?.ledgerAccountId ?? null,
        expenseAccount: requisition.expenseType?.ledgerAccountId ?? null,
      },
    },
  });
}

/**
 * One payment to a supplier (`PAY-0019`, every row of it): Dr 2000 / Cr the
 * money account it came from. A requisition's cash is not one: its payout
 * already put it on the supplier's account.
 */
export async function postSupplierPayment(companyId: string, groupNo: string, by: PostedBy): Promise<AccountingResult> {
  const rows = await prisma.purchasePayment.findMany({
    where: { companyId, groupNo, requisitionId: null },
    select: { amount: true, paidAt: true, bankAccount: { select: { ledgerAccountId: true, currency: true } }, vendor: { select: { name: true } } },
  });
  const first = rows[0];
  if (!first) throw new Error(`No payment ${groupNo}`);
  const amount = toNumberOrZero(sumMoney(rows.map((row) => money(row.amount))));
  return postRetailJournal({
    companyId,
    sourceType: "RETAIL_SUPPLIER_PAYMENT",
    sourceId: groupNo,
    sourceSubtype: "PAYMENT",
    entryDate: first.paidAt,
    description: `${groupNo} · ${first.vendor?.name ?? "Supplier"}`,
    createdById: by.userId,
    actorRole: by.userRole ?? null,
    amount,
    netAmount: amount,
    grossAmount: amount,
    taxAmount: 0,
    currency: first.bankAccount?.currency ?? "USD",
    payload: { groupNo, accounts: { moneyAccount: first.bankAccount?.ledgerAccountId ?? null } },
  });
}

import { postRetailJournal } from "@/app/api/v2/retail/_helpers";
import { postRequisitionAcquittal, postRequisitionDisbursement } from "@/lib/books/core/requisitions";
import type { PostMoneyResult } from "@/lib/books/core/post-money";
import { sumMoney, money, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/**
 * Money out to the books (40-buying 3.5, BUY-05): a requisition paid out, what
 * it was spent on and the change brought back, and a payment to a supplier.
 * Requisitions go through the Books core, as the CRM's do. Each is one event
 * of one amount, posted after the facts commit (as a delivery is): a locked
 * period or a shop that posts at the end of the day leaves it PENDING, and
 * the money that moved stands either way. The accounts the rules read are the
 * event's own (`accounts` in its payload): the money account's ledger, the
 * expense type's account, and the ledger of the account the change went into.
 */

export type PostedBy = { userId: string; userRole?: string | null };

export type AccountingResult = Awaited<ReturnType<typeof postRetailJournal>>;

const PENDING_CODES = new Set(["POSTING_DEFERRED", "PERIOD_LOCKED", "PERIOD_OVERRIDE_FORBIDDEN", "PERIOD_OVERRIDE_REASON_REQUIRED", "EVENT_ACCOUNT_MISSING"]);

/** A core posting's result in the shape retail's screens read (`accountingStatus`). */
export function asAccounting(results: Array<PostMoneyResult | null | undefined>): AccountingResult {
  let worst: AccountingResult = { accountingStatus: "POSTED", accountingError: null, accountingCode: null, journalEntryId: null };
  for (const result of results) {
    if (!result) continue;
    if (result.entryId || result.skipped) {
      if (!worst.journalEntryId && worst.accountingStatus === "POSTED") worst = { ...worst, journalEntryId: result.entryId ?? null };
      continue;
    }
    const pending = result.deferred || PENDING_CODES.has(result.code ?? "");
    if (worst.accountingStatus === "FAILED") continue;
    worst = { accountingStatus: pending ? "PENDING" : "FAILED", accountingError: result.error ?? "Accounting posting failed", accountingCode: result.code ?? null, journalEntryId: null };
  }
  return worst;
}

const REQUISITION = {
  id: true,
  companyId: true,
  requisitionNo: true,
  category: true,
  siteId: true,
  projectId: true,
  currency: true,
  purpose: true,
  purchaseOrderId: true,
  amount: true,
  approvedAmount: true,
  paidAmount: true,
  bankAccountId: true,
  disbursedAt: true,
  changeAmount: true,
  changeAccountId: true,
  acquittedAt: true,
  acquittedAmount: true,
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
  return `${requisition.requisitionNo ?? "Requisition"} · ${requisition.payee?.name ?? requisition.paidTo?.name ?? requisition.purpose}`;
}

/**
 * A requisition's payout, through the Books core (books-final §4.11): Dr 2000
 * (an order's cash, an advance to the supplier) or Dr 1150 Cash advances (an
 * expense, until its receipts account for it) / Cr the money account.
 */
export async function postPayout(companyId: string, requisitionId: string, by: PostedBy): Promise<AccountingResult> {
  const requisition = await readRequisition(companyId, requisitionId);
  return asAccounting([await postRequisitionDisbursement(prisma, { ...requisition, purpose: requisitionMemo(requisition) }, { userId: by.userId, role: by.userRole ?? null })]);
}

/**
 * Accounting for it, through the core: an expense's spend to its expense
 * type's account (or its category's) out of 1150, and the change back into
 * the account it went into; an order's cash posts only its change, off the
 * supplier's advance.
 */
export async function postAcquittal(companyId: string, requisitionId: string, by: PostedBy): Promise<AccountingResult> {
  const requisition = await readRequisition(companyId, requisitionId);
  const posting = await postRequisitionAcquittal(prisma, { ...requisition, purpose: requisitionMemo(requisition) }, {
    spend: requisition.purchaseOrderId
      ? []
      : [{ category: requisition.category, amount: requisition.acquittedAmount ?? 0, expenseAccountId: requisition.expenseType?.ledgerAccountId ?? null }],
    change: requisition.changeAmount ?? 0,
    changeAccountId: requisition.changeAccountId,
    actor: { userId: by.userId, role: by.userRole ?? null },
  });
  return asAccounting(posting.results);
}

/** The change brought back alone (kept for callers that post it on its own). */
export async function postChange(companyId: string, requisitionId: string, by: PostedBy): Promise<AccountingResult> {
  return postAcquittal(companyId, requisitionId, by);
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

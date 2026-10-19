import type { FdmsCheckStatus, Prisma, PrismaClient, PurchaseBill } from "@prisma/client";

import { recalcPurchaseBillBalance } from "@/lib/accounting/balances";
import { prisma } from "@/lib/prisma";

import { approvalNote, decideApproval, moneyLimits, otherOwners, othersWhoCan, recordApproval } from "./approvals";
import { canDo, tierOf, type BooksActor } from "./can-do";
import { numberAtIssue } from "./numbering";
import { postMoney, type PostMoneyResult } from "./post-money";
import { voidMoney } from "./void-money";

/**
 * A supplier's bill (books-final §4.8, D12, D16).
 *
 * - **From a goods receipt.** Posting a retail goods receipt makes a draft
 *   bill of its lines (`draftBillFromGoodsReceipt`), tied to the receipt and
 *   its order: the three-way match. Recorded, it clears what the receipt
 *   credited (2010 Goods received, not billed; 2300 for one posted before
 *   P2) rather than expensing the goods again.
 * - **The supplier's FTI.** A VAT-registered supplier's bill needs its fiscal
 *   tax invoice number to be recorded. Its FDMS check (Not checked, Valid, Not
 *   valid) decides the VAT: claimable input VAT (2210) only once Valid, else
 *   2215 Input VAT, waiting for FDMS. Found valid after recording, the VAT
 *   moves across (`<id>:fdms`).
 * - **Over the payments limit** the owner approves before it is recorded.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export class BillRefusedError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 409,
  ) {
    super(message);
    this.name = "BillRefusedError";
  }
}

const label = (bill: Pick<PurchaseBill, "billNumber">) => bill.billNumber ?? "This bill";

/** Which rule a bill posts under: from goods received or not, its VAT claimable or waiting. */
export function billSubtype(bill: Pick<PurchaseBill, "goodsReceiptId" | "fdmsStatus">): string | null {
  const valid = bill.fdmsStatus === "VALID";
  if (bill.goodsReceiptId) return valid ? "GOODS_RECEIVED_VALID" : "GOODS_RECEIVED";
  return valid ? "VALID" : null;
}

/** The account a goods receipt credited, which its bill clears: 2010 since P2, 2300 before. */
export async function goodsReceivedAccount(db: Db, companyId: string, goodsReceiptId: string): Promise<string | null> {
  const entry = await db.journalEntry.findFirst({
    where: { companyId, sourceType: "RETAIL_GOODS_RECEIPT", sourceId: goodsReceiptId, status: "POSTED", voidedAt: null },
    select: { lines: { where: { credit: { gt: 0 } }, select: { accountId: true } } },
  });
  if (entry?.lines[0]) return entry.lines[0].accountId;
  const fallback = await db.chartOfAccount.findFirst({ where: { companyId, code: "2010", isActive: true }, select: { id: true } });
  return fallback?.id ?? null;
}

/** Post a recorded bill through the core: Dr the expense or what the goods receipt credited, Dr VAT (claimable or waiting), Cr payables. */
export async function postBill(
  db: Db,
  bill: Pick<PurchaseBill, "id" | "companyId" | "billNumber" | "billDate" | "total" | "subTotal" | "taxTotal" | "currency" | "goodsReceiptId" | "fdmsStatus">,
  actor: { userId: string; role?: string | null },
  options: { costCenterId?: string | null } = {},
): Promise<PostMoneyResult> {
  const expenseAccount = bill.goodsReceiptId ? await goodsReceivedAccount(db, bill.companyId, bill.goodsReceiptId) : null;
  return postMoney(db, {
    companyId: bill.companyId,
    sourceType: "PURCHASE_BILL",
    sourceId: bill.id,
    sourceSubtype: billSubtype(bill),
    date: bill.billDate,
    description: `Purchase bill ${bill.billNumber ?? ""}`.trim(),
    amount: bill.total,
    netAmount: bill.subTotal,
    taxAmount: bill.taxTotal,
    grossAmount: bill.total,
    currency: bill.currency,
    costCenterId: options.costCenterId ?? null,
    accounts: expenseAccount ? { expenseAccount } : undefined,
    actor,
    payload: { billNumber: bill.billNumber, fdmsStatus: bill.fdmsStatus },
  });
}

/**
 * A draft bill for a goods receipt just posted, in its transaction: the
 * receipt's lines at cost with their VAT, tied to the receipt and its order.
 * Once per receipt.
 */
export async function draftBillFromGoodsReceipt(tx: Prisma.TransactionClient, companyId: string, receiptId: string, actorId: string | null) {
  const existing = await tx.purchaseBill.findUnique({ where: { goodsReceiptId: receiptId }, select: { id: true } });
  if (existing) return existing;
  const receipt = await tx.retailGoodsReceipt.findFirst({
    where: { id: receiptId, companyId },
    select: { id: true, receiptNo: true, vendorId: true, purchaseOrderId: true, postedAt: true, createdAt: true, lines: { orderBy: { createdAt: "asc" } } },
  });
  if (!receipt) return null;
  const lines = receipt.lines
    .filter((line) => Number(line.quantity) > 0)
    .map((line) => {
      const net = Number(line.lineTotal);
      const taxAmount = Math.round(net * Number(line.vatRate)) / 100;
      return { description: line.itemName, quantity: Number(line.quantity), unitPrice: Number(line.unitCost), taxRate: Number(line.vatRate), taxAmount, lineTotal: Math.round((net + taxAmount) * 100) / 100 };
    });
  const subTotal = Math.round(lines.reduce((sum, line) => sum + line.lineTotal - line.taxAmount, 0) * 100) / 100;
  const taxTotal = Math.round(lines.reduce((sum, line) => sum + line.taxAmount, 0) * 100) / 100;
  return tx.purchaseBill.create({
    data: {
      companyId,
      vendorId: receipt.vendorId,
      billNumber: null,
      billDate: receipt.postedAt ?? receipt.createdAt,
      status: "DRAFT",
      currency: "USD",
      subTotal,
      taxTotal,
      total: Math.round((subTotal + taxTotal) * 100) / 100,
      notes: `From goods receipt ${receipt.receiptNo}. Enter the supplier's fiscal tax invoice when it comes.`,
      goodsReceiptId: receipt.id,
      purchaseOrderId: receipt.purchaseOrderId,
      createdById: actorId,
      lines: { create: lines },
    },
    select: { id: true },
  });
}

/**
 * A goods receipt reversed: its draft bill goes with it; a bill already
 * recorded refuses, and the bill is voided first.
 */
export async function releaseGoodsReceiptBill(tx: Prisma.TransactionClient, receiptId: string) {
  const bill = await tx.purchaseBill.findUnique({ where: { goodsReceiptId: receiptId }, select: { id: true, status: true, billNumber: true } });
  if (!bill) return;
  if (bill.status !== "DRAFT" && bill.status !== "VOIDED") throw new BillRefusedError(`${label(bill)} has been recorded for this delivery. Void the bill first.`);
  if (bill.status === "DRAFT") await tx.purchaseBill.delete({ where: { id: bill.id } });
}

/** Over the payments limit, the owner approves a bill before it is recorded (§2.4), written to ApprovalAction. */
export async function approveBill(actor: BooksActor, id: string, note?: string | null, at = new Date()) {
  const bill = await prisma.purchaseBill.findFirst({ where: { id, companyId: actor.companyId } });
  if (!bill) throw new BillRefusedError("Purchase bill not found", 404);
  if (bill.status !== "DRAFT") throw new BillRefusedError(`${label(bill)} has been recorded already.`);
  const limits = await moneyLimits(actor.companyId);
  const decision = decideApproval(
    actor,
    { kind: "bill", requestedById: bill.createdById, amount: bill.total, limit: limits.paymentOwnerOver, currency: bill.currency },
    {
      othersWhoCanApprove: await othersWhoCan(prisma, actor.companyId, { except: [bill.createdById] }),
      otherOwners: await otherOwners(prisma, actor.companyId, [bill.createdById]),
      ownerName: limits.ownerApprover?.name ?? null,
    },
  );
  if (!decision.allowed) throw new BillRefusedError(decision.reason, 403);
  return prisma.$transaction(async (tx) => {
    await recordApproval(tx, { companyId: actor.companyId, kind: "bill", entityId: id, action: "APPROVE", from: "DRAFT", to: "DRAFT", actedById: actor.userId, note: approvalNote(decision, note) });
    return tx.purchaseBill.update({ where: { id }, data: { approvedById: actor.userId, approvedAt: at } });
  });
}

/**
 * Record a draft bill (Draft → Received): the FTI for a VAT-registered
 * supplier, the owner's approval over the limit, the next number in the
 * series, and its posting through the core.
 */
export async function recordBill(
  actor: BooksActor,
  id: string,
  input: { supplierFtiNumber?: string | null; fdmsStatus?: FdmsCheckStatus; costCenterId?: string | null } = {},
  at = new Date(),
) {
  const bill = await prisma.purchaseBill.findFirst({ where: { id, companyId: actor.companyId }, include: { vendor: { select: { vatNumber: true, name: true } } } });
  if (!bill) throw new BillRefusedError("Purchase bill not found", 404);
  if (bill.status !== "DRAFT") throw new BillRefusedError(`${label(bill)} is not a draft: it was received already.`);
  const allowed = canDo(actor, "issue", { kind: "bill" });
  if (!allowed.allowed) throw new BillRefusedError(allowed.reason, 403);
  const fti = (input.supplierFtiNumber ?? bill.supplierFtiNumber)?.trim() || null;
  if (bill.vendor.vatNumber && !fti && bill.taxTotal > 0) {
    throw new BillRefusedError(`${bill.vendor.name} is registered for VAT: add the number on their fiscal tax invoice.`, 400);
  }
  const limits = await moneyLimits(actor.companyId);
  if (bill.total > limits.paymentOwnerOver + 0.004 && tierOf(actor) !== "owner" && !bill.approvedById) {
    throw new BillRefusedError(`Over ${limits.paymentOwnerOver.toFixed(2)} the owner approves a bill before it is recorded. Send it to ${limits.ownerApprover?.name ?? "the owner"}.`, 403);
  }
  const fdmsStatus = input.fdmsStatus ?? bill.fdmsStatus;
  const recorded = await prisma.$transaction(async (tx) => {
    const billNumber = await numberAtIssue(tx, actor.companyId, "bill", bill.billNumber);
    const moved = await tx.purchaseBill.updateMany({
      where: { id, status: "DRAFT" },
      data: {
        status: "RECEIVED",
        billNumber,
        issuedById: actor.userId,
        issuedAt: at,
        needsReview: false,
        supplierFtiNumber: fti,
        fdmsStatus,
        ...(input.fdmsStatus && input.fdmsStatus !== bill.fdmsStatus ? { fdmsCheckedAt: at, fdmsCheckedById: actor.userId } : {}),
      },
    });
    if (moved.count === 0) throw new BillRefusedError(`${label(bill)} was received already.`);
    return tx.purchaseBill.findUniqueOrThrow({ where: { id } });
  });
  // Posting never undoes the bill: what cannot post waits for the drain and Needs posting.
  const posting = await postBill(prisma, recorded, { userId: actor.userId, role: actor.role ?? null }, { costCenterId: input.costCenterId ?? null }).catch((error: unknown) => {
    console.error("[Books] Purchase bill posting failed:", error);
    return null;
  });
  return { bill: recorded, posting };
}

/**
 * The supplier's FTI checked on FDMS. On a recorded bill found Valid, its VAT
 * moves from waiting (2215) to claimable (2210); found not valid after that,
 * the move is mirrored.
 */
export async function checkBillFti(actor: BooksActor, id: string, input: { status: FdmsCheckStatus; supplierFtiNumber?: string | null }, at = new Date()) {
  const bill = await prisma.purchaseBill.findFirst({ where: { id, companyId: actor.companyId } });
  if (!bill) throw new BillRefusedError("Purchase bill not found", 404);
  if (bill.status === "VOIDED") throw new BillRefusedError(`${label(bill)} is void.`);
  const allowed = canDo(actor, bill.status === "DRAFT" ? "draft.edit" : "issue", { kind: "bill" });
  if (!allowed.allowed) throw new BillRefusedError(allowed.reason, 403);
  const updated = await prisma.purchaseBill.update({
    where: { id },
    data: { fdmsStatus: input.status, fdmsCheckedAt: at, fdmsCheckedById: actor.userId, ...(input.supplierFtiNumber !== undefined ? { supplierFtiNumber: input.supplierFtiNumber?.trim() || null } : {}) },
  });
  if (bill.status === "DRAFT" || bill.taxTotal <= 0 || bill.fdmsStatus === input.status) return updated;
  const reclassKey = `${id}:fdms`;
  const moved = await prisma.journalEntry.findFirst({ where: { companyId: actor.companyId, sourceType: "PURCHASE_BILL", sourceId: reclassKey, voidedAt: null }, select: { id: true } });
  // Posted with its VAT claimable already: only a move to waiting needs a mirror.
  const postedValid = await prisma.journalEntry.findFirst({ where: { companyId: actor.companyId, sourceType: "PURCHASE_BILL", sourceId: id, status: "POSTED", lines: { some: { account: { code: "2210" }, debit: { gt: 0 } } } }, select: { id: true } });
  if (input.status === "VALID" && !moved && !postedValid) {
    await postMoney(prisma, {
      companyId: actor.companyId,
      sourceType: "PURCHASE_BILL",
      sourceId: reclassKey,
      sourceSubtype: "FDMS_VALID",
      date: at,
      description: `${label(bill)}: FTI valid on FDMS, VAT claimable`,
      amount: bill.taxTotal,
      netAmount: 0,
      taxAmount: bill.taxTotal,
      currency: bill.currency,
      actor: { userId: actor.userId, role: actor.role ?? null },
    });
  } else if (input.status !== "VALID" && moved) {
    await voidMoney({ companyId: actor.companyId, sourceType: "PURCHASE_BILL", sourceId: reclassKey, reason: "FTI no longer valid on FDMS", actor, eventType: "books.bill.fti-unclaimed" });
  }
  return updated;
}

/** A recorded bill voided: its posting and any VAT moved since are mirrored; its payables line stops counting. */
export async function voidBillPostings(actor: BooksActor, bill: Pick<PurchaseBill, "id" | "companyId">, reason: string) {
  const reclass = await prisma.journalEntry.findFirst({ where: { companyId: bill.companyId, sourceType: "PURCHASE_BILL", sourceId: `${bill.id}:fdms`, voidedAt: null, reversalOfEntryId: null }, select: { id: true } });
  if (reclass) await voidMoney({ companyId: bill.companyId, sourceType: "PURCHASE_BILL", sourceId: `${bill.id}:fdms`, reason, actor, eventType: "books.bill.voided" });
  const posted = await prisma.journalEntry.findFirst({ where: { companyId: bill.companyId, sourceType: "PURCHASE_BILL", sourceId: bill.id, status: "POSTED" }, select: { id: true } });
  if (posted) await voidMoney({ companyId: bill.companyId, sourceType: "PURCHASE_BILL", sourceId: bill.id, reason, actor, eventType: "books.bill.voided" });
  await recalcPurchaseBillBalance(bill.id);
}

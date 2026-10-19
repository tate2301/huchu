import { prisma } from "@/lib/prisma";
import { recordAttachment, type UploadedFile } from "@/lib/retail/buying/attachments";

import { BillRefusedError, voidBillPostings } from "./core/bills";
import { canDo, type BooksActor } from "./core/can-do";
import { docLabel } from "./doc-number";

/**
 * What a bill's page does beyond the core's record, approve and FDMS check:
 * void a bill (its postings mirrored through the core, as Accounting's route
 * does), delete a draft, and keep the supplier's invoice as a photo (a
 * `RetailAttachment` of kind BILL, the buying screens' file table).
 */

export async function voidBill(actor: BooksActor, id: string, reason: string) {
  const bill = await prisma.purchaseBill.findFirst({ where: { id, companyId: actor.companyId } });
  if (!bill) throw new BillRefusedError("Purchase bill not found", 404);
  const name = docLabel(bill.billNumber, "bill");
  if (bill.status === "VOIDED") throw new BillRefusedError(`${name} is void already.`);
  if (bill.status === "DRAFT") throw new BillRefusedError(`${name} is a draft: delete it instead.`);
  const allowed = canDo(actor, "void", { kind: "bill", ownerId: bill.issuedById });
  if (!allowed.allowed) throw new BillRefusedError(allowed.reason, 403);
  await voidBillPostings(actor, bill, reason);
  return prisma.purchaseBill.update({ where: { id }, data: { status: "VOIDED", notes: bill.notes ? `${bill.notes}\nVoided: ${reason}` : `Voided: ${reason}` } });
}

export async function deleteDraftBill(actor: BooksActor, id: string) {
  const bill = await prisma.purchaseBill.findFirst({ where: { id, companyId: actor.companyId }, select: { id: true, status: true, createdById: true, goodsReceiptId: true } });
  if (!bill) throw new BillRefusedError("Purchase bill not found", 404);
  if (bill.status !== "DRAFT") throw new BillRefusedError("Only a draft can be deleted. Void a recorded bill instead.");
  if (bill.goodsReceiptId) throw new BillRefusedError("This draft is the goods receipt's bill: reverse the goods receipt to remove it.");
  const allowed = canDo(actor, "draft.delete", { kind: "bill", ownerId: bill.createdById });
  if (!allowed.allowed) throw new BillRefusedError(allowed.reason, 403);
  await prisma.purchaseBill.delete({ where: { id } });
  return { deleted: id };
}

export async function keepBillPhoto(actor: BooksActor, id: string, file: UploadedFile) {
  const bill = await prisma.purchaseBill.findFirst({ where: { id, companyId: actor.companyId }, select: { id: true, createdById: true, status: true } });
  if (!bill) throw new BillRefusedError("Purchase bill not found", 404);
  const allowed = canDo(actor, bill.status === "DRAFT" ? "draft.edit" : "issue", { kind: "bill", ownerId: bill.createdById });
  if (!allowed.allowed) throw new BillRefusedError(allowed.reason, 403);
  return prisma.$transaction((tx) =>
    recordAttachment(tx, { companyId: actor.companyId, userId: actor.userId, userRole: actor.role ?? null }, { entityType: "PurchaseBill", entityId: id, kind: "BILL", file }),
  );
}

/**
 * A draft's lines, changed before it is recorded (a goods receipt's draft
 * bill brought into line with the supplier's invoice): each line's VAT from
 * its tax code, the totals worked out again. Only a draft; a recorded bill is
 * voided or revised instead.
 */
export async function replaceDraftLines(
  actor: BooksActor,
  id: string,
  lines: Array<{ description: string; quantity: number; unitPrice: number; taxCodeId?: string | null }>,
) {
  const bill = await prisma.purchaseBill.findFirst({ where: { id, companyId: actor.companyId }, select: { id: true, status: true, createdById: true } });
  if (!bill) throw new BillRefusedError("Purchase bill not found", 404);
  if (bill.status !== "DRAFT") throw new BillRefusedError("Only a draft's lines can be changed. Void a recorded bill instead.");
  const allowed = canDo(actor, "draft.edit", { kind: "bill", ownerId: bill.createdById });
  if (!allowed.allowed) throw new BillRefusedError(allowed.reason, 403);
  const codes = await prisma.taxCode.findMany({ where: { companyId: actor.companyId, id: { in: lines.map((line) => line.taxCodeId).filter((code): code is string => Boolean(code)) } }, select: { id: true, rate: true } });
  const rate = new Map(codes.map((code) => [code.id, code.rate]));
  const cents = (n: number) => Math.round(n * 100) / 100;
  const computed = lines.map((line) => {
    const net = cents(line.quantity * line.unitPrice);
    const taxRate = line.taxCodeId ? (rate.get(line.taxCodeId) ?? 0) : 0;
    const taxAmount = cents((net * taxRate) / 100);
    return { description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, taxCodeId: line.taxCodeId || null, taxRate, taxAmount, lineTotal: cents(net + taxAmount) };
  });
  const subTotal = cents(computed.reduce((sum, line) => sum + line.lineTotal - line.taxAmount, 0));
  const taxTotal = cents(computed.reduce((sum, line) => sum + line.taxAmount, 0));
  return prisma.$transaction(async (tx) => {
    await tx.purchaseBillLine.deleteMany({ where: { billId: id } });
    return tx.purchaseBill.update({ where: { id }, data: { subTotal, taxTotal, total: cents(subTotal + taxTotal), lines: { create: computed } } });
  });
}

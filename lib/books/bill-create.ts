import { z } from "zod";

import { findTaxCodesOutsideEffectiveWindow } from "@/lib/accounting/tax-selection";
import { resolveDefaultTaxTemplate } from "@/lib/accounting/tax-rules";
import { prisma } from "@/lib/prisma";

import { postBill } from "./core/bills";
import { moneyLimits } from "./core/approvals";
import { nextNumber } from "./core/numbering";

/**
 * A supplier's bill, a draft or received: `POST /api/accounting/purchases/bills`
 * and Books' Record a bill (BkBillNew) both come here. Received, it takes the
 * next number in the series in the same write (D8) and posts through the core
 * (`postBill`, `PURCHASE_BILL`: Dr expense or stock, Dr VAT input once the
 * FTI is valid on FDMS, else waiting, Cr suppliers), with its sub-ledger
 * line. Over the payments limit only the owner records it at once; anyone
 * else saves a draft for the owner to approve (books-final §2.4).
 */
export const billSchema = z.object({
  vendorId: z.string().uuid(),
  billDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  currency: z.string().min(1).max(10).optional(),
  notes: z.string().max(1000).optional(),
  receiveNow: z.boolean().optional(),
  /** D16: the supplier's fiscal tax invoice number, and what FDMS said about it. */
  supplierFtiNumber: z.string().trim().max(60).optional(),
  fdmsStatus: z.enum(["NOT_CHECKED", "VALID", "NOT_VALID"]).optional(),
  lines: z
    .array(
      z.object({
        description: z.string().min(1).max(300),
        quantity: z.number().min(0.01),
        unitPrice: z.number().min(0),
        taxCodeId: z.string().uuid().optional(),
        taxRate: z.number().min(0).max(100).optional(),
        debit: z.number().min(0).optional(),
        credit: z.number().min(0).optional(),
      }),
    )
    .min(1),
});

export type BillInput = z.infer<typeof billSchema>;

export class BillRefused extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "BillRefused";
  }
}

export async function createPurchaseBill(
  actor: { companyId: string; userId: string; role?: string | null },
  validated: BillInput,
  options: { costCenterId?: string | null } = {},
) {
  const vendor = await prisma.vendor.findUnique({ where: { id: validated.vendorId }, select: { companyId: true, vatNumber: true, name: true } });
  if (!vendor || vendor.companyId !== actor.companyId) throw new BillRefused("Invalid vendor");

  const resolvedTemplate = await resolveDefaultTaxTemplate({
    companyId: actor.companyId,
    appliesTo: "PURCHASE",
    partyType: "VENDOR",
    partyId: validated.vendorId,
    documentDate: new Date(validated.billDate),
    currency: validated.currency ?? "USD",
  });
  const lines = validated.lines.map((line) => ({ ...line, taxCodeId: line.taxCodeId ?? resolvedTemplate.defaultTaxCodeId ?? undefined }));
  const taxCodeIds = lines.map((line) => line.taxCodeId).filter((value): value is string => Boolean(value));
  const taxCodes = taxCodeIds.length
    ? await prisma.taxCode.findMany({ where: { id: { in: taxCodeIds }, companyId: actor.companyId }, select: { id: true, rate: true, effectiveFrom: true, effectiveTo: true } })
    : [];
  const billDate = new Date(validated.billDate);
  const outOfWindow = findTaxCodesOutsideEffectiveWindow(taxCodes, billDate);
  if (outOfWindow.length > 0) throw new BillRefused("One or more tax codes are not effective on the bill date", { taxCodeIds: outOfWindow });
  const taxById = new Map(taxCodes.map((tax) => [tax.id, tax.rate]));
  const computed = lines.map((line) => {
    const taxRate = line.taxRate ?? taxById.get(line.taxCodeId ?? "") ?? 0;
    const net = line.quantity * line.unitPrice;
    const taxAmount = (net * taxRate) / 100;
    return { description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, taxCodeId: line.taxCodeId, taxRate, taxAmount, lineTotal: net + taxAmount, debit: line.debit, credit: line.credit };
  });
  const subTotal = computed.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const taxTotal = computed.reduce((sum, line) => sum + line.taxAmount, 0);
  const total = computed.reduce((sum, line) => sum + line.lineTotal, 0);

  if (validated.receiveNow) {
    // A VAT-registered supplier's bill is recorded with its FTI (D16); over the payments limit the owner records it (§2.4).
    if (vendor.vatNumber && taxTotal > 0 && !validated.supplierFtiNumber) throw new BillRefused(`${vendor.name} is registered for VAT: add the number on their fiscal tax invoice.`);
    const limits = await moneyLimits(actor.companyId);
    if (total > limits.paymentOwnerOver + 0.004 && (actor.role ?? "").toUpperCase() !== "SUPERADMIN") {
      throw new BillRefused(`Over ${limits.paymentOwnerOver.toFixed(2)} the owner approves a bill before it is recorded. Save it as a draft and send it to ${limits.ownerApprover?.name ?? "the owner"}.`);
    }
  }
  // A draft carries no number; one received now takes the next in the series, in the same write (D8).
  const bill = await prisma.$transaction(async (tx) =>
    tx.purchaseBill.create({
      data: {
        companyId: actor.companyId,
        vendorId: validated.vendorId,
        billNumber: validated.receiveNow ? await nextNumber(tx, actor.companyId, "bill") : null,
        billDate,
        dueDate: validated.dueDate ? new Date(validated.dueDate) : undefined,
        status: validated.receiveNow ? "RECEIVED" : "DRAFT",
        currency: validated.currency ?? "USD",
        subTotal,
        taxTotal,
        total,
        notes: validated.notes,
        supplierFtiNumber: validated.supplierFtiNumber || null,
        fdmsStatus: validated.fdmsStatus ?? "NOT_CHECKED",
        fdmsCheckedAt: validated.fdmsStatus && validated.fdmsStatus !== "NOT_CHECKED" ? new Date() : undefined,
        fdmsCheckedById: validated.fdmsStatus && validated.fdmsStatus !== "NOT_CHECKED" ? actor.userId : undefined,
        createdById: actor.userId,
        issuedById: validated.receiveNow ? actor.userId : undefined,
        issuedAt: validated.receiveNow ? new Date() : undefined,
        lines: { create: computed },
      },
      include: { vendor: true, lines: true },
    }),
  );
  // Posting never undoes the bill: what cannot post now waits for the drain and Needs posting.
  if (bill.status === "RECEIVED") {
    try {
      const posting = await postBill(prisma, bill, { userId: actor.userId, role: actor.role ?? null }, { costCenterId: options.costCenterId ?? null });
      if (posting.error) console.error(`[Books] Bill ${bill.billNumber} waits to post: ${posting.error}`);
    } catch (error) {
      console.error("[Books] Purchase bill posting failed:", error);
    }
  }
  return bill;
}

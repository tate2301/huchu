import { recordSalesReceipt } from "@/lib/accounting/payments";
import { prisma } from "@/lib/prisma";

import { accountIdByCode } from "./bank";
import { canDo, type BooksActor } from "./can-do";
import { taxSettings } from "./tax-settings";
import { WithholdingRefused } from "./withholding";

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * VAT a withholding-agent customer kept back from a payment (D17): a receipt
 * on the invoice for that amount, against their certificate, landing on 1170
 * VAT withheld by customers rather than in a money account. At most a third
 * of the invoice's VAT (a setting).
 */
export async function recordVatWithheldByCustomer(
  actor: BooksActor,
  input: { invoiceId: string; amount: number; certificateNo: string; date: Date },
) {
  const allowed = canDo(actor, "issue", { kind: "receipt" });
  if (!allowed.allowed) throw new WithholdingRefused(allowed.reason, 403);
  if (!input.certificateNo.trim()) throw new WithholdingRefused("Enter the customer's certificate number.");
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: input.invoiceId, companyId: actor.companyId },
    select: { id: true, status: true, taxTotal: true, invoiceNumber: true, customer: { select: { isVatWithholdingAgent: true, name: true } } },
  });
  if (!invoice) throw new WithholdingRefused("That invoice is not here any more.", 404);
  if (invoice.status !== "ISSUED" && invoice.status !== "PAID") throw new WithholdingRefused(`${invoice.invoiceNumber ?? "The invoice"} is not issued.`, 409);
  if (!invoice.customer.isVatWithholdingAgent) throw new WithholdingRefused(`${invoice.customer.name} is not marked as a VAT withholding agent.`);
  const settings = await taxSettings(actor.companyId);
  const most = round2(invoice.taxTotal * settings.vat.withholdingShare);
  if (input.amount > most + 0.01) throw new WithholdingRefused(`An agent withholds at most a third of the VAT: ${most.toFixed(2)} on ${invoice.invoiceNumber}.`);
  const ledgerAccountId = await accountIdByCode(prisma, actor.companyId, "1170");
  if (!ledgerAccountId) throw new WithholdingRefused("This workspace has no 1170 VAT withheld by customers account.", 409);
  return recordSalesReceipt({
    companyId: actor.companyId,
    userId: actor.userId,
    role: actor.role ?? null,
    invoiceId: invoice.id,
    receivedAt: input.date,
    amount: round2(input.amount),
    method: "VAT withheld",
    reference: input.certificateNo.trim(),
    ledgerAccountId,
  });
}

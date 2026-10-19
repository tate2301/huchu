/**
 * Books → Bills & spending → Record a bill (BkBillNew): the form's checks and
 * the body it sends. The supplier's fiscal invoice number and its FDMS code
 * have no columns of their own until D16 (P2), so they are kept in the bill's
 * note. Pure.
 */
import { dueDate, readNumber, type InvoiceFormLine } from "./invoice-form";

export type BillForm = {
  vendorId: string;
  theirNumber: string;
  billDate: string;
  fdmsCode: string;
  currency: string;
  dueInDays: string;
  costCenterId: string;
  lines: InvoiceFormLine[];
};

export function billFormErrors(form: BillForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.vendorId) errors.vendorId = "Choose who sent it.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.billDate)) errors.billDate = "The date on their invoice.";
  const touched = form.lines.filter((line) => line.description.trim() || line.unitPrice.trim());
  if (touched.length === 0) errors.lines = "Add at least one line.";
  form.lines.forEach((line, index) => {
    if (!(line.description.trim() || line.unitPrice.trim())) return;
    if (!line.description.trim()) errors[`lines.${index}.description`] = "Say what this line is for.";
    const quantity = readNumber(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) errors[`lines.${index}.quantity`] = "More than nothing.";
    const price = readNumber(line.unitPrice);
    if (!Number.isFinite(price) || price < 0) errors[`lines.${index}.unitPrice`] = "A price, nought or more.";
  });
  return errors;
}

/** Their invoice number and FDMS code, as the note keeps them until the bill has fields for them. */
export function billNote(form: Pick<BillForm, "theirNumber" | "fdmsCode">): string | undefined {
  const parts = [form.theirNumber.trim() ? `Their invoice ${form.theirNumber.trim()}` : null, form.fdmsCode.trim() ? `FDMS code ${form.fdmsCode.trim()}` : null].filter(Boolean);
  return parts.length ? parts.join(". ") : undefined;
}

export function billPayload(form: BillForm, receiveNow: boolean) {
  const due = dueDate(form.billDate, form.dueInDays);
  const note = billNote(form);
  return {
    vendorId: form.vendorId,
    billDate: form.billDate,
    ...(due ? { dueDate: due } : {}),
    currency: form.currency,
    ...(note ? { notes: note } : {}),
    ...(form.costCenterId ? { costCenterId: form.costCenterId } : {}),
    receiveNow,
    lines: form.lines
      .filter((line) => line.description.trim())
      .map((line) => ({ description: line.description.trim(), quantity: readNumber(line.quantity), unitPrice: readNumber(line.unitPrice), ...(line.taxCodeId ? { taxCodeId: line.taxCodeId } : {}) })),
  };
}

/**
 * Books → Bills & spending → Record a bill (BkBillNew): the form's checks and
 * the body it sends. The supplier's fiscal invoice number and what FDMS said
 * about it are the bill's own (D16); the verification code typed for the check
 * is kept in its note. Pure.
 */
import { dueDate, readNumber, type InvoiceFormLine } from "./invoice-form";

export type FdmsResult = "NOT_CHECKED" | "VALID" | "NOT_VALID";

export type BillForm = {
  vendorId: string;
  theirNumber: string;
  billDate: string;
  fdmsCode: string;
  /** What the person found when they checked the code on FDMS. */
  fdmsStatus: FdmsResult;
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

/** The FDMS verification code, as the note keeps it: the bill keeps the result, not the code. */
export function billNote(form: Pick<BillForm, "fdmsCode">): string | undefined {
  return form.fdmsCode.trim() ? `FDMS code ${form.fdmsCode.trim()}` : undefined;
}

/** What the FDMS box under the check says, or null before a check. */
export function fdmsSentence(status: FdmsResult, month: string): { tone: "ok" | "warn"; lead: string; rest: string } | null {
  if (status === "VALID") return { tone: "ok", lead: "Valid on FDMS", rest: `, checked just now. Its VAT counts in ${month}.` };
  if (status === "NOT_VALID") return { tone: "warn", lead: "Not valid on FDMS.", rest: " Its VAT is not claimed until they send a valid fiscal invoice." };
  return null;
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
    ...(form.theirNumber.trim() ? { supplierFtiNumber: form.theirNumber.trim() } : {}),
    fdmsStatus: form.fdmsStatus,
    ...(form.costCenterId ? { costCenterId: form.costCenterId } : {}),
    receiveNow,
    lines: form.lines
      .filter((line) => line.description.trim())
      .map((line) => ({ description: line.description.trim(), quantity: readNumber(line.quantity), unitPrice: readNumber(line.unitPrice), ...(line.taxCodeId ? { taxCodeId: line.taxCodeId } : {}) })),
  };
}

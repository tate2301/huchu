/**
 * Books → Bills & spending → Record a bill (BkBillNew): the form's checks and
 * the body it sends. The supplier's fiscal invoice number and what FDMS said
 * about it are the bill's own (D16); the verification code typed for the check
 * is kept in its note. Pure.
 */
import { dueDate, readNumber, type InvoiceFormLine } from "./invoice-form";
import { formatSpendingNote, nextRenewalDate, type SubscriptionCycle } from "./spending-categories";

export type FdmsResult = "NOT_CHECKED" | "VALID" | "NOT_VALID";
export type BillSpendingKind = "bill" | "expense" | "subscription";

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
  spendingKind?: BillSpendingKind;
  category?: string;
  subscriptionCycle?: SubscriptionCycle;
  paidNow?: boolean;
  paidFrom?: string;
  paymentReference?: string;
};

export function billFormErrors(form: BillForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.vendorId) errors.vendorId = "Choose who sent it.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.billDate)) errors.billDate = "The date on their invoice.";
  if (form.paidNow && !form.paidFrom) errors.paidFrom = "Choose which account it was paid from.";
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

/** The FDMS verification code, spending category, and subscription cycle as the note keeps it. */
export function billNote(form: Pick<BillForm, "fdmsCode" | "category" | "spendingKind" | "subscriptionCycle" | "billDate">): string | undefined {
  return formatSpendingNote({
    fdmsCode: form.fdmsCode,
    category: form.category ?? null,
    subscription:
      form.spendingKind === "subscription" && form.subscriptionCycle
        ? {
            cycle: form.subscriptionCycle,
            nextRenewal: form.billDate && /^\d{4}-\d{2}-\d{2}$/.test(form.billDate) ? nextRenewalDate(form.billDate, form.subscriptionCycle) : undefined,
          }
        : null,
  });
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
    ...(receiveNow && form.paidNow && form.paidFrom
      ? {
          paidNow: {
            bankAccountId: form.paidFrom,
            ...(form.paymentReference?.trim() ? { reference: form.paymentReference.trim() } : {}),
          },
        }
      : {}),
    receiveNow,
    lines: form.lines
      .filter((line) => line.description.trim())
      .map((line) => ({ description: line.description.trim(), quantity: readNumber(line.quantity), unitPrice: readNumber(line.unitPrice), ...(line.taxCodeId ? { taxCodeId: line.taxCodeId } : {}) })),
  };
}

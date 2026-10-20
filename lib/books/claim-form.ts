/**
 * Snap a slip (BkClaimPhone): what was spent, from a slip, sent as a claim
 * (paid from one's own pocket, D13) or as a petty cash voucher (spent from a
 * float). The form's checks and the two bodies it sends. Pure.
 */
import { readNumber } from "./invoice-form";

export type ClaimForm = {
  where: string;
  amount: string;
  vat: string;
  category: string;
  projectId: string;
  /** "own": a claim to be paid back; "float": a voucher spent from `floatId`. */
  paidWith: "own" | "float";
  floatId: string;
  spentOn: string;
};

export const CLAIM_KINDS: Array<{ value: string; label: string }> = [
  { value: "FUEL", label: "Fuel" },
  { value: "TRANSPORT", label: "Transport" },
  { value: "MATERIALS", label: "Materials" },
  { value: "SUBSISTENCE", label: "Food" },
  { value: "AIRTIME", label: "Airtime" },
  { value: "ACCOMMODATION", label: "Accommodation" },
  { value: "EQUIPMENT", label: "Equipment" },
  { value: "LABOUR", label: "Labour" },
  { value: "OTHER", label: "Other" },
];

export function claimFormErrors(form: ClaimForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.where.trim()) errors.where = "Where it was spent, as the slip says.";
  const amount = readNumber(form.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.amount = "What the slip comes to.";
  const vat = form.vat.trim() ? readNumber(form.vat) : 0;
  if (!Number.isFinite(vat) || vat < 0) errors.vat = "The VAT on the slip, or leave it empty.";
  else if (Number.isFinite(amount) && vat >= amount) errors.vat = "Less than the amount: it is included in it.";
  if (form.paidWith === "float" && !form.floatId) errors.floatId = "Choose the float it came from.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.spentOn)) errors.spentOn = "The day on the slip.";
  return errors;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** A claim of one line, sent for approval at once. */
export function claimPayload(form: ClaimForm, currency: string, receiptUrl: string | null) {
  return {
    currency,
    notes: form.where.trim(),
    send: true,
    lines: [
      {
        category: form.category || "OTHER",
        description: form.where.trim(),
        spentOn: form.spentOn,
        amount: cents(readNumber(form.amount)),
        taxAmount: form.vat.trim() ? cents(readNumber(form.vat)) : 0,
        projectId: form.projectId || null,
        receiptUrl,
      },
    ],
  };
}

/** A voucher spent from a float: posted at once under the holder's limit, else waiting for approval. */
export function voucherPayload(form: ClaimForm, receiptUrl: string | null) {
  return {
    action: "voucher" as const,
    floatId: form.floatId,
    category: form.category || "OTHER",
    description: form.where.trim(),
    amount: cents(readNumber(form.amount)),
    taxAmount: form.vat.trim() ? cents(readNumber(form.vat)) : 0,
    spentAt: form.spentOn,
    projectId: form.projectId || null,
    receiptUrl,
  };
}

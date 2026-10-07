import type { SaleState, SaleView } from "@/lib/retail/floor/sale-view";
import { paidWithLabel } from "@/lib/retail/words";
import { formatMoney } from "@/lib/workspace/format";

/**
 * A sale's words (50-floor): its state, its fiscal receipt and how it was
 * paid, the same on the record, its PDF and the list. Browser-safe.
 */

const STATE_WORDS: Record<SaleState, string> = {
  SOLD: "Sold",
  PART_REFUNDED: "Part refunded",
  REFUNDED: "Refunded",
  VOIDED: "Voided",
  REFUND: "Refund",
};

export function saleStateLabel(state: SaleState): string {
  return STATE_WORDS[state];
}

/** The state chip: Sold plain; Part refunded, Refunded and a refund warn; Voided bad. */
export function saleStateChip(state: SaleState): { label: string; tone: "plain" | "warn" | "bad" } {
  if (state === "SOLD") return { label: "Sold", tone: "plain" };
  if (state === "VOIDED") return { label: "Voided", tone: "bad" };
  return { label: STATE_WORDS[state], tone: "warn" };
}

/** The fiscal chip; none while the shop does not fiscalise. A refund's receipt is its credit note. */
export function fiscalChip(sale: Pick<SaleView, "fiscal" | "saleType">): { label: string; tone: "ok" | "warn" | "bad" } | null {
  const what = sale.saleType === "REFUND" ? "Credit note" : "Fiscal receipt";
  if (sale.fiscal.state === "SIGNED") return { label: `${what} signed`, tone: "ok" };
  if (sale.fiscal.state === "WAITING") return { label: `${what} waiting for ZIMRA`, tone: "warn" };
  if (sale.fiscal.state === "FAILED") return { label: `${what} not signed`, tone: "bad" };
  return null;
}

/** "Card", "Cash and EcoCash": how the sale was paid. */
export function paidWords(sale: Pick<SaleView, "payments">): string {
  return paidWithLabel(sale.payments.map((payment) => ({ tenderType: payment.tender, currency: payment.currency })));
}

/** The Paid with tile: one way and its reference, cash and its change, or a split. */
export function paidKpi(sale: Pick<SaleView, "payments" | "change">): { value: string; note: string; lead?: string } {
  if (sale.payments.length === 0) return { value: "—", note: "nothing taken" };
  if (sale.payments.length > 1) return { value: "Split", lead: String(sale.payments.length), note: "tenders" };
  const [payment] = sale.payments;
  if (payment!.tender === "CASH") return { value: payment!.label, note: `${formatMoney(Number(sale.change))} change` };
  const reference = payment!.reference?.trim();
  return reference ? { value: payment!.label, lead: reference.slice(0, 8), note: "reference" } : { value: payment!.label, note: "no reference" };
}

/** "••• 3388". */
export function maskedPhone(phone: string): string {
  return `••• ${phone.replace(/\D/g, "").slice(-4)}`;
}

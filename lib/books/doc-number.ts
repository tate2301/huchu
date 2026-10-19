/**
 * How a document is named while it may still be a draft (D8): an issued one by
 * its number, a draft, which carries no number, as "this draft". Pure, so
 * client components may use it.
 */
export type DocKind = "invoice" | "bill" | "credit note" | "debit note";

export function docLabel(number: string | null | undefined, kind: DocKind = "invoice"): string {
  return number?.trim() || `Draft ${kind}`;
}

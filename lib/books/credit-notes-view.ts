import { z } from "zod";

/** Books → Sales → Credit notes (BkCreditNotes): the shapes the page renders. No database here. */

export const CREDIT_VIEWS = ["notes", "write-offs"] as const;
export type CreditTab = (typeof CREDIT_VIEWS)[number];
export const CREDIT_TAB_LABEL: Record<CreditTab, string> = { notes: "Credit notes", "write-offs": "Write-offs" };

export const creditQuerySchema = z.object({
  view: z.enum(CREDIT_VIEWS).catch("notes"),
  q: z.string().trim().max(100).catch(""),
  customer: z.string().uuid().nullable().catch(null),
  page: z.coerce.number().int().min(1).catch(1),
});
export type CreditQuery = z.infer<typeof creditQuerySchema>;

export function readCreditQuery(params: URLSearchParams): CreditQuery {
  // `?view=write-offs` from the old Receivables address; anything else is the credit notes.
  return creditQuerySchema.parse({ view: params.get("view") ?? undefined, q: params.get("q") ?? undefined, customer: params.get("customer") || null, page: params.get("page") ?? undefined });
}

export type CreditRow = {
  id: string;
  number: string;
  customer: string;
  invoice: { id: string; number: string };
  reason: string;
  state: "Draft" | "Issued" | "Posted" | "Void";
  amount: number;
  currency: string;
  date: string;
};

export type CreditNotesView = {
  finding: { fact: string; rest: string | null };
  rows: CreditRow[];
  range: { from: number; to: number; of: number };
  counts: Record<CreditTab, number>;
  /** This month's credits (or write-offs) and the drafts waiting, in `currency`. */
  month: { name: string; amount: number; drafts: number };
  currency: string;
  customers: Array<{ id: string; name: string }>;
  query: CreditQuery;
};

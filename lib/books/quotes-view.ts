import { z } from "zod";

/** Books → Sales → Quotes (BkQuotes): the shapes the page renders. No database here. */

export const QUOTE_VIEWS = ["draft", "sent", "accepted", "expired", "void"] as const;
export type QuoteTab = (typeof QUOTE_VIEWS)[number];
export const QUOTE_TAB_LABEL: Record<QuoteTab, string> = { draft: "Draft", sent: "Sent", accepted: "Accepted", expired: "Expired", void: "Void" };
export const QUOTE_STATUS: Record<QuoteTab, "DRAFT" | "SENT" | "ACCEPTED" | "EXPIRED" | "VOIDED"> = { draft: "DRAFT", sent: "SENT", accepted: "ACCEPTED", expired: "EXPIRED", void: "VOIDED" };

export const quoteQuerySchema = z.object({
  view: z.enum(QUOTE_VIEWS).catch("sent"),
  q: z.string().trim().max(100).catch(""),
  customer: z.string().uuid().nullable().catch(null),
  /** The rep: the person who wrote the quote. */
  rep: z.string().uuid().nullable().catch(null),
  invoiced: z.enum(["any", "yes", "no"]).catch("any"),
  sort: z.enum(["newest", "oldest"]).catch("newest"),
  page: z.coerce.number().int().min(1).catch(1),
});
export type QuoteQuery = z.infer<typeof quoteQuerySchema>;

export function readQuoteQuery(params: URLSearchParams): QuoteQuery {
  return quoteQuerySchema.parse({
    view: params.get("view") ?? undefined,
    q: params.get("q") ?? undefined,
    customer: params.get("customer") || null,
    rep: params.get("rep") || null,
    invoiced: params.get("invoiced") ?? undefined,
    sort: params.get("sort") ?? undefined,
    page: params.get("page") ?? undefined,
  });
}

export type QuoteRow = {
  id: string;
  number: string;
  customer: string;
  customerImage?: string | null;
  /** What it is for: its first line. */
  forWhat: string;
  validUntil: string | null;
  /** "Read 13 Oct", "Sent", or null when the CRM did not send it. */
  whatsapp: string | null;
  amount: number;
  currency: string;
  /** The CRM's own page for it, when the CRM wrote it. */
  crmId: string | null;
  /** An invoice was already made from it. */
  invoiced: boolean;
};

export type QuotesView = {
  finding: { fact: string; rest: string | null };
  rows: QuoteRow[];
  range: { from: number; to: number; of: number };
  counts: Record<QuoteTab, number>;
  /** What the quotes with customers (Sent) come to, in `currency`. */
  out: number;
  currency: string;
  customers: Array<{ id: string; name: string; image?: string | null }>;
  /** The people who wrote quotes here, for the Rep filter. */
  reps: Array<{ id: string; name: string; image?: string | null }>;
  query: QuoteQuery;
};

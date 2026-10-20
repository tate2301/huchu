import { z } from "zod";

/** Books → Sales → Quotes (bk-quotes): the shapes the page renders. No database here. */

export const QUOTES_PAGE_SIZE = 50;

export const QUOTE_VIEWS = ["draft", "sent", "accepted", "expired", "void"] as const;
export type QuoteTab = (typeof QUOTE_VIEWS)[number];
export const QUOTE_TAB_LABEL: Record<QuoteTab, string> = { draft: "Draft", sent: "Sent", accepted: "Accepted", expired: "Expired", void: "Void" };
export const QUOTE_STATUS: Record<QuoteTab, "DRAFT" | "SENT" | "ACCEPTED" | "EXPIRED" | "VOIDED"> = { draft: "DRAFT", sent: "SENT", accepted: "ACCEPTED", expired: "EXPIRED", void: "VOIDED" };

/** The Valid until filter. */
export const QUOTE_VALID = ["any", "this-week", "this-month", "passed"] as const;
export type QuoteValid = (typeof QUOTE_VALID)[number];
export const QUOTE_VALID_LABEL: Record<QuoteValid, string> = { any: "Any", "this-week": "This week", "this-month": "This month", passed: "Passed" };

export const quoteQuerySchema = z.object({
  view: z.enum(QUOTE_VIEWS).catch("sent"),
  q: z.string().trim().max(100).catch(""),
  customer: z.string().uuid().nullable().catch(null),
  /** The rep: the person who wrote the quote. */
  rep: z.string().uuid().nullable().catch(null),
  valid: z.enum(QUOTE_VALID).catch("any"),
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
    valid: params.get("valid") ?? undefined,
    sort: params.get("sort") ?? undefined,
    page: params.get("page") ?? undefined,
  });
}

export type QuoteRow = {
  id: string;
  /** "Q-0222"; "No number" on a draft. */
  number: string;
  customer: string;
  /** "6 Oct"; null on a draft. */
  sent: string | null;
  validUntil: string | null;
  state: QuoteTab;
  /** The row's one muted fact: what happens next, or what happened last. */
  next: string;
  amount: number;
  currency: string;
  /** Its one address, `/books/quotes/<CRM document id>`; null when the CRM holds no document for it. */
  href: string | null;
  /** An invoice was already made from it. */
  invoiced: boolean;
};

export type QuotesView = {
  rows: QuoteRow[];
  range: { from: number; to: number; of: number };
  counts: Record<QuoteTab, number>;
  /** The page's rows in `currency`, summed. */
  total: number;
  currency: string;
  customers: Array<{ id: string; name: string; image?: string | null }>;
  /** The people who wrote quotes here, for the Rep filter. */
  reps: Array<{ id: string; name: string; image?: string | null }>;
  query: QuoteQuery;
};

/** Open deals a new quote can be written on (New quote asks which). */
export type QuoteDeal = { id: string; dealNo: string; title: string; client: string; value: number | null; currency: string };

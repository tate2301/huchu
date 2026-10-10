import type { RetailAction, RetailResource, SessionLike } from "@/lib/retail/permission-matrix";

/**
 * The shapes behind every `auto` field (00-foundations 4.4, 5.7.5).
 *
 * A noun is something a form can pick: a till, a category, a person. Each area
 * registers its own in `lib/retail/lookups/<area>.ts`; `index.ts` holds the
 * registry and the one runner both endpoints call.
 */

/** One row of an autocomplete: what it reads as, and the short line beside it. */
export type LookupOption = {
  id: string;
  label: string;
  sub: string | null;
  /** A stock line's cost, for someone who may see cost ("22.15"). */
  cost?: string | null;
  /** The record this option is of: a stock line's product. */
  of?: string | null;
  /** A stock line's site and on hand. */
  siteId?: string;
  site?: string;
  onHand?: number;
};

/**
 * One input of the inline "New <noun>" panel. `key` is what the POST body and
 * its `fieldErrors` use; `value` prefills it (the first one takes the typed text).
 */
export type QuickField = { key: string; label: string; placeholder: string; value?: string };

/** Who is asking, scoped to their company. */
export type LookupCtx = {
  companyId: string;
  userId: string;
  userName: string | null;
  session: SessionLike;
  /** The request's address: a person added inline gets a join link on this shop's host. */
  requestUrl?: string;
};

export type LookupNoun = {
  noun: string;
  /** Any one of these lets a person read the noun. */
  read: Array<[RetailResource, RetailAction]>;
  /** The noun's create right; absent, nobody adds one inline. */
  create?: [RetailResource, RetailAction];
  /** The inline add's inputs; or from the field's context (an owner, added from "Owner approvals go to", needs an email). */
  quick: QuickField[] | ((context: Record<string, unknown>) => QuickField[]);
  /**
   * Every live row whose label contains `q` (case-insensitive), in the noun's
   * own order; the runner puts prefix matches first and cuts to the limit.
   * `context` narrows where the noun needs it.
   */
  search(ctx: LookupCtx, q: string, context: Record<string, unknown>): Promise<LookupOption[]>;
  /**
   * The noun puts its own options in order and keeps those matched on
   * something other than the label (a product scanned by its barcode, the
   * exact barcode first); the runner only cuts to the limit.
   */
  ranked?: boolean;
  /**
   * The noun's own create service. Throws `LookupFieldErrors` for a 400.
   * `context` is the field's own (a person added from "Owner approvals go to"
   * is an owner). May say something for the toast (`notice`).
   */
  add?(
    ctx: LookupCtx,
    fields: Record<string, string>,
    context: Record<string, unknown>,
  ): Promise<LookupOption & { notice?: string }>;
};

/** A quick add refused field by field: `{ name: "There is already a category called Beer." }`. */
export class LookupFieldErrors extends Error {
  constructor(readonly fieldErrors: Record<string, string>) {
    super(Object.values(fieldErrors)[0] ?? "Check the fields.");
    this.name = "LookupFieldErrors";
  }
}

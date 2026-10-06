import { canRetailSessionDo, retailPermissionDenial } from "@/lib/retail/permission-matrix";

import { FLOOR_LOOKUPS } from "./floor";
import { PEOPLE_LOOKUPS } from "./people";
import { PRODUCT_LOOKUPS } from "./products";
import { SETUP_LOOKUPS } from "./setup";
import { STOCK_LOOKUPS } from "./stock";
import { LookupFieldErrors, type LookupCtx, type LookupNoun, type LookupOption, type QuickField } from "./types";

/**
 * The lookup registry (00-foundations 4.4): the data behind every `auto` field
 * and its inline add (F-3). Each area adds its nouns in its own file and one
 * line here.
 */
export const LOOKUP_NOUNS: ReadonlyMap<string, LookupNoun> = new Map(
  [...FLOOR_LOOKUPS, ...PEOPLE_LOOKUPS, ...PRODUCT_LOOKUPS, ...SETUP_LOOKUPS, ...STOCK_LOOKUPS].map((noun) => [noun.noun, noun]),
);

export type { LookupCtx, LookupNoun, LookupOption, QuickField } from "./types";
export { LookupFieldErrors } from "./types";

export type LookupAnswer<T, S extends 200 | 201> =
  | { status: S; body: T }
  | { status: 400; body: { error: string; fieldErrors: Record<string, string> } }
  | { status: 403 | 404; body: { error: string } };

export type LookupPage = {
  options: LookupOption[];
  more: boolean;
  /** The inline add the caller may use: its quick fields, or null without the create right. */
  add: { quick: QuickField[] } | null;
};

export const DEFAULT_LOOKUP_LIMIT = 8;

/**
 * Prefix matches first, then the rest that contain it; each group keeps the
 * noun's own order.
 */
export function rankOptions(options: LookupOption[], q: string): LookupOption[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return options;
  const starts = options.filter((option) => option.label.toLowerCase().startsWith(needle));
  const contains = options.filter(
    (option) => !option.label.toLowerCase().startsWith(needle) && option.label.toLowerCase().includes(needle),
  );
  return [...starts, ...contains];
}

function refusal(ctx: LookupCtx, noun: LookupNoun): string | null {
  if (noun.read.some(([resource, action]) => canRetailSessionDo(ctx.session, resource, action))) return null;
  const [resource, action] = noun.read[0]!;
  return retailPermissionDenial(ctx.session, resource, action);
}

function canAdd(ctx: LookupCtx, noun: LookupNoun): boolean {
  return Boolean(noun.add && noun.create && canRetailSessionDo(ctx.session, noun.create[0], noun.create[1]));
}

/** `GET /api/v2/retail/lookup/[noun]?q=&limit=&context=`. */
export async function searchLookup(
  ctx: LookupCtx,
  nounKey: string,
  input: { q?: string | null; limit?: number; context?: Record<string, unknown> },
): Promise<LookupAnswer<LookupPage, 200>> {
  const noun = LOOKUP_NOUNS.get(nounKey);
  if (!noun) return { status: 404, body: { error: "Nothing to look up by that name" } };
  const denied = refusal(ctx, noun);
  if (denied) return { status: 403, body: { error: denied } };

  const q = (input.q ?? "").trim();
  const limit = Math.min(50, Math.max(1, input.limit ?? DEFAULT_LOOKUP_LIMIT));
  const ranked = rankOptions(await noun.search(ctx, q, input.context ?? {}), q);
  return {
    status: 200,
    body: {
      options: ranked.slice(0, limit),
      more: ranked.length > limit,
      add: canAdd(ctx, noun) ? { quick: noun.quick } : null,
    },
  };
}

/** `POST /api/v2/retail/lookup/[noun]` `{ fields, context? }`: the noun's create service. */
export async function addLookupOption(
  ctx: LookupCtx,
  nounKey: string,
  fields: Record<string, string>,
  context: Record<string, unknown> = {},
): Promise<LookupAnswer<{ option: LookupOption; notice?: string }, 201>> {
  const noun = LOOKUP_NOUNS.get(nounKey);
  if (!noun || !noun.add || !noun.create) {
    return { status: 404, body: { error: "Nothing to add by that name" } };
  }
  const denied = retailPermissionDenial(ctx.session, noun.create[0], noun.create[1]);
  if (denied) return { status: 403, body: { error: denied } };

  try {
    const { notice, ...option } = await noun.add(ctx, fields, context);
    return { status: 201, body: { option, ...(notice ? { notice } : {}) } };
  } catch (error) {
    if (error instanceof LookupFieldErrors) {
      return { status: 400, body: { error: error.message, fieldErrors: error.fieldErrors } };
    }
    throw error;
  }
}

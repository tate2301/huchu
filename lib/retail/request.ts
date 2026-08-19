/**
 * Query strings, path ids and page windows, parsed once.
 *
 * R-3.1 and R-3.2. 22 of retail's 35 routes ran their bodies through zod; the
 * remaining thirteen took their input straight out of `searchParams` and
 * `params`, by hand, differently each time:
 *
 *     const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "10"), 1), 30);
 *     const status = searchParams.get("status")?.trim();
 *     if (status && status !== "all" && status !== "ACTIVE" && status !== "INACTIVE") { … }
 *
 * Each of those is fine on its own. Together they are thirteen slightly
 * different opinions about what an absent parameter means, what a blank one
 * means, and what happens when somebody passes `limit=abc` — which the
 * expression above turns into `NaN`, then `Math.max(NaN, 1)` into `NaN`, then a
 * Prisma `take: NaN`.
 *
 * ## What this is not
 *
 * It is not a rule that every handler must name a schema. Several retail routes
 * take no input at all — `pos/context`, `setup/overview`, the trading dashboard
 * — and wrapping a handler with no parameters in a validator would be theatre
 * that makes the next reader look for the input. The rule is that **every input
 * a retail route accepts is parsed by a schema**, and a route accepting nothing
 * satisfies it by accepting nothing.
 *
 * ## Refusals
 *
 * A bad parameter comes back as 400 with the field named, through
 * `errorResponse`, because that is how every retail route already answers. A
 * throw would be caught by the generic handler and reported as a 500 — telling
 * a shopkeeper the system is broken when in fact they mistyped a filter.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/api-utils";

/** Parsed, or the response to hand straight back. Never both. */
export type Parsed<T> = { data: T; response: null } | { data: null; response: NextResponse };

function refuse(error: z.ZodError): { data: null; response: NextResponse } {
  const first = error.issues[0];
  const field = first?.path.join(".") || "request";
  return { data: null, response: errorResponse(`${field}: ${first?.message ?? "invalid"}`, 400) };
}

/**
 * Read the query string through a schema.
 *
 * Every value arrives as a string or not at all, so schemas here are written in
 * terms of `z.string()` and `z.coerce`. Repeated keys take the last value, which
 * is what `searchParams.get` does and what every existing retail handler
 * already assumed.
 */
export function parseRetailQuery<T extends z.ZodType>(
  request: { url: string },
  schema: T,
): Parsed<z.infer<T>> {
  const raw: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams.entries()) {
    raw[key] = value;
  }
  const result = schema.safeParse(raw);
  return result.success ? { data: result.data, response: null } : refuse(result.error);
}

/**
 * Read a dynamic route segment through a schema.
 *
 * Retail's `[id]` segments are all uuids, and every one of them was going
 * straight into a `findFirst` where clause. Prisma is not injectable, so this is
 * not a security fix — it is the difference between a 400 naming the parameter
 * and a 404 that makes a shopkeeper think the receipt was deleted.
 */
export async function parseRetailParams<T extends z.ZodType>(
  params: Promise<Record<string, string>>,
  schema: T,
): Promise<Parsed<z.infer<T>>> {
  const result = schema.safeParse(await params);
  return result.success ? { data: result.data, response: null } : refuse(result.error);
}

/** The `[id]` every retail detail route takes. */
export const retailIdParams = z.object({ id: z.string().uuid("must be an id") });

/**
 * How much, and from where.
 *
 * R-3.2. Retail's reads were bounded by constants written into the handlers —
 * 2,500 sales here, 100 shifts there, and the back-office catalogue by nothing
 * at all. A hard cap is not the same as pagination: the shop with 3,000
 * customers does not see a second page, it sees a list that stops, with nothing
 * saying it stopped.
 *
 * `cursor` is the id of the last row of the previous page, not an offset.
 * Offsets shift under a till that is still selling — page two skips a receipt
 * that page one already showed, or misses one entirely — and the shop reads
 * that as the system losing sales.
 */
export const retailPageQuery = z.object({
  /** Absent means the default; the cap is per route, expressed by the schema. */
  limit: z.coerce.number().int().min(1).max(200).optional(),
  /** The `id` of the last row already seen. */
  cursor: z.string().uuid().optional(),
});

export type RetailPageQuery = z.infer<typeof retailPageQuery>;

/**
 * The Prisma arguments for one page.
 *
 * Asks for one row more than the caller wants, which is how `hasMore` is
 * answered without a second `count()` — a count on a table the till is writing
 * to is both an extra round trip and a number that can disagree with the rows
 * beside it.
 */
export function pageArgs(query: RetailPageQuery, fallbackLimit: number) {
  const take = query.limit ?? fallbackLimit;
  return {
    take: take + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    /** What the caller asked for, before the extra row. */
    limit: take,
  };
}

/** Trim the probe row off and say whether there was one. */
export function pageResult<T extends { id: string }>(
  rows: T[],
  limit: number,
): { rows: T[]; nextCursor: string | null; hasMore: boolean } {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    rows: page,
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    hasMore,
  };
}

/**
 * The same, for a list this route computed rather than queried.
 *
 * `customers` is an aggregate over sales, not a table, so there is no row id to
 * cursor on and no query to `take` from. It pages by offset because that is
 * what the shape allows — and the window it aggregated over is reported beside
 * it, so a shop looking at page four knows whether it is seeing the tail of the
 * list or the edge of the scan.
 */
export function slicePage<T>(
  rows: T[],
  query: { limit?: number; offset?: number },
  fallbackLimit: number,
): { rows: T[]; total: number; offset: number; limit: number; hasMore: boolean } {
  const limit = query.limit ?? fallbackLimit;
  const offset = query.offset ?? 0;
  return {
    rows: rows.slice(offset, offset + limit),
    total: rows.length,
    offset,
    limit,
    hasMore: offset + limit < rows.length,
  };
}

/** Offset paging, for the derived lists that cannot cursor. */
export const retailOffsetQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

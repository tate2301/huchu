/**
 * The parsing the thirteen hand-rolled versions each got slightly differently.
 *
 * R-3.1 and R-3.2. Every case below is one a retail route wrote by hand before
 * this module existed, and most of them are cases the hand-written version got
 * wrong — not because anybody was careless, but because
 * `Math.min(Math.max(Number(x ?? "10"), 1), 30)` is subtly wrong in three
 * different ways and reads as though it is not.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  pageArgs,
  pageResult,
  parseRetailParams,
  parseRetailQuery,
  retailIdParams,
  retailOffsetQuery,
  retailPageQuery,
  slicePage,
} from "./request";

function req(query: string) {
  return { url: `http://pos.acme.apps.pagka.local:3000/api/v2/retail/x${query}` };
}

const schema = z.object({
  search: z.string().trim().max(200).optional(),
  siteId: z.string().uuid().optional(),
  status: z.enum(["all", "ACTIVE", "INACTIVE"]).optional(),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

const SITE = "11111111-2222-4333-8444-555555555555";

describe("parseRetailQuery", () => {
  it("accepts an empty query string", () => {
    const parsed = parseRetailQuery(req(""), schema);
    expect(parsed.response).toBeNull();
    expect(parsed.data).toEqual({});
  });

  it("reads the parameters a route sends", () => {
    const parsed = parseRetailQuery(req(`?search=castle&siteId=${SITE}&status=ACTIVE&limit=5`), schema);
    expect(parsed.data).toEqual({ search: "castle", siteId: SITE, status: "ACTIVE", limit: 5 });
  });

  /**
   * The case the hand-rolled version turned into `take: NaN`.
   *
   * `Number("abc")` is `NaN`, `Math.max(NaN, 1)` is `NaN`, `Math.min(NaN, 30)`
   * is `NaN`, and Prisma is handed a take of `NaN`. Nothing in that chain
   * complains.
   */
  it("refuses a limit that is not a number", () => {
    const parsed = parseRetailQuery(req("?limit=abc"), schema);
    expect(parsed.data).toBeNull();
    expect(parsed.response?.status).toBe(400);
  });

  it("refuses a limit outside its range rather than silently clamping", () => {
    // Clamping is friendlier and it is also how a caller asking for 10,000 rows
    // never finds out they did not get them.
    expect(parseRetailQuery(req("?limit=0"), schema).response?.status).toBe(400);
    expect(parseRetailQuery(req("?limit=500"), schema).response?.status).toBe(400);
    expect(parseRetailQuery(req("?limit=1.5"), schema).response?.status).toBe(400);
  });

  it("refuses an unknown status", () => {
    expect(parseRetailQuery(req("?status=DELETED"), schema).response?.status).toBe(400);
  });

  it("refuses a site id that is not one", () => {
    expect(parseRetailQuery(req("?siteId=../../etc"), schema).response?.status).toBe(400);
  });

  it("trims, because a filter typed with a trailing space is still that filter", () => {
    expect(parseRetailQuery(req("?search=%20castle%20"), schema).data).toEqual({ search: "castle" });
  });

  /** `searchParams.get` returns the first; this keeps the last, and says so. */
  it("takes the last value when a key repeats", () => {
    expect(parseRetailQuery(req("?limit=5&limit=9"), schema).data?.limit).toBe(9);
  });

  it("names the field it refused", async () => {
    const parsed = parseRetailQuery(req("?limit=abc"), schema);
    const body = await parsed.response?.json();
    expect(body.error ?? body.message ?? JSON.stringify(body)).toContain("limit");
  });
});

describe("parseRetailParams", () => {
  it("passes a uuid through", async () => {
    const parsed = await parseRetailParams(Promise.resolve({ id: SITE }), retailIdParams);
    expect(parsed.data).toEqual({ id: SITE });
  });

  /**
   * Not a security fix — Prisma is not injectable. It is the difference between
   * a 400 naming the parameter and a 404 that reads, to a shopkeeper, as "the
   * receipt you are holding is not in the system".
   */
  it("refuses anything that is not one", async () => {
    for (const id of ["", "0", "undefined", "RSL-0001", "../../admin"]) {
      const parsed = await parseRetailParams(Promise.resolve({ id }), retailIdParams);
      expect(parsed.response?.status, id).toBe(400);
    }
  });
});

describe("cursor paging", () => {
  it("asks for one row more than the caller wanted", () => {
    expect(pageArgs({}, 60).take).toBe(61);
    expect(pageArgs({ limit: 10 }, 60).take).toBe(11);
  });

  it("skips the cursor row itself", () => {
    const args = pageArgs({ cursor: SITE }, 60);
    expect(args.cursor).toEqual({ id: SITE });
    expect(args.skip).toBe(1);
  });

  it("has no cursor clause when none was given", () => {
    expect(pageArgs({}, 60).cursor).toBeUndefined();
  });

  it("trims the probe row and hands back the next cursor", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const result = pageResult(rows, 2);
    expect(result.rows.map((row) => row.id)).toEqual(["a", "b"]);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("b");
  });

  /** The last page is the one where the probe row did not come back. */
  it("says there is no more when the probe row is absent", () => {
    const result = pageResult([{ id: "a" }, { id: "b" }], 2);
    expect(result.rows).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("handles an empty page", () => {
    const result = pageResult([], 60);
    expect(result).toEqual({ rows: [], nextCursor: null, hasMore: false });
  });

  it("accepts the page query a client sends", () => {
    expect(retailPageQuery.parse({ limit: "25", cursor: SITE })).toEqual({ limit: 25, cursor: SITE });
    expect(retailPageQuery.parse({})).toEqual({});
    expect(retailPageQuery.safeParse({ cursor: "not-a-uuid" }).success).toBe(false);
  });
});

describe("offset paging, for the lists that cannot cursor", () => {
  const rows = Array.from({ length: 25 }, (_, index) => index);

  it("returns the window asked for", () => {
    const page = slicePage(rows, { limit: 10, offset: 10 }, 100);
    expect(page.rows).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(page).toMatchObject({ total: 25, offset: 10, limit: 10, hasMore: true });
  });

  it("knows the last page is the last", () => {
    expect(slicePage(rows, { limit: 10, offset: 20 }, 100).hasMore).toBe(false);
  });

  it("returns nothing past the end rather than wrapping", () => {
    const page = slicePage(rows, { limit: 10, offset: 400 }, 100);
    expect(page.rows).toEqual([]);
    expect(page.hasMore).toBe(false);
    // The total stays honest, so a caller that overshot can tell it overshot.
    expect(page.total).toBe(25);
  });

  it("falls back to the route's own default", () => {
    expect(slicePage(rows, {}, 5).rows).toHaveLength(5);
  });

  it("refuses a negative offset", () => {
    expect(retailOffsetQuery.safeParse({ offset: "-1" }).success).toBe(false);
  });
});

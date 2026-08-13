/**
 * The safety net for S-4b: **core and retail agree on every shelf price.**
 *
 * S-4a (`scripts/retail-catalog-to-core.ts`) made core the system of record *in
 * parallel* — a `Product` per `RetailCatalogItem`, a `RETAIL` price list per
 * tenant, a `ProductPrice` per product. Nothing reads it yet. The till still
 * reads `RetailCatalogItem.unitPrice` and `taxPercent` literally, exactly as it
 * did before.
 *
 * This file is what makes flipping that read path defensible. It resolves each
 * price the way S-4b will — through `priceProduct` in `catalogue-service.ts`,
 * which is `resolvePrice` in `catalogue.ts` over the company's default list — and
 * asserts the answer equals the number the counter charges today. A cutover with
 * nothing proving the old and new answers match is a cutover you find out about
 * from a customer holding a slip.
 *
 * ## Exactly, not approximately
 *
 * Every comparison is `Prisma.Decimal.equals`, and every failure message renders
 * both sides at `toFixed(2)`. No `===` on a float, no epsilon. `lib/money.ts`
 * exists to retire the `Math.round((v + Number.EPSILON) * 100) / 100` helper that
 * was wrong at 8.575, and the retail refund path was already fixed for exactly
 * this. A parity test that tolerated a cent would pass on the drift it is here to
 * catch.
 *
 * `priceProduct` returns `number`, because `catalogue.ts` is still pure `number`
 * — that boundary is `catalogue-service.ts` and moving it is a later ticket. The
 * conversion back to `Decimal` here is therefore part of what is under test: if a
 * shelf price ever stops surviving the round trip through a double, this is where
 * it shows.
 *
 * ## Against the real database
 *
 * Like its siblings (`schema-migration.test.ts`, `stock-movements.test.ts`) this
 * reads the configured database rather than a fixture. A fixture would prove the
 * resolver is self-consistent; only the real rows prove the *migration* landed.
 */

import { Prisma } from "@prisma/client";
import { beforeAll, describe, expect, it } from "vitest";

import { money, percent } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { priceProduct, type PricedProduct } from "@/lib/inventory/catalogue-service";

/** Must match `PRICE_LIST_NAME` in `scripts/retail-catalog-to-core.ts`. */
const PRICE_LIST_NAME = "Shelf prices";

type Listing = {
  id: string;
  companyId: string;
  slug: string;
  sku: string;
  name: string;
  productId: string;
  unitPrice: Prisma.Decimal;
  taxPercent: Prisma.Decimal;
};

let listings: Listing[] = [];
let catalogueTotal = 0;

/**
 * Each listing priced through core, resolved **once**.
 *
 * Four assertions below read the same resolution. Calling `priceProduct` inside
 * each of them would be three round trips per listing against a pooled Neon
 * connection, which is both slow and — worse — three separate reads that could
 * disagree if something wrote between them. One resolution, asserted four ways.
 */
const resolved = new Map<string, PricedProduct | null>();

beforeAll(async () => {
  catalogueTotal = await prisma.retailCatalogItem.count();
  const rows = await prisma.retailCatalogItem.findMany({
    where: { productId: { not: null } },
    orderBy: [{ companyId: "asc" }, { sku: "asc" }],
    select: {
      id: true,
      companyId: true,
      sku: true,
      name: true,
      productId: true,
      unitPrice: true,
      taxPercent: true,
      company: { select: { slug: true } },
    },
  });
  listings = rows.map((row) => ({
    id: row.id,
    companyId: row.companyId,
    slug: row.company.slug,
    sku: row.sku,
    name: row.name,
    // Narrowed by the `not: null` filter, which Prisma's types do not carry.
    productId: row.productId as string,
    unitPrice: row.unitPrice,
    taxPercent: row.taxPercent,
  }));

  await Promise.all(
    listings.map(async (listing) => {
      resolved.set(listing.id, await priceProduct(listing.companyId, listing.productId));
    }),
  );
}, 120_000);

describe("every retail listing has a core product behind it", () => {
  /**
   * Without this the whole file is vacuously green. A parity suite that passes
   * because it found nothing to compare is worse than one that fails: it is the
   * exact evidence S-4b would cite before breaking the till.
   */
  it("finds catalogue rows to check", () => {
    expect(catalogueTotal).toBeGreaterThan(0);
    expect(listings.length).toBeGreaterThan(0);
  });

  it("leaves no catalogue row unlinked", async () => {
    const unlinked = await prisma.retailCatalogItem.findMany({
      where: { productId: null },
      select: { sku: true, company: { select: { slug: true } } },
    });
    expect(unlinked.map((row) => `${row.company.slug}/${row.sku}`)).toEqual([]);
  });

  it("points every linked product at the same company as its listing", async () => {
    const linked = await prisma.retailCatalogItem.findMany({
      where: { productId: { not: null } },
      select: {
        sku: true,
        companyId: true,
        company: { select: { slug: true } },
        product: { select: { companyId: true } },
      },
    });
    expect(
      linked
        .filter((row) => row.product !== null && row.product.companyId !== row.companyId)
        .map((row) => `${row.company.slug}/${row.sku}`),
    ).toEqual([]);
  });

  /**
   * `InventoryItem.productId` is the third leg. S-4a writes all three so the
   * listing, the stock row and the product name each other; a stock row left
   * unlinked is a margin figure core cannot compute.
   */
  it("links the stock row behind every listing to the same product", async () => {
    const rows = await prisma.$queryRaw<Array<{ label: string }>>`
      SELECT c.slug || '/' || r.sku AS label
      FROM "RetailCatalogItem" r
      JOIN "Company" c ON c.id = r."companyId"
      JOIN "InventoryItem" i ON i.id = r."inventoryItemId"
      WHERE r."productId" IS NOT NULL
        AND (i."productId" IS NULL OR i."productId" <> r."productId")
      ORDER BY 1
    `;
    expect(rows.map((row) => row.label)).toEqual([]);
  });
});

describe("the core resolver returns the shelf price, exactly", () => {
  it("prices every listing at what the catalogue charges", () => {
    const drift: string[] = [];

    for (const listing of listings) {
      const priced = resolved.get(listing.id);
      if (!priced) {
        drift.push(`${listing.slug}/${listing.sku}: core resolved no product at all`);
        continue;
      }

      const core = money(priced.line.unitPrice);
      const shelf = money(listing.unitPrice);
      if (!core.equals(shelf)) {
        drift.push(
          `${listing.slug}/${listing.sku} (${listing.name}): core says ${core.toFixed(2)}, ` +
            `catalogue says ${shelf.toFixed(2)}`,
        );
      }
    }

    expect(drift).toEqual([]);
  });

  it("carries the same tax rate on every listing", () => {
    const drift: string[] = [];

    for (const listing of listings) {
      const priced = resolved.get(listing.id);
      const core = percent(priced?.line.taxRate ?? 0);
      const shelf = percent(listing.taxPercent);
      if (!core.equals(shelf)) {
        drift.push(
          `${listing.slug}/${listing.sku}: core says ${core.toFixed(2)}%, ` +
            `catalogue says ${shelf.toFixed(2)}%`,
        );
      }
    }

    expect(drift).toEqual([]);
  });

  /**
   * The price must come **from the list**, not from `Product.standardPrice`.
   *
   * S-4a writes the same figure into both, so a fallback to standard would still
   * satisfy the two assertions above — and would then diverge the first time a
   * shop edits a shelf price on the list, which is the only place S-4b lets them
   * edit it. `priceSource` is the resolver saying which row it used, so this is
   * the assertion that the list is actually wired up.
   */
  it("resolves through the price list rather than falling back to standard", () => {
    const fellBack: string[] = [];

    for (const listing of listings) {
      const priced = resolved.get(listing.id);
      if (priced?.line.priceSource !== "PRICE_LIST") {
        fellBack.push(`${listing.slug}/${listing.sku}: ${priced?.line.priceSource ?? "none"}`);
      }
    }

    expect(fellBack).toEqual([]);
  });

  /**
   * `standardPrice` is the fallback the resolver reaches for when a list has no
   * entry. Keeping it equal to the shelf price means a product that loses its
   * list entry degrades to the right number instead of to zero.
   */
  it("keeps Product.standardPrice equal to the shelf price", async () => {
    const drift: string[] = [];

    const products = await prisma.product.findMany({
      where: { id: { in: listings.map((listing) => listing.productId) } },
      select: { id: true, code: true, standardPrice: true, defaultTaxRate: true },
    });
    const byId = new Map(products.map((product) => [product.id, product]));

    for (const listing of listings) {
      const product = byId.get(listing.productId);
      if (!product) {
        drift.push(`${listing.slug}/${listing.sku}: productId names no Product`);
        continue;
      }
      if (!money(product.standardPrice).equals(money(listing.unitPrice))) {
        drift.push(
          `${listing.slug}/${listing.sku}: standardPrice ${money(product.standardPrice).toFixed(2)} ` +
            `vs shelf ${money(listing.unitPrice).toFixed(2)}`,
        );
      }
      if (!percent(product.defaultTaxRate).equals(percent(listing.taxPercent))) {
        drift.push(
          `${listing.slug}/${listing.sku}: defaultTaxRate ` +
            `${percent(product.defaultTaxRate).toFixed(2)}% vs ${percent(listing.taxPercent).toFixed(2)}%`,
        );
      }
    }

    expect(drift).toEqual([]);
  });
});

describe("the shelf-price list is shaped the way the till needs", () => {
  it("gives every tenant with a catalogue one RETAIL, tax-inclusive list", async () => {
    const companyIds = [...new Set(listings.map((listing) => listing.companyId))];
    expect(companyIds.length).toBeGreaterThan(0);

    const problems: string[] = [];
    for (const companyId of companyIds) {
      const list = await prisma.priceList.findUnique({
        where: { companyId_name: { companyId, name: PRICE_LIST_NAME } },
        select: { kind: true, taxInclusive: true, isActive: true, currency: true },
      });
      if (!list) {
        problems.push(`${companyId}: no "${PRICE_LIST_NAME}" list`);
        continue;
      }
      if (list.kind !== "RETAIL") problems.push(`${companyId}: kind is ${list.kind}`);
      // A Zimbabwean shelf price is what the customer pays. A list marked
      // exclusive would have the till add 15% to a figure that already has it.
      if (!list.taxInclusive) problems.push(`${companyId}: not taxInclusive`);
      if (!list.isActive) problems.push(`${companyId}: inactive`);
      if (!/^[A-Z]{3}$/.test(list.currency)) problems.push(`${companyId}: currency ${list.currency}`);
    }

    expect(problems).toEqual([]);
  });

  it("prices each product exactly once, at a minimum quantity of one", async () => {
    const entries = await prisma.productPrice.findMany({
      where: { productId: { in: listings.map((listing) => listing.productId) } },
      select: { productId: true, minQuantity: true, priceList: { select: { name: true } } },
    });
    const shelf = entries.filter((entry) => entry.priceList.name === PRICE_LIST_NAME);

    expect(shelf.length).toBe(listings.length);
    expect(
      shelf
        .filter((entry) => !new Prisma.Decimal(entry.minQuantity).equals(1))
        .map((entry) => entry.productId),
    ).toEqual([]);

    const counts = new Map<string, number>();
    for (const entry of shelf) {
      counts.set(entry.productId, (counts.get(entry.productId) ?? 0) + 1);
    }
    expect([...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id)).toEqual([]);
  });
});

/**
 * The shelf price the till charges, checked against the rows behind it.
 *
 * This file was `retail-price-parity.test.ts`, and its job was to prove that
 * core and `RetailCatalogItem` agreed on every price so S-4b could flip the read
 * path. S-4 dropped that table, which takes one side of the comparison away —
 * but not the question. Every assertion here is one the old file made; each has
 * been re-sourced from what the range is *now*: a `Product`, the site's
 * `InventoryItem` claiming it, and one entry on the tenant's shelf list.
 *
 * ## What it still catches
 *
 * The till does not read `Product.standardPrice`. It reads whatever
 * `resolvePrice` hands back, which is the `ProductPrice` row on the "Shelf
 * prices" list when there is one and `standardPrice` when there is not. Three
 * rows therefore have to stay in step, and nothing in the type system makes them:
 *
 *  - a list entry that goes missing silently drops the shop to `standardPrice`;
 *  - a list marked tax-exclusive makes the counter add 15% to a figure that
 *    already contains it, and every slip that day is wrong by 15%;
 *  - a second entry at the same minimum quantity makes the price depend on row
 *    order.
 *
 * Each of those is a wrong number on a customer's slip, not a crash, which is
 * exactly the class of defect that reaches the shop floor.
 *
 * ## Exactly, not approximately
 *
 * Every comparison is `Prisma.Decimal.equals`, and every failure renders both
 * sides at `toFixed(2)`. No `===` on a float, no epsilon — `lib/money.ts` exists
 * to retire the rounding helper that was wrong at 8.575, and a price test that
 * tolerated a cent would pass on the drift it is here to catch.
 *
 * `priceProduct` returns `number`, because `catalogue.ts` is still pure
 * `number`. The conversion back to `Decimal` here is part of what is under test:
 * if a shelf price ever stops surviving the round trip through a double, this is
 * where it shows.
 *
 * ## Against the real database
 *
 * Like its siblings (`schema-migration.test.ts`, `stock-movements.test.ts`) this
 * reads the configured database rather than only a fixture. A fixture proves the
 * resolver is self-consistent; only the real rows prove the range is. So it does
 * both: one known-good range (a product, its stock row, its shelf-list entry) is
 * created for the run, and every real row present is audited alongside it. On an
 * empty database — CI — the fixture is what keeps the file from being vacuous.
 */

import crypto from "node:crypto";

import { Prisma } from "@corelithzw/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { money, percent } from "@/lib/money";
import { prisma } from "@corelithzw/db/client";
import { priceProduct, type PricedProduct } from "@/lib/inventory/catalogue-service";
import { SHELF_PRICE_LIST_NAME } from "@/lib/retail/shelf-pricing";

/**
 * One ranged line.
 *
 * "Ranged" is `InventoryItem.productId is not null` — the same condition
 * `lib/retail/shelf-listing.ts` uses to decide what the till may sell, so this
 * checks the set the counter actually sees rather than a superset of it.
 */
type Ranged = {
  productId: string;
  companyId: string;
  slug: string;
  code: string;
  name: string;
  standardPrice: Prisma.Decimal;
  defaultTaxRate: Prisma.Decimal;
  inventoryItemId: string;
};

let ranged: Ranged[] = [];

/**
 * Each line priced through core, resolved **once**.
 *
 * Several assertions read the same resolution. Calling `priceProduct` inside
 * each would be three round trips per line against a pooled Neon connection,
 * which is both slow and — worse — separate reads that could disagree if
 * something wrote between them.
 */
const resolved = new Map<string, PricedProduct | null>();

const suite = crypto.randomUUID().slice(0, 8);
/** The fixture tenant; everything it owns is removed in afterAll. */
let fixtureCompanyId: string | undefined;

async function createFixtureRange() {
  const company = await prisma.company.create({
    data: { name: `Shelf price fixture ${suite}`, slug: `shelf-price-${suite}` },
    select: { id: true },
  });
  fixtureCompanyId = company.id;
  const site = await prisma.site.create({
    data: { companyId: company.id, name: "Shop", code: `SHOP-${suite}` },
    select: { id: true },
  });
  const location = await prisma.stockLocation.create({
    data: { siteId: site.id, code: "FLOOR", name: "Shop floor" },
    select: { id: true },
  });
  const product = await prisma.product.create({
    data: {
      companyId: company.id,
      code: `SKU-${suite}`,
      name: "Fixture item",
      standardPrice: new Prisma.Decimal("11.50"),
      defaultTaxRate: new Prisma.Decimal("15"),
    },
    select: { id: true },
  });
  const list = await prisma.priceList.create({
    data: {
      companyId: company.id,
      name: SHELF_PRICE_LIST_NAME,
      kind: "RETAIL",
      taxInclusive: true,
      isDefault: true,
    },
    select: { id: true },
  });
  await prisma.productPrice.create({
    data: {
      companyId: company.id,
      priceListId: list.id,
      productId: product.id,
      minQuantity: new Prisma.Decimal(1),
      unitPrice: new Prisma.Decimal("11.50"),
    },
  });
  await prisma.inventoryItem.create({
    data: {
      itemCode: `SKU-${suite}`,
      name: "Fixture item",
      category: "GOODS",
      unit: "each",
      siteId: site.id,
      locationId: location.id,
      productId: product.id,
    },
  });
}

afterAll(async () => {
  if (!fixtureCompanyId) return;
  const companyId = fixtureCompanyId;
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
  await prisma.productPrice.deleteMany({ where: { companyId } });
  await prisma.priceList.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

beforeAll(async () => {
  await createFixtureRange();

  const rows = await prisma.inventoryItem.findMany({
    where: { productId: { not: null }, product: { isActive: true, archivedAt: null } },
    select: {
      id: true,
      productId: true,
      product: {
        select: {
          id: true,
          companyId: true,
          code: true,
          name: true,
          standardPrice: true,
          defaultTaxRate: true,
          company: { select: { slug: true } },
        },
      },
    },
  });

  ranged = rows
    .filter((row): row is typeof row & { product: NonNullable<typeof row.product> } =>
      row.product !== null,
    )
    .map((row) => ({
      productId: row.product.id,
      companyId: row.product.companyId,
      slug: row.product.company.slug,
      code: row.product.code,
      name: row.product.name,
      standardPrice: row.product.standardPrice,
      defaultTaxRate: row.product.defaultTaxRate,
      inventoryItemId: row.id,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug) || a.code.localeCompare(b.code));

  await Promise.all(
    [...new Set(ranged.map((line) => line.productId))].map(async (productId) => {
      const line = ranged.find((entry) => entry.productId === productId);
      if (!line) return;
      resolved.set(productId, await priceProduct(line.companyId, productId));
    }),
  );
}, 120_000);

describe("the range is a product and a stock row, both ways round", () => {
  /**
   * Without this the whole file is vacuously green — a suite that passes because
   * it found nothing to compare is worse than one that fails.
   */
  it("finds ranged lines to check", () => {
    expect(ranged.length).toBeGreaterThan(0);
  });

  /**
   * A stock row may only be claimed by a product in its own tenant. Nothing in
   * the schema says so: `InventoryItem` reaches its company through `Site` and
   * `Product` holds `companyId` directly, so the two can disagree without any
   * foreign key noticing — and a cross-tenant claim would put one shop's stock
   * behind another shop's shelf price.
   */
  it("keeps every claimed stock row in its product's tenant", async () => {
    const rows = await prisma.$queryRaw<Array<{ label: string }>>`
      SELECT c.slug || '/' || p.code AS label
      FROM "InventoryItem" i
      JOIN "Product" p ON p.id = i."productId"
      JOIN "Site" s ON s.id = i."siteId"
      JOIN "Company" c ON c.id = p."companyId"
      WHERE i."productId" IS NOT NULL
        AND s."companyId" <> p."companyId"
      ORDER BY 1
    `;
    expect(rows.map((row) => row.label)).toEqual([]);
  });

  /**
   * S-4 dropped `RetailCatalogItem`, and this asserts it stays dropped. A model
   * reintroduced by a merge would give the shop a second item master again
   * without anything else going red.
   */
  it("has no second item master", async () => {
    const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*) AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'RetailCatalogItem'
    `;
    expect(Number(rows[0]?.n ?? 0)).toBe(0);
  });
});

describe("the core resolver returns the shelf price, exactly", () => {
  /**
   * The price must come **from the list**, not from `Product.standardPrice`.
   *
   * The two are written to the same figure, so a silent fallback to standard
   * would satisfy every value assertion below — and would then diverge the first
   * time a shop edits a shelf price, which is the only place the catalogue
   * screen lets them edit it. `priceSource` is the resolver saying which row it
   * used, so this is the assertion that the list is actually wired up.
   */
  it("resolves through the price list rather than falling back to standard", () => {
    const fellBack: string[] = [];

    for (const line of ranged) {
      const priced = resolved.get(line.productId);
      if (priced?.line.priceSource !== "PRICE_LIST") {
        fellBack.push(`${line.slug}/${line.code}: ${priced?.line.priceSource ?? "none"}`);
      }
    }

    expect(fellBack).toEqual([]);
  });

  /**
   * `standardPrice` is what the resolver reaches for when a list has no entry.
   * Keeping it equal to the list price means a line that loses its entry
   * degrades to the right number instead of to zero — which, on a tax-inclusive
   * shelf, is the difference between a slip that is slightly stale and a bottle
   * given away.
   */
  it("keeps Product.standardPrice equal to the resolved shelf price", () => {
    const drift: string[] = [];

    for (const line of ranged) {
      const priced = resolved.get(line.productId);
      if (!priced) {
        drift.push(`${line.slug}/${line.code}: core resolved no product at all`);
        continue;
      }
      const listed = money(priced.line.unitPrice);
      const standard = money(line.standardPrice);
      if (!listed.equals(standard)) {
        drift.push(
          `${line.slug}/${line.code} (${line.name}): list says ${listed.toFixed(2)}, ` +
            `standardPrice says ${standard.toFixed(2)}`,
        );
      }
    }

    expect(drift).toEqual([]);
  });

  it("carries a tax rate the counter can charge", () => {
    const drift: string[] = [];

    for (const line of ranged) {
      const priced = resolved.get(line.productId);
      const core = percent(priced?.line.taxRate ?? 0);
      const stored = percent(line.defaultTaxRate);
      if (!core.equals(stored)) {
        drift.push(
          `${line.slug}/${line.code}: core says ${core.toFixed(2)}%, ` +
            `product says ${stored.toFixed(2)}%`,
        );
      }
    }

    expect(drift).toEqual([]);
  });
});

describe("the shelf-price list is shaped the way the till needs", () => {
  it("gives every tenant with a range one RETAIL, tax-inclusive list", async () => {
    const companyIds = [...new Set(ranged.map((line) => line.companyId))];
    expect(companyIds.length).toBeGreaterThan(0);

    const problems: string[] = [];
    for (const companyId of companyIds) {
      const list = await prisma.priceList.findUnique({
        where: { companyId_name: { companyId, name: SHELF_PRICE_LIST_NAME } },
        select: { kind: true, taxInclusive: true, isActive: true, currency: true },
      });
      if (!list) {
        problems.push(`${companyId}: no "${SHELF_PRICE_LIST_NAME}" list`);
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

  it("prices each ranged product exactly once, at a minimum quantity of one", async () => {
    const productIds = [...new Set(ranged.map((line) => line.productId))];
    const entries = await prisma.productPrice.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, minQuantity: true, priceList: { select: { name: true } } },
    });
    const shelf = entries.filter((entry) => entry.priceList.name === SHELF_PRICE_LIST_NAME);

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

    // Every ranged line is on the list. Asserted after the duplicate check so a
    // missing entry and a doubled one cannot cancel each other out in the count.
    expect(productIds.filter((id) => !counts.has(id))).toEqual([]);
  });
});

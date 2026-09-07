/**
 * Opening a shop.
 *
 * R-5.1. The promise is that a provisioned tenant can trade on the first
 * morning, and for retail that has an exact meaning: a cashier can open a
 * drawer. `openRetailShiftTransaction` needs a site and a register, and a
 * retail tenant used to be handed over with neither — so the first action of
 * the first day failed with *Invalid site*.
 *
 * These check the records that decide it, and idempotency as hard as the happy
 * path. The most likely second run is somebody repairing a shop that is half
 * set up, and a repair that reverts a choice the shop has made is worse than no
 * repair at all.
 *
 * ## Three tenants, not thirteen
 *
 * `provisionRetail` calls `ensureAccountingDefaults`, which lays down a whole
 * chart of accounts and a posting rule per source type. Against a pooled Neon
 * that is close to a minute, and a company per `it` took this file to twelve.
 *
 * So the assertions are grouped by what they need rather than by what reads
 * neatly: one tenant provisioned once for everything read-only, one bare tenant
 * for the blockers, one for the idempotency run that has to mutate, and one
 * told to call itself something else. The cost is shared state, and the guard
 * against it is that the read-only blocks genuinely only read.
 *
 * Every tenant is created in a `beforeAll`, never inside an `it`. A
 * `beforeAll` gets the long hook timeout; a test body gets the test timeout,
 * and putting the slowest work of the run there is how the last one failed
 * with a connection error that said nothing about what it was testing.
 *
 * ## This is the heaviest file in the suite, and it is honest about it
 *
 * Four tenants, four `ensureAccountingDefaults` runs, about six minutes
 * against the pooled Neon this project develops on. On a busy pooler it does
 * not merely run slowly — it fails, with `timeout exceeded when trying to
 * connect`, at a different point each time.
 *
 * That failure is worth recognising rather than chasing: it names the pool,
 * not an assertion, and no test in this file has ever failed on what it
 * asserts. If a run goes red that way, check the error is a connect timeout,
 * run `scripts/clean-provision-test-tenants.ts --apply` to clear whatever the
 * aborted run left, and try again when the database is quiet.
 *
 * The obvious cure — mocking the accounting bootstrap — is refused. What this
 * file is for is the claim that a provisioned tenant can trade on the first
 * morning, and a sale with no chart of accounts to post to fails at the
 * counter. Proving that against a fake would prove nothing.
 *
 * Prerequisites: a real Postgres `DATABASE_URL` with the migrations applied.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@corelithzw/db/client";
import { getRetailSetupProfile, saveRetailSetupProfile } from "./setup-profile";

import { provisionRetail, retailTradingBlockers, type ProvisionRetailResult } from "./provision";

const SLOW = 300_000;
const created: string[] = [];

async function freshCompany(label: string): Promise<string> {
  const stamp = `${Date.now()}-${Math.floor(process.hrtime()[1] / 1000)}`;
  const company = await prisma.company.create({
    data: { name: `Provision ${label} ${stamp}`, slug: `provision-${label}-${stamp}` },
  });
  created.push(company.id);
  return company.id;
}

/**
 * Put every throwaway tenant back, and **say so** if one will not go.
 *
 * This was `company.delete(...).catch(() => {})`, and the swallow was written
 * to stop a cleanup failure turning a green run red. It hid the fact that the
 * delete always failed: R-1.4 made `Site` `onDelete: Restrict` — a branch with
 * sales against it must not vanish — so a provisioned company cannot be
 * deleted in one call, and every run left its tenants behind. Forty
 * accumulated on a shared database in an afternoon.
 *
 * What made it visible was somewhere else entirely.
 * `lib/inventory/shelf-price-integrity.test.ts` prices every ranged line in
 * the database through the resolver, in parallel; the ranged set went from
 * about thirty to eighty, the fan-out exhausted the connection pool, and that
 * suite began failing with *timeout exceeded when trying to connect*. An error
 * about the network, caused by this `catch`.
 *
 * So the unwinding is explicit and ordered, and a failure is reported rather
 * than eaten. `scripts/clean-provision-test-tenants.ts` is the same teardown
 * as a command, for the tenants written before this was fixed.
 */
async function removeCompany(companyId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.productPrice.deleteMany({ where: { companyId } });
    await tx.priceList.deleteMany({ where: { companyId } });

    const sites = await tx.site.findMany({ where: { companyId }, select: { id: true } });
    const siteIds = sites.map((site) => site.id);
    if (siteIds.length > 0) {
      await tx.stockMovement.deleteMany({ where: { item: { siteId: { in: siteIds } } } });
      await tx.inventoryItem.deleteMany({ where: { siteId: { in: siteIds } } });
      await tx.stockLocation.deleteMany({ where: { siteId: { in: siteIds } } });
    }

    await tx.product.deleteMany({ where: { companyId } });
    await tx.retailRegister.deleteMany({ where: { companyId } });
    await tx.site.deleteMany({ where: { companyId } });

    // Thirteen accounting models, innermost first. See the script for why the
    // refusals name things like `TaxRule_templateId_fkey`.
    await tx.taxRule.deleteMany({ where: { template: { companyId } } });
    await tx.taxTemplateLine.deleteMany({ where: { template: { companyId } } });
    await tx.taxTemplate.deleteMany({ where: { companyId } });
    await tx.taxCode.deleteMany({ where: { companyId } });
    await tx.taxCategory.deleteMany({ where: { companyId } });
    await tx.tenderAccountMapping.deleteMany({ where: { companyId } });
    await tx.postingRule.deleteMany({ where: { companyId } });
    await tx.bankAccount.deleteMany({ where: { companyId } });
    await tx.accountingPeriod.deleteMany({ where: { companyId } });
    await tx.accountingSettings.deleteMany({ where: { companyId } });
    await tx.accountingSeedExecution.deleteMany({ where: { companyId } });
    await tx.currencyRate.deleteMany({ where: { companyId } });
    await tx.currencyDefinition.deleteMany({ where: { companyId } });
    await tx.chartOfAccount.deleteMany({ where: { companyId } });
    await tx.fiscalisationProviderConfig.deleteMany({ where: { companyId } });

    /*
      `deleteMany`, so an already-removed company is a no-op rather than a
      throw. `delete` raises "No record was found for a delete", which is a
      loud failure describing the state teardown was trying to reach — and it
      fires whenever anything else has cleaned up first, including
      `scripts/clean-provision-test-tenants.ts` run in another terminal.
      Whether the tenant is really gone is checked below, on its own.
    */
    await tx.company.deleteMany({ where: { id: companyId } });
  });
}

afterAll(async () => {
  const stubborn: string[] = [];
  for (const id of created) {
    try {
      await removeCompany(id);
    } catch (error) {
      stubborn.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await prisma.$disconnect();

  // Loud. A tenant left on a shared database is somebody else's failing suite
  // tomorrow, and the whole point of this rewrite is that it stops being
  // silent.
  if (stubborn.length > 0) {
    throw new Error(
      `${stubborn.length} throwaway tenant(s) survived teardown. Run ` +
        `scripts/clean-provision-test-tenants.ts --apply.\n  ${stubborn.join("\n  ")}`,
    );
  }
}, SLOW);

/* ── One shop, provisioned once, read many times ──────────────────────── */

describe("a shop that has just been opened", () => {
  let companyId: string;
  let result: ProvisionRetailResult;

  beforeAll(async () => {
    companyId = await freshCompany("open");
    result = await provisionRetail({ companyId, starterRange: true });
  }, SLOW);

  it("created a branch, a till and somewhere to hold stock", () => {
    expect(result.site.created).toBe(true);
    expect(result.location.created).toBe(true);
    expect(result.register.created).toBe(true);
  });

  /**
   * Read back from the database rather than from the result, for the reason
   * every migration script in this repo gives: the counters are what the code
   * believes and the tables are what is true.
   */
  it("wrote them where the till will look", async () => {
    const site = await prisma.site.findFirstOrThrow({ where: { companyId } });
    expect(site.code).toBe("MAIN");
    expect(site.isActive).toBe(true);

    const register = await prisma.retailRegister.findFirstOrThrow({ where: { companyId } });
    expect(register.siteId).toBe(site.id);
    expect(register.isActive).toBe(true);

    const location = await prisma.stockLocation.findFirstOrThrow({ where: { siteId: site.id } });
    expect(location.code).toBe("SHOP");
  });

  /**
   * One location, not two. `InventoryItem` holds one on-hand figure per (site,
   * itemCode) — there is no per-location quantity in the schema — so a second
   * location at provisioning time would offer a transfer that cannot move
   * anything, and the transfers screen hides itself below two for that reason.
   */
  it("opens exactly one stock location", async () => {
    expect(await prisma.stockLocation.count({ where: { site: { companyId } } })).toBe(1);
  });

  it("points the till portal at the branch and register it just made", async () => {
    const profile = await getRetailSetupProfile(companyId);
    expect(profile.defaultSiteId).toBe(result.site.id);
    expect(profile.defaultRegisterId).toBe(result.register.id);
    expect(profile.defaultRegisterCode).toBe(result.register.code);
  });

  /**
   * A sale whose journal has no accounts to post to fails at the counter with
   * an accounting error, which reads to a cashier as the sale not going
   * through.
   */
  it("lays down somewhere for a sale to post", async () => {
    expect(result.accounting.accountsCreated).toBeGreaterThan(0);
    expect(await prisma.chartOfAccount.count({ where: { companyId } })).toBeGreaterThan(0);
  });

  it("ranges the starter lines the way the catalogue screen would", async () => {
    expect(result.productsRanged).toBe(6);

    const products = await prisma.product.findMany({
      where: { companyId },
      select: { code: true, standardPrice: true, isActive: true },
      orderBy: { code: "asc" },
    });
    expect(products.map((product) => product.code)).toContain("CASTLE-340");
    expect(products.every((product) => product.isActive)).toBe(true);
    expect(
      products.find((product) => product.code === "CASTLE-340")?.standardPrice.toFixed(2),
    ).toBe("1.20");

    // A product, a shelf-list entry against it, and the site's stock row
    // claimed by it — the three rows `upsertShelfListing` writes.
    expect(
      await prisma.inventoryItem.count({
        where: { site: { companyId }, productId: { not: null } },
      }),
    ).toBe(6);
    expect(
      await prisma.productPrice.count({
        where: { companyId, priceList: { name: "Shelf prices" } },
      }),
    ).toBe(6);
  });

  /**
   * Nothing on the shelf means nothing on the shelf. A provisioning step that
   * invented stock would put a figure in the count screen nobody counted, and
   * the first stock take would post a variance against a fiction.
   */
  it("puts no stock behind the starter range", async () => {
    const items = await prisma.inventoryItem.findMany({
      where: { site: { companyId } },
      select: { currentStock: true },
    });
    expect(items).toHaveLength(6);
    expect(items.every((item) => item.currentStock.isZero())).toBe(true);
  });

  it("leaves nothing between this shop and a sale", async () => {
    expect(result.blockers).toEqual([]);
    expect(await retailTradingBlockers(companyId)).toEqual([]);
  });
});

/* ── A bare tenant, for the refusals ──────────────────────────────────── */

describe("why a shop cannot sell", () => {
  let companyId: string;

  beforeAll(async () => {
    companyId = await freshCompany("bare");
  }, SLOW);

  it("names every missing piece", async () => {
    const blockers = await retailTradingBlockers(companyId);
    expect(blockers).toHaveLength(4);
    const all = blockers.join(" ");
    expect(all).toContain("no branch");
    expect(all).toContain("no till");
    expect(all).toContain("nowhere to hold stock");
    expect(all).toContain("Nothing is on the shelf");
  });

  /**
   * Speaks the shop's language, not the schema's. Somebody reading this is a
   * shopkeeper on a support call, and "no `RetailRegister` row" is not an
   * answer they can act on.
   */
  it("explains itself in words a shopkeeper can act on", async () => {
    for (const blocker of await retailTradingBlockers(companyId)) {
      expect(blocker, blocker).not.toMatch(/Retail[A-Z]|InventoryItem|productId|companyId/);
      expect(blocker.endsWith("."), blocker).toBe(true);
    }
  });
});

/* ── The mutating one ─────────────────────────────────────────────────── */

describe("running it twice", () => {
  let companyId: string;
  let first: ProvisionRetailResult;

  beforeAll(async () => {
    companyId = await freshCompany("again");
    first = await provisionRetail({ companyId });
  }, SLOW);

  /**
   * The one opinion this module refuses to have. A range is the thing a
   * shopkeeper certainly has their own version of, and six invented products
   * are six rows somebody has to find and delete before they trust the screen.
   */
  it("ranged nothing, because nobody asked", async () => {
    expect(first.productsRanged).toBe(0);
    expect(await prisma.product.count({ where: { companyId } })).toBe(0);
    expect(first.blockers).toEqual([
      "Nothing is on the shelf. Add a catalogue item and the till has something to ring up.",
    ]);
  });

  it("creates nothing the second time", async () => {
    const second = await provisionRetail({ companyId });

    expect(second.site.created).toBe(false);
    expect(second.location.created).toBe(false);
    expect(second.register.created).toBe(false);

    expect(await prisma.site.count({ where: { companyId } })).toBe(1);
    expect(await prisma.retailRegister.count({ where: { companyId } })).toBe(1);
    expect(await prisma.stockLocation.count({ where: { site: { companyId } } })).toBe(1);
  }, SLOW);

  /**
   * The case that makes idempotency worth testing rather than asserting.
   *
   * A shop opens a second till and makes it the default. Somebody re-runs
   * provisioning to fix something unrelated. If the profile were rewritten
   * unconditionally, every cashier would come back tomorrow on the wrong
   * register — and the shift they opened would be against it.
   */
  it("does not revert a default register the shop has chosen", async () => {
    const second = await prisma.retailRegister.create({
      data: {
        companyId,
        siteId: first.site.id,
        name: "Till 2",
        code: "REG-002",
        isActive: true,
      },
    });
    await saveRetailSetupProfile(companyId, {
      defaultSiteId: first.site.id,
      defaultRegisterId: second.id,
      defaultRegisterName: second.name,
      defaultRegisterCode: second.code,
    });

    const again = await provisionRetail({ companyId });
    expect(again.setupProfileWritten).toBe(false);

    const profile = await getRetailSetupProfile(companyId);
    expect(profile.defaultRegisterId).toBe(second.id);
    expect(profile.defaultRegisterCode).toBe("REG-002");
  }, SLOW);

});

/* ── A shop that is told what to call itself ──────────────────────────── */

/**
 * Its own `describe` with its own `beforeAll`, like the three above, rather
 * than a `freshCompany` inside the test body.
 *
 * The difference is not style. This is the fourth accounting bootstrap in the
 * file, each about a minute against a pooled Neon, and creating the tenant
 * inside an `it` put the slowest work of the run under the test timeout while
 * the pool was at its most contended. It failed with *timeout exceeded when
 * trying to connect* — an error about the connection, describing nothing about
 * branch names.
 */
describe("a shop that is told what to call itself", () => {
  let named: ProvisionRetailResult;

  beforeAll(async () => {
    named = await provisionRetail({
      companyId: await freshCompany("named"),
      siteCode: "AVONDALE",
      siteName: "Avondale Shops",
      registerName: "Front counter",
      registerCode: "REG-FRONT",
    });
  }, SLOW);

  it("takes the branch and till names it is given", () => {
    expect(named.site.code).toBe("AVONDALE");
    expect(named.site.name).toBe("Avondale Shops");
    expect(named.register.name).toBe("Front counter");
    expect(named.register.code).toBe("REG-FRONT");
  });
});

import { prisma } from "@corelithzw/db/client";
import { money, percent } from "@corelithzw/platform/money";
import { ensureAccountingDefaults } from "@corelithzw/module-books/bootstrap";
import { upsertShelfListing } from "@/lib/retail/shelf-listing";
import { getRetailSetupProfile, saveRetailSetupProfile } from "@/lib/retail/setup-profile";

/**
 * Opening a shop.
 *
 * R-5.1. Provisioning a retail tenant created a company, an administrator, a
 * tier, a bundle and a subdomain — and no shop. The first thing a cashier does
 * on their first morning is open a drawer, and
 * `openRetailShiftTransaction` needs a **site** and a **register** to open one
 * against. Neither existed, so the answer to "can this tenant trade today" was
 * no, and the way you found out was a cashier standing at a till reading
 * *Invalid site*.
 *
 * This is the smallest set of records that lets a shop take its first sale:
 *
 *  1. a **site** — the branch, which every shift, sale and stock row is scoped to;
 *  2. a **stock location** at it — `InventoryItem` requires one, so without it
 *     nothing can be ranged and there is nothing to sell;
 *  3. a **register** — the till itself, and the thing `RetailShift` names;
 *  4. the **setup profile** — which site and register the POS portal defaults
 *     to, so a one-branch shop is never asked to choose;
 *  5. the **accounting foundation** — the chart of accounts and posting rules,
 *     without which every sale posts to a journal that refuses it.
 *
 * ## What it deliberately does not create
 *
 * **A starter catalogue, unless asked.** The primary plan's R-5.1 lists one, and
 * `starterRange` below will lay down a small Zimbabwean bottle-store range on
 * request — but it is off by default. A range is the one thing in this list a
 * shopkeeper certainly has their own version of, and a provisioning step that
 * invents fifteen products is fifteen rows somebody has to find and delete
 * before they trust the screen. The four records above are infrastructure; a
 * product is an opinion about what this shop sells.
 *
 * **A tender policy.** `getRetailTenderPolicy` already returns
 * `DEFAULT_RETAIL_TENDER_POLICY` when no row exists, and that default is the
 * sensible one. Writing it to the database would turn "running on defaults"
 * into "somebody configured this", which is exactly the distinction the POS
 * policy screen renders as *Draft* against *Saved*.
 *
 * **Users.** Who works the till is the operator's decision and it is made
 * elsewhere.
 *
 * ## Idempotent by code
 *
 * Every step looks for its record by a stable code before creating one, and
 * re-running adds what is missing and leaves the rest alone. An operator who
 * runs it twice, or runs it after a shop has started trading, does no damage —
 * which matters, because the most likely second run is somebody trying to fix a
 * shop that is half set up.
 */

/** The branch a shop gets when nobody has named one. */
const DEFAULT_SITE_CODE = "MAIN";
const DEFAULT_SITE_NAME = "Main Branch";

/**
 * The shop floor.
 *
 * One location, not two. `InventoryItem` holds one on-hand figure per (site,
 * itemCode) — there is no per-location quantity anywhere in the schema — so a
 * second location at provisioning time would offer a transfer that cannot move
 * anything. The transfers screen hides itself below two locations for the same
 * reason.
 */
const DEFAULT_LOCATION_CODE = "SHOP";
const DEFAULT_LOCATION_NAME = "Shop floor";

const DEFAULT_REGISTER_NAME = "Till 1";
const DEFAULT_REGISTER_CODE = "REG-001";

/**
 * Zimbabwe's standard rate. The shelf list is tax-inclusive, so a $1.20 tag is
 * what the customer pays and $0.16 of it is VAT.
 */
const VAT_PERCENT = 15;

/**
 * A starter range, only when asked for.
 *
 * Six lines rather than a full shop: enough that the till grid, the stock
 * screen and a receipt all have something to render on the first morning, few
 * enough that deleting them is a minute's work rather than an afternoon's.
 * Prices are ordinary Harare bottle-store prices in USD.
 */
const STARTER_RANGE = [
  { code: "CASTLE-340", name: "Castle Lager 340ml", unit: "bottle", price: "1.20", cost: "0.85" },
  { code: "CHIBUKU-1L", name: "Chibuku Scud 1L", unit: "carton", price: "1.10", cost: "0.72" },
  { code: "COKE-500", name: "Coca-Cola 500ml", unit: "bottle", price: "0.75", cost: "0.48" },
  { code: "CASTLE-CASE", name: "Castle Lager case of 24", unit: "case", price: "26.50", cost: "20.40" },
  { code: "TWOKEYS-750", name: "Two Keys Whisky 750ml", unit: "bottle", price: "9.75", cost: "7.20" },
  { code: "ICE-2KG", name: "Ice 2kg bag", unit: "bag", price: "1.50", cost: "0.60" },
] as const;

export type ProvisionRetailOptions = {
  companyId: string;
  /** The branch to open. An existing site with this code is reused. */
  siteCode?: string;
  siteName?: string;
  registerName?: string;
  registerCode?: string;
  /**
   * Lay down `STARTER_RANGE`. Off by default — see the header for why a
   * provisioning step should not decide what a shop sells.
   */
  starterRange?: boolean;
};

export type ProvisionRetailResult = {
  site: { id: string; code: string; name: string; created: boolean };
  location: { id: string; code: string; created: boolean };
  register: { id: string; code: string; name: string; created: boolean };
  /** Whether the POS portal's default site and register were written. */
  setupProfileWritten: boolean;
  /** How many `STARTER_RANGE` lines this run ranged. Zero unless asked. */
  productsRanged: number;
  accounting: { accountsCreated: number; taxCodesCreated: number; postingRulesCreated: number };
  /**
   * What still stands between this tenant and a sale, in the shop's words.
   *
   * Empty means the till will open. Non-empty is the honest answer to "why can
   * my cashier not sell", given at provisioning time rather than discovered at
   * the counter — which is the failure this whole module exists to end.
   */
  blockers: string[];
};

export async function provisionRetail(
  options: ProvisionRetailOptions,
): Promise<ProvisionRetailResult> {
  const {
    companyId,
    siteCode = DEFAULT_SITE_CODE,
    siteName = DEFAULT_SITE_NAME,
    registerName = DEFAULT_REGISTER_NAME,
    registerCode = DEFAULT_REGISTER_CODE,
    starterRange = false,
  } = options;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) throw new Error(`No company ${companyId}`);

  /* ── 1. The branch ───────────────────────────────────────────────────── */

  const existingSite = await prisma.site.findFirst({
    where: { companyId, code: siteCode },
    select: { id: true, code: true, name: true },
  });
  const site =
    existingSite ??
    (await prisma.site.create({
      data: { companyId, code: siteCode, name: siteName, isActive: true },
      select: { id: true, code: true, name: true },
    }));

  /* ── 2. Somewhere for the stock to be ────────────────────────────────── */

  const existingLocation = await prisma.stockLocation.findFirst({
    where: { siteId: site.id, code: DEFAULT_LOCATION_CODE },
    select: { id: true, code: true },
  });
  const location =
    existingLocation ??
    (await prisma.stockLocation.create({
      data: {
        siteId: site.id,
        code: DEFAULT_LOCATION_CODE,
        name: DEFAULT_LOCATION_NAME,
        isActive: true,
      },
      select: { id: true, code: true },
    }));

  /* ── 3. The till ─────────────────────────────────────────────────────── */

  const existingRegister = await prisma.retailRegister.findFirst({
    where: { companyId, siteId: site.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, code: true, name: true },
  });
  const register =
    existingRegister ??
    (await prisma.retailRegister.create({
      data: {
        companyId,
        siteId: site.id,
        name: registerName,
        code: registerCode,
        isActive: true,
      },
      select: { id: true, code: true, name: true },
    }));

  /* ── 4. What the POS portal opens on ─────────────────────────────────── */

  /*
    Written only when it is empty. A shop that has since chosen a different
    default register must not have that choice reverted by somebody re-running
    provisioning to fix something else.
  */
  const profile = await getRetailSetupProfile(companyId);
  const setupProfileWritten = !profile.defaultSiteId || !profile.defaultRegisterId;
  if (setupProfileWritten) {
    await saveRetailSetupProfile(companyId, {
      defaultSiteId: profile.defaultSiteId ?? site.id,
      defaultRegisterId: profile.defaultRegisterId ?? register.id,
      defaultRegisterName: profile.defaultRegisterName ?? register.name,
      defaultRegisterCode: profile.defaultRegisterCode ?? register.code,
    });
  }

  /* ── 5. Somewhere for a sale to post ─────────────────────────────────── */

  const accountingSummary = await ensureAccountingDefaults(companyId);
  const accounting = {
    accountsCreated: accountingSummary.createdAccounts,
    taxCodesCreated: accountingSummary.createdTaxCodes,
    postingRulesCreated: accountingSummary.createdPostingRules,
  };

  /* ── 6. A range, only if asked ───────────────────────────────────────── */

  let productsRanged = 0;
  if (starterRange) {
    for (const entry of STARTER_RANGE) {
      const existingItem = await prisma.inventoryItem.findFirst({
        where: { siteId: site.id, itemCode: entry.code },
        select: { id: true },
      });
      if (existingItem) continue;

      const item = await prisma.inventoryItem.create({
        data: {
          itemCode: entry.code,
          name: entry.name,
          category: "CONSUMABLES",
          unit: entry.unit,
          siteId: site.id,
          locationId: location.id,
          // Nothing on the shelf yet. A provisioning step that invented stock
          // would put a figure in the count screen nobody has counted.
          currentStock: 0,
          unitCost: money(entry.cost),
        },
        select: { id: true },
      });

      // The same writer the catalogue screen calls, so a provisioned range and
      // a hand-added line are the same shape — a `Product`, a shelf-list entry,
      // and the stock row claimed by it.
      await upsertShelfListing({
        companyId,
        productId: null,
        sku: entry.code,
        name: entry.name,
        inventoryItemId: item.id,
        unitPrice: money(entry.price),
        taxPercent: percent(VAT_PERCENT),
        isActive: true,
      });
      productsRanged += 1;
    }
  }

  return {
    site: { ...site, created: !existingSite },
    location: { ...location, created: !existingLocation },
    register: { ...register, created: !existingRegister },
    setupProfileWritten,
    productsRanged,
    accounting,
    blockers: await retailTradingBlockers(companyId),
  };
}

/**
 * What stands between a tenant and its first sale.
 *
 * Read back out of the database rather than inferred from what the run above
 * thinks it did, for the reason every migration script in this repo gives:
 * counters are what the code believes, and the catalogue is what is true.
 *
 * Exported on its own because it answers a question worth asking outside
 * provisioning — the setup overview screen asks exactly this, and a support
 * conversation that starts "my cashier cannot sell" should be one function call
 * long.
 */
export async function retailTradingBlockers(companyId: string): Promise<string[]> {
  const blockers: string[] = [];

  const [siteCount, registerCount, locationCount, rangedCount] = await Promise.all([
    prisma.site.count({ where: { companyId, isActive: true } }),
    prisma.retailRegister.count({ where: { companyId, isActive: true } }),
    prisma.stockLocation.count({ where: { site: { companyId }, isActive: true } }),
    prisma.inventoryItem.count({
      where: {
        site: { companyId },
        productId: { not: null },
        product: { isActive: true, archivedAt: null },
      },
    }),
  ]);

  if (siteCount === 0) {
    blockers.push("There is no branch. A shift, a sale and a stock line are all scoped to one.");
  }
  if (registerCount === 0) {
    blockers.push("There is no till. A cashier cannot open a drawer without a register to open it on.");
  }
  if (locationCount === 0) {
    blockers.push("There is nowhere to hold stock. Every stock line needs a location at its branch.");
  }
  if (rangedCount === 0) {
    blockers.push("Nothing is on the shelf. Add a catalogue item and the till has something to ring up.");
  }

  return blockers;
}

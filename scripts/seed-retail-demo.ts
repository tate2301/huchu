/**
 * Seeds a Harare bottle store with staff and half a year of trade.
 *
 *   npx tsx scripts/seed-retail-demo.ts --slug acme
 *   npx tsx scripts/seed-retail-demo.ts --slug acme --days 180 --reset
 *
 * R-5.2 of `docs/retail/retail-hardening-plan-2026-08-12.md`, rewritten for the
 * client demo: a shop that has been trading for months, not a shop that opened
 * this morning. Empty charts and a three-row sales list demonstrate nothing.
 *
 * ## What it builds
 *
 * A liquor store priced in **USD at 15% VAT**, taking **cash, card, EcoCash and
 * ZWG** — the four tenders a Zimbabwean bottle store actually sees — across
 * `--days` of history with a working day-of-week and month-end shape. Staff are
 * real users who can sign in: a manager, two cashiers and a stock clerk, so the
 * shift list has more than one name in it and role gating can be demonstrated
 * rather than described.
 *
 * ## Rows that are wrong on purpose
 *
 * A happy-path seed is how an exception state ships without anybody looking at
 * it. `scripts/seed-payroll-demo.ts` seeds one employee with no BP number for
 * exactly this reason, and that is the part worth copying:
 *
 *   - shifts that came up **short** and shifts that came up **over**
 *   - **Castle Lager 340ml below its reorder point** — the best-selling line, so
 *     the low-stock alert is pointing at something the owner cares about
 *   - a purchase order **part-received**, so `PARTIAL` is a status somebody sees
 *   - **refunds** against posted sales, and a **voided** sale
 *   - a **held cart** nobody came back for
 *   - sales settled **partly in ZWG**, so the dual-currency path is exercised
 *
 * ## Speed
 *
 * Thousands of sales through nested `create` calls is thousands of round trips to
 * a pooled Neon endpoint. Ids are generated here and the rows go in through
 * `createMany` in batches, which turns the whole history into a handful of
 * statements.
 */

import "dotenv/config"

import { randomUUID } from "node:crypto"
import { Prisma, WorkspaceProfile, type RetailTenderType } from "@prisma/client"
import { ID_ENTITY_CONFIG, reserveIdentifier } from "@/lib/id-generator"
import { money, multiplyMoney, quantity, rate, sumMoney, ZERO } from "@/lib/money"
import { prisma } from "@/lib/prisma"
import { CATEGORY_SEEDS, ensureRetailCategories } from "@/lib/retail/categories"
import { saveRetailSetupProfile } from "@/lib/retail/setup-profile"
import { upsertShelfListing } from "@/lib/retail/shelf-listing"
import { tradingDayKey } from "@/lib/retail/z-report"
import {
  auditCashMoved,
  auditRecordEdited,
  auditSalePosted,
  auditShiftOpened,
  RETAIL_AUDIT_EVENTS,
  writeRetailAuditEvent,
} from "@/lib/retail/audit"
import { generateRetailZReportTransaction } from "@/app/api/v2/retail/_services"

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`
  for (let index = 0; index < process.argv.length; index += 1) {
    const argument = process.argv[index]
    if (argument === `--${name}`) return process.argv[index + 1]
    if (argument.startsWith(prefix)) return argument.slice(prefix.length)
  }
  return undefined
}

/**
 * A Harare bottle store's shelf, priced in USD at 15% VAT (20-products 3.5).
 *
 * `sold30` is exactly what the Products list shows under "Sold, 30 days": the
 * last 30 days of history are dealt out of these quotas, so the figure, the
 * Cover bar and the Low stock tab read as the ProductsList board does.
 * `stock` is the on hand the ledger lands on, `min` is "Reorder at" and
 * `reorder` is "Reorder". Low stock is exactly Amarula (6 days of cover),
 * Castle Lager 340ml, Jameson and Johnnie Walker. `weight` is how often the
 * line sold before the window, so older history has the same shape.
 * Bohlinger's sits at Borrowdale; Zambezi and Bols are no longer sold.
 */
type CatalogueEntry = {
  code: string
  name: string
  unit: string
  price: string
  cost: string
  stock: number
  sold30: number
  min: number
  reorder: number
  weight: number
  category: string
  deposit?: string
  archived?: boolean
  site?: "BORROWDALE"
}
const CATALOGUE: CatalogueEntry[] = [
  { code: "AMARULA-750", name: "Amarula Cream 750ml", unit: "bottle", price: "18.25", cost: "13.03", stock: 13, sold30: 64, min: 12, reorder: 24, weight: 64, category: "Spirits" },
  { code: "BERNINI-275", name: "Bernini Blush 275ml", unit: "bottle", price: "1.75", cost: "1.20", stock: 48, sold30: 40, min: 24, reorder: 48, weight: 40, category: "Ciders and coolers" },
  { code: "BOHLINGER-330", name: "Bohlinger’s 330ml", unit: "bottle", price: "1.55", cost: "1.08", stock: 96, sold30: 70, min: 36, reorder: 48, weight: 70, category: "Beer", site: "BORROWDALE" },
  { code: "CASTLE-340", name: "Castle Lager 340ml", unit: "bottle", price: "1.20", cost: "0.86", stock: 26, sold30: 88, min: 96, reorder: 96, weight: 88, category: "Beer", deposit: "0.10" },
  { code: "CASTLE-CASE", name: "Castle Lager case of 24", unit: "case", price: "26.50", cost: "20.10", stock: 22, sold30: 55, min: 8, reorder: 10, weight: 55, category: "Beer" },
  { code: "CHARCOAL-4KG", name: "Charcoal 4kg", unit: "bag", price: "3.90", cost: "2.40", stock: 11, sold30: 20, min: 6, reorder: 12, weight: 20, category: "Snacks" },
  { code: "CHIBUKU-1L", name: "Chibuku Scud 1L", unit: "carton", price: "1.10", cost: "0.82", stock: 210, sold30: 350, min: 60, reorder: 120, weight: 350, category: "Beer" },
  { code: "CHIBUKU-12", name: "Chibuku crate of 12", unit: "crate", price: "12.50", cost: "9.84", stock: 17, sold30: 21, min: 4, reorder: 6, weight: 21, category: "Beer" },
  { code: "COKE-500", name: "Coca-Cola 500ml", unit: "bottle", price: "0.75", cost: "0.52", stock: 180, sold30: 216, min: 48, reorder: 96, weight: 216, category: "Soft drinks" },
  { code: "COKE-6PK", name: "Coke 500ml six-pack", unit: "pack", price: "4.20", cost: "3.12", stock: 30, sold30: 36, min: 6, reorder: 12, weight: 36, category: "Soft drinks" },
  { code: "GORDONS-750", name: "Gordon’s Gin 750ml", unit: "bottle", price: "16.40", cost: "12.40", stock: 18, sold30: 67, min: 6, reorder: 12, weight: 67, category: "Spirits" },
  { code: "HUNTERS-330", name: "Hunter’s Gold 330ml", unit: "bottle", price: "1.85", cost: "1.31", stock: 60, sold30: 50, min: 24, reorder: 48, weight: 50, category: "Ciders and coolers" },
  { code: "ICE-2KG", name: "Ice 2kg bag", unit: "bag", price: "1.50", cost: "1.00", stock: 40, sold30: 86, min: 20, reorder: 40, weight: 86, category: "Ice and mixers" },
  { code: "JAMESON-750", name: "Jameson Irish Whiskey 750ml", unit: "bottle", price: "27.90", cost: "22.15", stock: 9, sold30: 121, min: 12, reorder: 12, weight: 121, category: "Spirits" },
  { code: "BLKLABEL-750", name: "Johnnie Walker Black 750ml", unit: "bottle", price: "42.00", cost: "33.60", stock: 6, sold30: 58, min: 12, reorder: 12, weight: 58, category: "Spirits" },
  { code: "NEDERBURG-750", name: "Nederburg Cabernet 750ml", unit: "bottle", price: "12.60", cost: "9.40", stock: 24, sold30: 20, min: 8, reorder: 12, weight: 20, category: "Wine" },
  { code: "SAVANNA-330", name: "Savanna Dry 330ml", unit: "bottle", price: "1.85", cost: "1.38", stock: 72, sold30: 45, min: 24, reorder: 48, weight: 45, category: "Ciders and coolers" },
  { code: "TONIC-200", name: "Schweppes Tonic 200ml", unit: "can", price: "0.60", cost: "0.38", stock: 96, sold30: 40, min: 24, reorder: 48, weight: 40, category: "Ice and mixers" },
  { code: "TWOKEYS-750", name: "Two Keys Whisky 750ml", unit: "bottle", price: "9.75", cost: "7.10", stock: 28, sold30: 30, min: 12, reorder: 12, weight: 30, category: "Spirits" },
  { code: "ZAMBEZI-375", name: "Zambezi Lager 375ml", unit: "bottle", price: "1.35", cost: "0.95", stock: 144, sold30: 0, min: 48, reorder: 48, weight: 40, category: "Beer", deposit: "0.10", archived: true },
  { code: "BOLS-750", name: "Bols Brandy 750ml", unit: "bottle", price: "14.20", cost: "11.22", stock: 6, sold30: 0, min: 6, reorder: 6, weight: 6, category: "Spirits", archived: true },
]

/** The cases: what each opens into and how many (W-12's packs). */
const PACKS: Array<[pack: string, single: string, size: number]> = [
  ["CASTLE-CASE", "CASTLE-340", 24],
  ["CHIBUKU-12", "CHIBUKU-1L", 12],
  ["COKE-6PK", "COKE-500", 6],
]

const VAT_PERCENT = "15.00"

/**
 * The ex-VAT amount inside a VAT-inclusive figure.
 *
 * The same arithmetic as `netOfInclusiveTax` in `lib/retail/checkout.ts`, and
 * deliberately the same shape: net is the division rounded to the cent, and the
 * VAT is the *remainder* rather than a second rounded multiplication, so the
 * two halves always add back to the price on the shelf. $1.20 at 15% inclusive
 * is $1.04 + $0.16.
 *
 * Seeded history that did not agree with the till on this would be worse than
 * useless — it is the baseline every report compares against.
 */
function netOfInclusiveTax(gross: Prisma.Decimal, taxPercent: string) {
  const rateValue = money(taxPercent)
  if (rateValue.lte(0)) return money(gross)
  return money(gross.div(rateValue.div(100).plus(1)))
}

/**
 * Staff who can sign in. A bottle store is not run by one superadmin, and the
 * whole point of the role gates is that a cashier is not a manager.
 */
const STAFF = [
  { email: "tafara.manager@bottlestore.test", name: "Tafara Nyathi", role: "MANAGER" as const, cashier: true },
  { email: "chipo.till@bottlestore.test", name: "Chipo Dube", role: "CASHIER" as const, cashier: true },
  { email: "farai.till@bottlestore.test", name: "Farai Moyo", role: "CASHIER" as const, cashier: true },
  { email: "tendai.stock@bottlestore.test", name: "Tendai Sibanda", role: "STOCK_CLERK" as const, cashier: false },
  // The bookkeeper (98-decisions C-40): reads the shop and keeps the books.
  { email: "bookkeeper@bottlestore.test", name: "Ruvimbo Chari", role: "FINANCE_OFFICER" as const, cashier: false },
]

const STAFF_PASSWORD = "RetailDemo123!"

/** Regulars who run a tab or collect loyalty. */
/**
 * Why a sale gets voided at a bottle store.
 *
 * Short, and the sort of thing a cashier actually types. A void reason nobody
 * would write makes the screen that shows it look like a fixture.
 */
const VOID_REASONS = [
  "Mis-ring - wrong size",
  "Customer changed their mind",
  "Rang up twice",
  "Wrong price keyed",
  "Card declined, customer left",
]

const CUSTOMERS = [
  "Rudo Chirwa", "Blessing Ncube", "Tapiwa Marange", "Nyasha Gwenzi",
  "Simba Mutasa", "Kudzai Zhou", "Munashe Chari", "Rutendo Banda",
]

const ZWG_RATE = "27.5000"

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

/** A wall-clock time in Harare (UTC+2, no summer time), `daysBack` days before today. */
function harareTime(daysBack: number, hour: number, minute: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare" }).format(new Date())
  const midnight = Date.parse(`${today}T00:00:00+02:00`)
  return new Date(midnight - daysBack * 24 * 60 * 60 * 1000 + (hour * 60 + minute) * 60 * 1000)
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function between(low: number, high: number) {
  return low + Math.floor(Math.random() * (high - low + 1))
}

/** Weighted pick, so the top-sellers chart reflects a bottle store. */
function pickProduct() {
  const total = CATALOGUE.reduce((sum, item) => sum + item.weight, 0)
  let roll = Math.random() * total
  for (const item of CATALOGUE) {
    roll -= item.weight
    if (roll <= 0) return item
  }
  return CATALOGUE[0]!
}

/**
 * The last 30 days' sales, dealt so each product's "Sold, 30 days" lands on
 * its `sold30` exactly. Every product's quota is cut into a line's worth (one
 * unit, or up to three of the fast movers) and shuffled; each sale in the
 * window takes its share of what is left, and the last takes the rest. A
 * refund or void in the window puts its units back to be sold again, so the
 * net is still the quota.
 */
class WindowQuota {
  private chunks: Array<{ code: string; units: number }> = []
  constructor(entries: CatalogueEntry[]) {
    for (const entry of entries) {
      let left = entry.archived ? 0 : entry.sold30
      while (left > 0) {
        const units = Math.min(left, entry.sold30 >= 200 ? between(1, 3) : 1)
        this.chunks.push({ code: entry.code, units })
        left -= units
      }
    }
    this.shuffle()
  }
  private shuffle() {
    for (let index = this.chunks.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1))
      ;[this.chunks[index], this.chunks[other]] = [this.chunks[other]!, this.chunks[index]!]
    }
  }
  /** Put units back (a refund or a void in the window). */
  giveBack(code: string, units: number) {
    if (units > 0) this.chunks.push({ code, units })
  }
  /** One sale's lines, `salesLeft` counting this one. */
  take(salesLeft: number): Array<{ code: string; units: number }> {
    if (this.chunks.length === 0) return []
    if (salesLeft <= 1) return this.merge(this.chunks.splice(0))
    const share = this.chunks.length / salesLeft
    const count = Math.floor(share) + (Math.random() < share - Math.floor(share) ? 1 : 0)
    return this.merge(this.chunks.splice(0, count))
  }
  /** One line per product on a sale. */
  private merge(chunks: Array<{ code: string; units: number }>) {
    const byCode = new Map<string, number>()
    for (const chunk of chunks) byCode.set(chunk.code, (byCode.get(chunk.code) ?? 0) + chunk.units)
    return [...byCode].map(([code, units]) => ({ code, units }))
  }
  get left() {
    return this.chunks.reduce((sum, chunk) => sum + chunk.units, 0)
  }
}

/**
 * How busy a given day is. Friday and Saturday carry a bottle store, and the
 * week after payday carries the month.
 */
function dayBusyness(date: Date) {
  const day = date.getUTCDay()
  const dayOfMonth = date.getUTCDate()
  let factor = 1
  if (day === 5) factor *= 1.8
  else if (day === 6) factor *= 2.1
  else if (day === 0) factor *= 1.3
  else if (day === 1 || day === 2) factor *= 0.7
  // Payday is the 25th in most Zimbabwean workplaces; the days after it show.
  if (dayOfMonth >= 25 || dayOfMonth <= 2) factor *= 1.5
  return factor
}

async function main() {
  const slug = (readArg("slug") ?? "acme").trim().toLowerCase()
  const days = Math.max(1, Math.min(Number(readArg("days") ?? "180"), 540))
  const reset = process.argv.includes("--reset")

  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to seed.")
  }

  const company = await prisma.company.findUnique({
    where: { slug },
    select: { id: true, name: true },
  })
  if (!company) {
    throw new Error(`No company with slug "${slug}". Run scripts/seed-staging-tenant.ts first.`)
  }
  const companyId = company.id

  /*
    Say what this tenant *is*. `Company.workspaceProfile` defaults to GENERAL,
    and a GENERAL tenant falls through to inference — which, on a demo tenant
    with the whole product switched on, has nothing to go on. Before this, the
    workspace switcher read "Retail" above every screen of every vertical.
  */
  await prisma.company.update({
    where: { id: companyId },
  /*
    The Prisma-level name, not the generated constant.

    `RETAIL` is `@map("THRIFT")` in the database — the profile predates the
    rename and the column still holds the old label. Under Prisma 7 the
    generated `WorkspaceProfile.RETAIL` constant carries the *mapped* value
    ("THRIFT"), which the query API then rejects: it validates against the
    schema name. Passing the constant fails at runtime with "Invalid value for
    argument `workspaceProfile`". `scripts/demo-focus.ts` writes the name for
    the same reason.
  */
    data: { workspaceProfile: "RETAIL" as WorkspaceProfile },
  })

  /*
    The company's names and numbers (the Company settings board, shown on
    Setup › Shop and changed in Management's branding). The rail's logo tile
    is drawn from the legal name: "Hurudza Creative (Private) Limited" is "HC"
    (00-foundations 5.3.2). No logo: the board draws the empty drop zone.
  */
  const businessDetails = {
    legalName: "Hurudza Creative (Private) Limited",
    tradingName: "Harare Bottle Store",
    registrationNumber: "4471/2019",
    vatNumber: "10023881",
    taxNumber: "200118844",
    phone: "+263 24 270 5521",
    email: "hello@hararebottlestore.co.zw",
    physicalAddress: "14 Samora Machel Avenue, Harare",
  }
  await prisma.companyBranding.upsert({
    where: { companyId },
    update: businessDetails,
    create: { companyId, ...businessDetails },
  })
  // SET-01: Setup › Shop's Money — prices in US$, the year from January; the
  // fiscal signer reads the VAT number from here.
  const shopMoney = { vatNumber: "10023881", taxNumber: "2000118844", baseCurrency: "USD", fiscalYearStartMonth: 1 }
  await prisma.accountingSettings.upsert({ where: { companyId }, update: shopMoney, create: { companyId, ...shopMoney } })

  console.log(`Seeding ${days} days of trade into ${company.name} (${slug})`)

  // ── Staff ────────────────────────────────────────────────────────────────
  const bcrypt = await import("bcryptjs")
  const passwordHash = await bcrypt.hash(STAFF_PASSWORD, 10)
  const staff: Array<{ id: string; name: string; cashier: boolean }> = []
  for (const person of STAFF) {
    const user = await prisma.user.upsert({
      where: { email: person.email },
      update: { name: person.name, role: person.role, companyId, isActive: true },
      create: {
        email: person.email,
        name: person.name,
        role: person.role,
        companyId,
        password: passwordHash,
        isActive: true,
      },
      select: { id: true, name: true },
    })
    staff.push({ id: user.id, name: user.name ?? person.name, cashier: person.cashier })
  }
  const tills = staff.filter((person) => person.cashier)
  console.log(`  ${staff.length} staff (password ${STAFF_PASSWORD})`)

  // ── Site, register, stock, catalogue ─────────────────────────────────────
  // Two branches: Harare Main Branch, where both tills are, and Borrowdale.
  async function branch(code: string, name: string, location: string) {
    const found = await prisma.site.findFirst({ where: { companyId, code }, select: { id: true } })
    return found
      ? prisma.site.update({ where: { id: found.id }, data: { name } })
      : prisma.site.create({ data: { companyId, code, name, location } })
  }
  const site = await branch("MAIN", "Harare Main Branch", "Harare CBD")
  const borrowdale = await branch("BORROWDALE", "Borrowdale", "Borrowdale, Harare")

  const location =
    (await prisma.stockLocation.findFirst({ where: { siteId: site.id, code: "SHOP" } })) ??
    (await prisma.stockLocation.create({
      data: { siteId: site.id, code: "SHOP", name: "Shop floor" },
    }))

  const register = await prisma.retailRegister.upsert({
    where: { companyId_code: { companyId, code: "TILL-1" } },
    update: { name: "Front till", siteId: site.id, isActive: true },
    create: { companyId, code: "TILL-1", name: "Front till", siteId: site.id },
  })
  const backRegister = await prisma.retailRegister.upsert({
    where: { companyId_code: { companyId, code: "TILL-2" } },
    update: { name: "Back till", siteId: site.id, isActive: true },
    create: { companyId, code: "TILL-2", name: "Back till", siteId: site.id },
  })

  /**
   * Point the shop at the branch and till this script just made.
   *
   * The seed created both and then never said which one is the default, so
   * `getRetailSetupProfile` returned nulls and the till's own settings screen
   * read back "Branch: Not set · Register: Not set" on a shop with exactly one
   * of each. Every surface that falls back to the default site — the till when
   * no shift is open, price check, the settings screen — was working off
   * nothing.
   */
  await saveRetailSetupProfile(companyId, {
    defaultRegisterId: register.id,
    defaultRegisterName: register.name,
    defaultRegisterCode: register.code,
  })

  /*
    A liquor store, with every liquor feature on: the till asks for ID, stops
    selling alcohol outside licence hours, charges deposits on returnable
    bottles and sells cases and singles. Its categories are the liquor set,
    and every line below is filed under one.
  */
  const liquorStore = {
    businessType: "LIQUOR" as const,
    ageCheck: true,
    licenceHours: true,
    emptiesAndDeposits: true,
    casesAndSingles: true,
    weekdayOpensAt: "08:00",
    weekdayClosesAt: "22:00",
    sundayOpensAt: "10:00",
    sundayClosesAt: "18:00",
    licenceNumber: "HRE/BL/2024/0711",
    licenceExpiresOn: new Date("2026-12-31T00:00:00.000Z"),
    // SET-01: the shop's WhatsApp, registered for VAT, and Harare Main Branch as the default site.
    whatsapp: "+263 77 412 0098",
    vatRegistered: true,
    defaultSiteId: site.id,
  }
  await prisma.retailShopProfile.upsert({
    where: { companyId },
    update: liquorStore,
    create: { companyId, ...liquorStore },
  })
  await ensureRetailCategories(prisma, companyId, "LIQUOR")
  await seedCategories(companyId, reset)
  await seedShopSettingsSave(companyId)
  const categoryIds = new Map(
    (await prisma.retailCategory.findMany({ where: { companyId }, select: { id: true, name: true } })).map(
      (row) => [row.name, row.id],
    ),
  )

  type Stocked = { inventoryItemId: string; productId: string; unit: string }
  const stocked = new Map<string, Stocked>()

  const borrowdaleLocation =
    (await prisma.stockLocation.findFirst({ where: { siteId: borrowdale.id, code: "SHOP" } })) ??
    (await prisma.stockLocation.create({
      data: { siteId: borrowdale.id, code: "SHOP", name: "Shop floor" },
    }))

  for (const entry of CATALOGUE) {
    const home = entry.site === "BORROWDALE" ? { siteId: borrowdale.id, locationId: borrowdaleLocation.id } : { siteId: site.id, locationId: location.id }
    // The line at its home site, or the same line moved there from the other branch.
    const existing =
      (await prisma.inventoryItem.findFirst({ where: { siteId: home.siteId, itemCode: entry.code }, select: { id: true } })) ??
      (await prisma.inventoryItem.findFirst({
        where: { site: { companyId }, itemCode: entry.code },
        select: { id: true },
      }))
    const levels = {
      name: entry.name,
      unit: entry.unit,
      ...home,
      currentStock: entry.stock,
      minStock: entry.min,
      reorderQty: entry.reorder,
      unitCost: Number(entry.cost),
    }
    const item = existing
      ? await prisma.inventoryItem.update({ where: { id: existing.id }, data: levels, select: { id: true, unit: true } })
      : await prisma.inventoryItem.create({
          data: { itemCode: entry.code, category: "OTHER", ...levels },
          select: { id: true, unit: true },
        })

    /*
      Ranged through the one writer, not by hand.

      S-4. This block used to upsert a `RetailCatalogItem` — a second item
      master the till stopped reading at S-4b, which left this seed building a
      tenant whose shelves were empty on every surface that matters.
      `upsertShelfListing` is what the back-office catalogue screen calls, so
      the demo tenant is now assembled by exactly the path a shopkeeper's own
      first morning goes through: a `Product`, a "Shelf prices" entry against
      it, and the site's `InventoryItem` claimed by it.
    */
    const productId = await upsertShelfListing({
      companyId,
      productId: null,
      sku: entry.code,
      name: entry.name,
      inventoryItemId: item.id,
      unitPrice: money(entry.price),
      taxPercent: money(VAT_PERCENT),
      barcode: `600${String(Math.abs(hashCode(entry.code))).padStart(9, "0").slice(0, 9)}`,
      // Zambezi and Bols are archived: off every till, their stock kept.
      isActive: !entry.archived,
      categoryId: categoryIds.get(entry.category) ?? null,
      costPrice: money(entry.cost),
      returnable: Boolean(entry.deposit),
      depositAmount: entry.deposit ? money(entry.deposit) : null,
    })
    // Out of the bin, if a run before this one left it there.
    await prisma.product.updateMany({ where: { id: productId, archivedAt: { not: null } }, data: { archivedAt: null } })

    stocked.set(entry.code, {
      inventoryItemId: item.id,
      productId,
      unit: item.unit,
    })
  }
  // The cases open into the singles: one Castle case is 24 × 340ml.
  for (const [pack, single, size] of PACKS) {
    await prisma.product.update({
      where: { id: stocked.get(pack)!.productId },
      data: { packOfId: stocked.get(single)!.productId, packSize: size },
    })
  }
  /*
    The range is exactly the catalogue. Anything else ranged on this tenant —
    a product a test run added by hand — goes to the bin with --reset, so the
    tabs read Selling 19 · Low stock 4 · Archived 2 · All 21.
  */
  if (reset) {
    const strays = await prisma.product.updateMany({
      where: {
        companyId,
        archivedAt: null,
        code: { notIn: CATALOGUE.map((entry) => entry.code) },
        inventoryItems: { some: {} },
      },
      data: { archivedAt: new Date() },
    })
    if (strays.count) console.log(`  ${strays.count} product(s) not in the catalogue moved to the bin`)
  }
  console.log(`  ${CATALOGUE.length} lines on the shelf (4 low, 2 archived, Bohlinger’s at Borrowdale)`)

  // ── Customers ────────────────────────────────────────────────────────────
  for (const name of CUSTOMERS) {
    const existing = await prisma.customer.findFirst({
      where: { companyId, name },
      select: { id: true },
    })
    if (!existing) {
      await prisma.customer.create({ data: { companyId, name, isActive: true } })
    }
  }

  // ── Promotions ───────────────────────────────────────────────────────────
  await prisma.retailPromotion.upsert({
    where: { companyId_promoCode: { companyId, promoCode: "PROMO-CASE" } },
    update: { status: "ACTIVE" },
    create: {
      companyId,
      promoCode: "PROMO-CASE",
      name: "Case of Castle — 5% off",
      type: "PERCENT",
      value: money("5.00"),
      status: "ACTIVE",
      startsAt: daysAgo(30),
      endsAt: daysAgo(-30),
    },
  })
  await prisma.retailPromotion.upsert({
    where: { companyId_promoCode: { companyId, promoCode: "PROMO-FESTIVE" } },
    update: { status: "SCHEDULED" },
    create: {
      companyId,
      promoCode: "PROMO-FESTIVE",
      name: "Festive season $2 off spirits",
      type: "AMOUNT",
      value: money("2.00"),
      status: "SCHEDULED",
      startsAt: daysAgo(-20),
    },
  })

  if (reset) {
    // Only the trading history, never the shelf or the staff. A reset that wiped
    // the catalogue would take the demo's barcodes with it.
    const sales = await prisma.retailSale.findMany({ where: { companyId }, select: { id: true } })
    const saleIds = sales.map((sale) => sale.id)
    await prisma.retailSalePayment.deleteMany({ where: { saleId: { in: saleIds } } })
    await prisma.retailSaleLine.deleteMany({ where: { saleId: { in: saleIds } } })
    await prisma.retailSale.deleteMany({ where: { companyId } })
    await prisma.retailHeldCart.deleteMany({ where: { companyId } })
    // The days' Z-reports were taken over the history being replaced.
    await prisma.retailZReport.deleteMany({ where: { companyId } })
    await prisma.retailShift.deleteMany({ where: { companyId } })
    // The next shift number is worked out again from the history written below
    // (SH-<n> after the last seeded one), not from the run before.
    await prisma.idSequence.deleteMany({ where: { companyId, entityKey: "RETAIL_SHIFT" } })
    console.log(`  reset: cleared ${saleIds.length} previous sale(s) and their shifts`)
  }

  // ── The history ──────────────────────────────────────────────────────────
  type ShiftRow = Prisma.RetailShiftCreateManyInput
  type SaleRow = Prisma.RetailSaleCreateManyInput
  type LineRow = Prisma.RetailSaleLineCreateManyInput
  type PaymentRow = Prisma.RetailSalePaymentCreateManyInput

  const shiftRows: ShiftRow[] = []
  const saleRows: SaleRow[] = []
  const lineRows: LineRow[] = []
  const paymentRows: PaymentRow[] = []

  let saleSeq = 0
  let refunds = 0
  let voids = 0
  let zwgSales = 0

  /*
    FND 3.4. Two shifts a day for the whole history: the Front till in the
    morning and the Back till in the evening, about seven hours each, run by
    Chipo Dube, Farai Moyo and Tafara Nyathi. Two are still open at the run:
    the Front till, Chipo Dube, since 07:58 today, and the Back till, Farai
    Moyo, opened 52 hours ago and never closed — the stale drawer the list
    flags in amber, which is why the Back till has nothing after it. Shift
    numbers follow the opening times, so the Front till's open shift has the
    highest.
  */
  const now = new Date()
  const HOUR_MS = 60 * 60 * 1000
  const staffNamed = (name: string) => tills.find((person) => person.name === name) ?? tills[0]!
  const staleOpenedAt = new Date(now.getTime() - 52 * HOUR_MS)
  const frontToday = harareTime(0, 7, 58)
  type Slot = {
    register: typeof register
    openedAt: Date
    open: boolean
    cashier: (typeof tills)[number]
    float: string
  }
  const slots: Slot[] = []
  for (let dayOffset = days; dayOffset >= 0; dayOffset -= 1) {
    if (dayOffset === 0) {
      slots.push({
        register,
        openedAt: frontToday.getTime() < now.getTime() ? frontToday : new Date(now.getTime() - HOUR_MS),
        open: true,
        cashier: staffNamed("Chipo Dube"),
        float: "200.00",
      })
    } else {
      slots.push({ register, openedAt: harareTime(dayOffset, 7, between(48, 70)), open: false, cashier: pick(tills), float: "100.00" })
    }
    const back = harareTime(dayOffset, 15, between(0, 20))
    if (back.getTime() + 7 * HOUR_MS < staleOpenedAt.getTime()) {
      slots.push({ register: backRegister, openedAt: back, open: false, cashier: pick(tills), float: "100.00" })
    }
  }
  slots.push({ register: backRegister, openedAt: staleOpenedAt, open: true, cashier: staffNamed("Farai Moyo"), float: "100.00" })
  slots.sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime())

  // Three closed without a count (about a week, a month and three months ago).
  const closedSlots = slots.filter((slot) => !slot.open)
  const uncounted = new Set(
    [14, 61, 180].map((back) => closedSlots[closedSlots.length - back]).filter((slot): slot is Slot => Boolean(slot)),
  )
  /*
    The counted drawers' differences: one in fourteen short (−US$0.50 to
    −US$12.00), one in twenty over — small change mostly, and one drawer a
    month and a half ago US$42.80 over — and the rest balanced. Exact counts
    rather than dice, so the history always nets short, as a till does.
  */
  const counted = closedSlots.filter((slot) => !uncounted.has(slot))
  const shuffled = [...counted]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!]
  }
  const shortCount = Math.round(counted.length / 14)
  const overCount = Math.round(counted.length / 20)
  const differences = new Map<Slot, Prisma.Decimal>()
  shuffled.slice(0, shortCount).forEach((slot) => differences.set(slot, money(String(-(between(50, 1200) / 100)))))
  shuffled.slice(shortCount, shortCount + overCount).forEach((slot) => differences.set(slot, money(String(between(50, 400) / 100))))
  const bigOver = counted[counted.length - 90]
  if (bigOver) differences.set(bigOver, money("42.80"))

  /*
    PRD-01. Each shift's sale times, planned before any is written, so the
    last 30 days know how many sales they hold and can deal each product's
    `sold30` across them exactly (`WindowQuota`). The six hours after the
    window opens carry no sale: the list counts the 30 days before it is
    read, so for six hours after a run nothing slides out of the window.
  */
  const windowOpens = now.getTime() - 30 * DAY_MS
  const windowCounts = windowOpens + 6 * HOUR_MS
  const salePlans = slots.map((slot) => {
    const count = Math.max(3, Math.round(between(9, 17) * dayBusyness(slot.openedAt)))
    return Array.from(
      { length: count },
      (_, saleIndex) => new Date(slot.openedAt.getTime() + between(5, 6 * 60) * 60 * 1000 + saleIndex * 1000),
    ).filter((postedAt) => {
      const at = postedAt.getTime()
      return at <= now.getTime() && !(at >= windowOpens && at < windowCounts)
    })
  })
  let windowSalesLeft = salePlans.flat().filter((postedAt) => postedAt.getTime() >= windowCounts).length
  const quota = new WindowQuota(CATALOGUE)
  const byCode = new Map(CATALOGUE.map((entry) => [entry.code, entry]))
  const codeOfProduct = new Map([...stocked].map(([code, line]) => [line.productId, code]))

  for (const [slotIndex, slot] of slots.entries()) {
    {
      const cashier = slot.cashier
      const openedAt = slot.openedAt
      const isOpenShift = slot.open
      const closedAt = isOpenShift ? null : new Date(openedAt.getTime() + (7 * 60 + between(-4, 5)) * 60 * 1000)

      const shiftId = randomUUID()
      const shiftNo = `SH-${String(slotIndex + 1).padStart(5, "0")}`
      const openingFloat = money(slot.float)

      let cashTaken = money(0)

      for (const postedAt of salePlans[slotIndex]!) {
        saleSeq += 1
        const saleId = randomUUID()
        const inWindow = postedAt.getTime() >= windowCounts

        // In the window, this sale's share of the quotas; before it, a weighted pick.
        const picks = inWindow
          ? quota.take(windowSalesLeft--)
          : Array.from({ length: between(1, 2) }, () => {
              const product = pickProduct()
              return { code: product.code, units: product.weight >= 200 ? between(1, 3) : 1 }
            })
        const lines: LineRow[] = []
        for (const pickedLine of picks) {
          const product = byCode.get(pickedLine.code)!
          const target = stocked.get(product.code)
          if (!target) continue
          const quantity = rate(String(pickedLine.units))
          // The shelf price is what the customer hands over, so the VAT comes
          // *out of* it rather than being added on top. A Castle marked $1.20
          // costs $1.20 at the counter; charging $1.38 for a $1.20 tag is not
          // something a Harare bottle store does, and it is not what a ZIMRA
          // receipt shows either.
          //
          // This seed used to add the 15%, which made a $1.20 tag ring up at
          // $1.38. Once core's shelf list was marked tax-inclusive, the same
          // number started meaning the right thing and six months of history
          // was left quoting the other convention — a 13% step in the takings
          // on the day the shop starts trading, with nothing to explain it.
          const grossAmount = multiplyMoney(quantity, product.price)
          const netAmount = netOfInclusiveTax(grossAmount, VAT_PERCENT)
          const taxAmount = grossAmount.minus(netAmount)
          lines.push({
            id: randomUUID(),
            companyId,
            saleId,
            inventoryItemId: target.inventoryItemId,
            productId: target.productId,
            itemName: product.name,
            quantity,
            unitPrice: money(product.price),
            discountAmount: money(0),
            taxAmount,
            lineTotal: grossAmount,
            costUnit: money(product.cost),
            costTotal: multiplyMoney(quantity, product.cost),
            createdAt: postedAt,
          })
        }
        if (lines.length === 0) continue

        // Revenue before tax. On a tax-inclusive list that is the ex-VAT value
        // of the shelf prices, not the shelf prices themselves — the same basis
        // `calculateRetailCheckout` posts, so that
        // `subtotal + taxAmount === totalAmount` holds and the ledger's
        // net/tax/gross triple agrees with the receipt.
        const subtotal = sumMoney(
          lines.map((line) =>
            money(line.lineTotal as Prisma.Decimal).minus(line.taxAmount as Prisma.Decimal),
          ),
        )
        const taxAmount = sumMoney(lines.map((line) => line.taxAmount as Prisma.Decimal))
        const totalAmount = sumMoney(lines.map((line) => line.lineTotal as Prisma.Decimal))

        // About one sale in twelve is settled in ZWG. The sale is still priced in
        // USD — that is how a bottle store quotes — so the rate and the base
        // amount are what make the drawer reconcile.
        const inZwg = Math.random() < 0.08
        const currency = inZwg ? "ZWG" : "USD"
        const exchangeRate = inZwg ? rate(ZWG_RATE) : rate("1")
        const baseAmount = inZwg ? money(totalAmount.div(rate(ZWG_RATE))) : totalAmount
        if (inZwg) zwgSales += 1

        const roll = Math.random()
        const tender: RetailTenderType = inZwg
          ? "CASH"
          : roll < 0.5
            ? "CASH"
            : roll < 0.74
              ? "MOBILE_MONEY"
              : roll < 0.92
                ? "CARD"
                : "TRANSFER"

        const named = Math.random() < 0.22
        saleRows.push({
          id: saleId,
          companyId,
          saleNo: `S-${String(saleSeq).padStart(6, "0")}`,
          shiftId,
          siteId: site.id,
          cashierId: cashier.id,
          cashierName: cashier.name,
          customerName: named ? pick(CUSTOMERS) : null,
          saleType: "SALE",
          status: "POSTED",
          subtotal,
          discountAmount: money(0),
          taxAmount,
          totalAmount,
          tenderedAmount: totalAmount,
          changeAmount: money(0),
          currency,
          exchangeRate,
          baseAmount,
          postedAt,
          createdAt: postedAt,
          updatedAt: postedAt,
        })
        lineRows.push(...lines)
        paymentRows.push({
          id: randomUUID(),
          companyId,
          saleId,
          tenderType: tender,
          amount: totalAmount,
          currency,
          exchangeRate,
          baseAmount,
          reference: tender === "MOBILE_MONEY" ? `EC${between(100000, 999999)}` : null,
          createdAt: postedAt,
        })
        if (tender === "CASH") cashTaken = cashTaken.plus(baseAmount)

        // A refund every so often, against the sale just posted. Never one
        // landing in the window's quiet first hours; one inside the window
        // puts its units back to be sold again, so the quotas still net out.
        const refundAt = postedAt.getTime() + 20 * 60 * 1000
        if (Math.random() < 0.02 && !isOpenShift && !(refundAt >= windowOpens && refundAt < windowCounts)) {
          saleSeq += 1
          refunds += 1
          const refundId = randomUUID()
          const refundedAt = new Date(refundAt)
          const source = lines[0]!
          if (refundAt >= windowCounts) quota.giveBack(codeOfProduct.get(source.productId as string)!, Number(source.quantity))
          saleRows.push({
            id: refundId,
            companyId,
            saleNo: `S-${String(saleSeq).padStart(6, "0")}`,
            shiftId,
            sourceSaleId: saleId,
            siteId: site.id,
            cashierId: cashier.id,
            cashierName: cashier.name,
            saleType: "REFUND",
            status: "POSTED",
            subtotal: multiplyMoney(
              source.quantity as Prisma.Decimal,
              source.unitPrice as Prisma.Decimal,
            ).negated(),
            discountAmount: money(0),
            taxAmount: money(source.taxAmount as Prisma.Decimal).negated(),
            totalAmount: money(source.lineTotal as Prisma.Decimal).negated(),
            tenderedAmount: money(source.lineTotal as Prisma.Decimal).negated(),
            changeAmount: money(0),
            currency: "USD",
            exchangeRate: rate("1"),
            baseAmount: money(source.lineTotal as Prisma.Decimal).negated(),
            overrideReason: pick([
              "Bottle returned unopened",
              "Wrong item rung up",
              "Customer changed their mind",
            ]),
            postedAt: refundedAt,
            createdAt: refundedAt,
            updatedAt: refundedAt,
          })
          lineRows.push({
            id: randomUUID(),
            companyId,
            saleId: refundId,
            sourceLineId: source.id as string,
            inventoryItemId: source.inventoryItemId,
            productId: source.productId as string | null,
            itemName: source.itemName,
            quantity: money(source.quantity as Prisma.Decimal).negated(),
            unitPrice: source.unitPrice,
            discountAmount: money(0),
            taxAmount: money(source.taxAmount as Prisma.Decimal).negated(),
            lineTotal: money(source.lineTotal as Prisma.Decimal).negated(),
            costUnit: source.costUnit,
            costTotal: money(source.costTotal as Prisma.Decimal).negated(),
            createdAt: refundedAt,
          })
          paymentRows.push({
            id: randomUUID(),
            companyId,
            saleId: refundId,
            tenderType: "CASH",
            amount: money(source.lineTotal as Prisma.Decimal).negated(),
            currency: "USD",
            exchangeRate: rate("1"),
            baseAmount: money(source.lineTotal as Prisma.Decimal).negated(),
            reference: null,
            createdAt: refundedAt,
          })
          cashTaken = cashTaken.minus(money(source.lineTotal as Prisma.Decimal))
        }
      }

      /*
        A voided sale now and then — a mis-ring the cashier caught.

        This used to increment `voids` and stop there, so the count in the
        summary line said "3 void(s) flagged" while every one of the 5,158
        seeded sales sat at POSTED. The docstring at the top of this file
        promised a voided sale, the e2e suite asked for one
        ("there should be a voided sale") and found none, and nothing in
        between noticed — the same failure mode as the gold `companyId` bug,
        where the seed reports success and the row is simply not there.

        `RetailSale` has no `voidedAt`/`voidedById`; a void is `status` plus
        `voidReason`, so that is what this writes. Refunds are skipped — a
        refund is its own sale (`saleType: REFUND`) and voiding one would mean
        something different and confusing on the Z-report.
      */
      if (Math.random() < 0.06 && !isOpenShift) {
        const candidate = [...saleRows]
          .reverse()
          .find(
            (row) =>
              row.shiftId === shiftId &&
              row.saleType === "SALE" &&
              row.status === "POSTED" &&
              !saleRows.some((other) => other.sourceSaleId === row.id),
          )

        if (candidate) {
          candidate.status = "VOIDED"
          candidate.voidReason = pick(VOID_REASONS)
          voids += 1
          // A voided sale in the window sold nothing: its units go back.
          if ((candidate.postedAt as Date).getTime() >= windowCounts) {
            for (const line of lineRows.filter((row) => row.saleId === candidate.id)) {
              quota.giveBack(codeOfProduct.get(line.productId as string)!, Number(line.quantity))
            }
          }
        }
      }

      const expectedCash = openingFloat.plus(cashTaken)
      const varianceAmount = differences.get(slot) ?? money(0)
      const wasCounted = Boolean(closedAt) && !uncounted.has(slot)

      shiftRows.push({
        id: shiftId,
        companyId,
        shiftNo,
        registerCode: slot.register.code,
        registerName: slot.register.name,
        siteId: site.id,
        cashierId: cashier.id,
        cashierName: cashier.name,
        openingFloat,
        expectedCash,
        countedCash: wasCounted ? expectedCash.plus(varianceAmount) : null,
        variance: wasCounted ? varianceAmount : null,
        status: closedAt ? "CLOSED" : "OPEN",
        openedAt,
        closedAt,
        createdAt: openedAt,
        updatedAt: closedAt ?? openedAt,
      })
    }
  }

  if (quota.left > 0) console.warn(`  ${quota.left} unit(s) of the 30-day quotas were not sold: run again`)

  // Bulk, in batches — thousands of nested creates would be thousands of round
  // trips to a pooled endpoint.
  async function insert<T>(label: string, rows: T[], write: (batch: T[]) => Promise<unknown>) {
    const size = 500
    for (let index = 0; index < rows.length; index += size) {
      await write(rows.slice(index, index + size))
    }
    console.log(`  ${rows.length} ${label}`)
  }

  await insert("shifts", shiftRows, (batch) =>
    prisma.retailShift.createMany({ data: batch, skipDuplicates: true }),
  )
  await insert("sales", saleRows, (batch) =>
    prisma.retailSale.createMany({ data: batch, skipDuplicates: true }),
  )
  await insert("sale lines", lineRows, (batch) =>
    prisma.retailSaleLine.createMany({ data: batch, skipDuplicates: true }),
  )
  await insert("payments", paymentRows, (batch) =>
    prisma.retailSalePayment.createMany({ data: batch, skipDuplicates: true }),
  )

  // ── Every closed day, closed ─────────────────────────────────────────────
  /*
    Each till's trading days before today get their Z-report, taken by the
    manager through the same service the end-of-day screen calls, so the
    Shifts list's "Print Z-reports" has documents to print. A day with a
    drawer still open (the stale Back till) cannot be closed and stays open.
  */
  const manager = staff.find((person) => person.name === "Tafara Nyathi") ?? staff[0]
  const today = tradingDayKey(now)
  const openDays = new Set(
    shiftRows.filter((row) => row.status === "OPEN").map((row) => `${row.registerCode}|${tradingDayKey(row.openedAt as Date)}`),
  )
  const closeDays = [
    ...new Set(shiftRows.map((row) => `${row.registerCode}|${tradingDayKey(row.openedAt as Date)}`)),
  ].filter((key) => !openDays.has(key) && key.split("|")[1]! < today)
  for (const key of closeDays) {
    const [registerCode, businessDate] = key.split("|") as [string, string]
    await generateRetailZReportTransaction({
      actor: { companyId, userId: manager.id, userName: manager.name, userRole: "MANAGER" },
      registerCode,
      businessDate,
    })
  }
  console.log(`  ${closeDays.length} Z-reports (every closed till-day before today)`)

  // ── A cart nobody came back for ──────────────────────────────────────────
  const openShift = shiftRows.find((row) => row.status === "OPEN")
  const castle = stocked.get("CASTLE-CASE")
  if (openShift && castle) {
    await prisma.retailHeldCart.upsert({
      where: { companyId_holdNo: { companyId, holdNo: "H-0001" } },
      update: { status: "HELD", shiftId: openShift.id as string },
      create: {
        companyId,
        holdNo: "H-0001",
        shiftId: openShift.id as string,
        cashierId: openShift.cashierId as string,
        label: "Gone to draw cash — case of Castle",
        status: "HELD",
        cartSnapshot: {
          items: [
            {
              productId: castle.productId,
              inventoryItemId: castle.inventoryItemId,
              name: "Castle Lager case of 24",
              quantity: 1,
              unitPrice: 26.5,
            },
          ],
        } as Prisma.InputJsonValue,
      },
    })
  }

  // ── What the records' Activity tabs read (FND-06) ────────────────────────
  await seedRecordActivity({
    companyId,
    shiftRows,
    saleRows,
    manager: staff.find((person) => person.name === "Tafara Nyathi") ?? staff[0]!,
    now,
  })

  // ── Purchasing ───────────────────────────────────────────────────────────
  const supplier = "Delta Beverages"
  const poNo = "PO-00001"
  const existingOrder = await prisma.retailPurchaseOrder.findUnique({
    where: { companyId_poNo: { companyId, poNo } },
    select: { id: true },
  })
  if (!existingOrder) {
    const castleSingle = stocked.get("CASTLE-340")
    const chibuku = stocked.get("CHIBUKU-1L")
    const order = await prisma.retailPurchaseOrder.create({
      data: {
        companyId,
        poNo,
        siteId: site.id,
        supplierName: supplier,
        // PARTIAL: the scuds landed, the lager did not. That is the status the
        // receipts screen exists to clear.
        status: "PARTIAL",
        expectedDate: daysAgo(-3),
        createdById: staff[0].id,
        lines: {
          create: [
            {
              companyId,
              inventoryItemId: castleSingle?.inventoryItemId ?? null,
              itemName: "Castle Lager 340ml",
              quantity: rate("480"),
              unitCost: money("0.85"),
              lineTotal: multiplyMoney(rate("480"), "0.85"),
              receivedQuantity: rate("0"),
            },
            {
              companyId,
              inventoryItemId: chibuku?.inventoryItemId ?? null,
              itemName: "Chibuku Scud 1L",
              quantity: rate("300"),
              unitCost: money("0.72"),
              lineTotal: multiplyMoney(rate("300"), "0.72"),
              receivedQuantity: rate("300"),
            },
          ],
        },
      },
      select: { id: true },
    })

    await prisma.retailGoodsReceipt.create({
      data: {
        companyId,
        receiptNo: "GRN-00001",
        purchaseOrderId: order.id,
        siteId: site.id,
        supplierName: supplier,
        status: "POSTED",
        receivedById: staff[3].id,
        postedAt: daysAgo(2),
        lines: {
          create: [
            {
              companyId,
              inventoryItemId: chibuku?.inventoryItemId ?? "",
              itemName: "Chibuku Scud 1L",
              quantity: rate("300"),
              unitCost: money("0.72"),
              lineTotal: multiplyMoney(rate("300"), "0.72"),
            },
          ],
        },
      },
    })
  }

  await seedStockLedger(companyId, site.id)

  const takings = sumMoney(saleRows.map((row) => row.baseAmount as Prisma.Decimal))
  console.log(
    `\n  ${refunds} refund(s), ${voids} void(s) flagged, ${zwgSales} sale(s) settled in ZWG` +
      `\n  takings across the period: $${takings.toFixed(2)}` +
      `\n  two shifts left OPEN: the Front till this morning, the Back till 52 hours ago` +
      `\n\nSign in as any of:\n${STAFF.map((s) => `  ${s.role.padEnd(12)} ${s.email}`).join("\n")}` +
      `\n  password: ${STAFF_PASSWORD}`,
  )
}

/**
 * FND-06. The events the shift and product records' Activity tabs read, as
 * the till and the back office would have written them: each open drawer's
 * opening, every open drawer's sales, the Front till's drop of US$20.00 to
 * the safe at 10:04 by Tafara Nyathi (ShiftRecord board), and the owner's
 * last price change on Amarula Cream 750ml, US$17.99 to US$18.25.
 */
async function seedRecordActivity(input: {
  companyId: string
  shiftRows: Prisma.RetailShiftCreateManyInput[]
  saleRows: Prisma.RetailSaleCreateManyInput[]
  manager: { id: string; name: string }
  now: Date
}) {
  const { companyId, shiftRows, saleRows, manager, now } = input
  const at = async (eventType: string, entityId: string, when: Date) => {
    const latest = await prisma.platformAuditEvent.findFirst({
      where: { companyId, eventType, entityId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })
    if (latest) await prisma.platformAuditEvent.update({ where: { id: latest.id }, data: { createdAt: when } })
  }
  const actorOf = (row: { cashierId: string; cashierName: string }) => ({
    companyId,
    userId: row.cashierId,
    userName: row.cashierName,
    userRole: "CASHIER",
  })

  // Without --reset the history rows are skipped as duplicates, and these ids were never written.
  const written = new Set(
    (
      await prisma.retailShift.findMany({
        where: { companyId, id: { in: shiftRows.filter((row) => row.status === "OPEN").map((row) => row.id as string) } },
        select: { id: true },
      })
    ).map((row) => row.id),
  )

  let events = 0
  for (const shift of shiftRows.filter((row) => row.status === "OPEN" && written.has(row.id as string))) {
    const openedAt = shift.openedAt as Date
    await auditShiftOpened(prisma, {
      actor: actorOf(shift),
      shiftId: shift.id as string,
      shiftNo: shift.shiftNo,
      siteId: shift.siteId,
      registerCode: shift.registerCode,
      cashierId: shift.cashierId,
      openingFloat: shift.openingFloat as Prisma.Decimal,
    })
    await at("RETAIL_SHIFT.OPENED", shift.id as string, openedAt)
    events += 1
  }

  // Every open drawer's sales, so each open shift's Activity tab reads like its Sales tab.
  for (const shift of shiftRows.filter((row) => row.status === "OPEN" && written.has(row.id as string))) {
    for (const sale of saleRows.filter((row) => row.shiftId === shift.id)) {
      await auditSalePosted(prisma, {
        actor: actorOf(shift),
        saleId: sale.id as string,
        saleNo: sale.saleNo,
        shiftId: shift.id as string,
        siteId: sale.siteId ?? null,
        totalAmount: sale.totalAmount as Prisma.Decimal,
        currency: sale.currency ?? "USD",
        baseAmount: sale.baseAmount as Prisma.Decimal,
        lineCount: 1,
      })
      await at("RETAIL_SALE.POSTED", sale.id as string, sale.postedAt as Date)
      events += 1
    }
  }

  const front = shiftRows.find((row) => row.status === "OPEN" && row.registerCode === "TILL-1" && written.has(row.id as string))
  if (front) {
    const dropAt = harareTime(0, 10, 4)
    if (dropAt.getTime() > (front.openedAt as Date).getTime() && dropAt.getTime() < now.getTime()) {
      const movement = await prisma.retailCashMovement.create({
        data: {
          companyId,
          shiftId: front.id as string,
          type: "DROP_TO_SAFE",
          reasonCode: "CASH_LEVEL_TOO_HIGH",
          amount: money("20.00"),
          currency: "USD",
          exchangeRate: rate("1"),
          baseAmount: money("20.00"),
          recordedById: manager.id,
          recordedByName: manager.name,
          createdAt: dropAt,
        },
        select: { id: true },
      })
      await prisma.retailShift.update({
        where: { id: front.id as string },
        data: { expectedCash: { decrement: money("20.00") } },
      })
      await auditCashMoved(prisma, {
        actor: { companyId, userId: manager.id, userName: manager.name, userRole: "MANAGER" },
        movementId: movement.id,
        shiftId: front.id as string,
        type: "DROP_TO_SAFE",
        reasonCode: "CASH_LEVEL_TOO_HIGH",
        amount: money("20.00"),
        currency: "USD",
        baseAmount: money("20.00"),
      })
      await at("RETAIL_CASH.MOVED", movement.id, dropAt)
      events += 1
    }
  }

  // The owner's last price change on Amarula, once.
  const amarula = await prisma.product.findFirst({ where: { companyId, code: "AMARULA-750" }, select: { id: true } })
  const owner = await prisma.user.findFirst({ where: { companyId, role: "SUPERADMIN" }, select: { id: true, name: true } })
  if (amarula && owner) {
    const already = await prisma.platformAuditEvent.findFirst({
      where: { companyId, entityType: "Product", entityId: amarula.id, eventType: "RETAIL_RECORD.EDITED" },
      select: { id: true },
    })
    if (!already) {
      await auditRecordEdited(prisma, {
        actor: { companyId, userId: owner.id, userName: owner.name, userRole: "SUPERADMIN" },
        entityType: "Product",
        entityId: amarula.id,
        field: "unitPrice",
        label: "Price",
        from: "17.99",
        to: "18.25",
        kind: "money",
      })
      await at("RETAIL_RECORD.EDITED", amarula.id, harareTime(2, 9, 12))
      events += 1
    }
  }
  console.log(`  ${events} activity events (open drawers and their sales, the Front till's drop, Amarula's price)`)
}

/**
 * Setup › Shop's save bar reads "Last changed by Tendai Mhlanga, 2 October.":
 * the owner's save of the licence that day, written once. A later save on the
 * page (an acceptance walk) is newer and is what the bar then names.
 */
/**
 * PRD-02: the liquor set as the Categories board shows it — VAT 15% included,
 * the 18+ check on the four alcohol categories, the board's target margins,
 * top level, stamped as the liquor store's seed and out of the bin. With
 * --reset a category a test run added goes: deleted when nothing is filed
 * under it, else to the bin (the catalogue below files every line again).
 */
async function seedCategories(companyId: string, reset: boolean) {
  const seeds = CATEGORY_SEEDS.LIQUOR
  for (const seed of seeds) {
    await prisma.retailCategory.update({
      where: { companyId_name: { companyId, name: seed.name } },
      data: {
        vatRate: money(seed.vatRate),
        vatExempt: false,
        ageRestricted: seed.ageRestricted ?? false,
        returnable: false,
        depositAmount: null,
        targetMarginPercent: seed.targetMarginPercent === undefined ? null : money(seed.targetMarginPercent),
        seededFor: "LIQUOR",
        parentId: null,
        archivedAt: null,
      },
    })
  }
  if (!reset) return
  const names = seeds.map((seed) => seed.name)
  const others = await prisma.retailCategory.findMany({
    where: { companyId, name: { notIn: names } },
    select: { id: true, _count: { select: { products: true } } },
  })
  await prisma.retailCategory.updateMany({ where: { companyId, name: { notIn: names } }, data: { parentId: null } })
  const empty = others.filter((row) => row._count.products === 0).map((row) => row.id)
  const filed = others.filter((row) => row._count.products > 0).map((row) => row.id)
  if (empty.length) await prisma.retailCategory.deleteMany({ where: { id: { in: empty } } })
  if (filed.length) {
    await prisma.retailCategory.updateMany({ where: { id: { in: filed }, archivedAt: null }, data: { archivedAt: new Date() } })
  }
}

async function seedShopSettingsSave(companyId: string) {
  const owner = await prisma.user.findFirst({ where: { companyId, role: "SUPERADMIN" }, select: { id: true, name: true } })
  if (!owner) return
  const already = await prisma.platformAuditEvent.findFirst({
    where: { companyId, eventType: RETAIL_AUDIT_EVENTS.settingsChanged, entityType: "RetailSettings", entityId: "company" },
    select: { id: true },
  })
  if (already) return
  await prisma.retailShopProfile.update({ where: { companyId }, data: { updatedById: owner.id } })
  await writeRetailAuditEvent(prisma, {
    actor: { companyId, userId: owner.id, userName: owner.name, userRole: "SUPERADMIN" },
    eventType: RETAIL_AUDIT_EVENTS.settingsChanged,
    entityType: "RetailSettings",
    entityId: "company",
    payload: {
      page: "company",
      changes: [
        { field: "licenceNumber", label: "Liquor licence number", from: "", to: "HRE/BL/2024/0711" },
        { field: "licenceExpiresOn", label: "Licence expires", from: "", to: "31 December 2026" },
      ],
    },
  })
  const written = await prisma.platformAuditEvent.findFirst({
    where: { companyId, eventType: RETAIL_AUDIT_EVENTS.settingsChanged, entityType: "RetailSettings", entityId: "company" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (written) {
    await prisma.platformAuditEvent.update({
      where: { id: written.id },
      data: { createdAt: new Date("2026-10-02T14:40:00+02:00") },
    })
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Where the spirits stand at the main branch: the phone count walks the shelves in this order. */
const SHELVES: Array<[namePrefix: string, shelf: string]> = [
  ["Jameson", "Shelf 2, top"],
  ["Johnnie Walker", "Shelf 2, top"],
  ["Gordon", "Shelf 2, middle"],
  ["Amarula", "Shelf 3"],
  ["Two Keys", "Shelf 3"],
  ["Bols Brandy", "Shelf 3"],
  ["Hennessy", "Shelf 3"],
]

type LedgerRow = {
  id: string
  createdAt: Date
  change: Prisma.Decimal
  balanceAfter: Prisma.Decimal | null
  create?: Omit<Prisma.StockMovementCreateManyInput, "balanceAfter" | "referenceId">
}

/**
 * STK-01. Every stock line gets a ledger that tells its story.
 *
 * An `OPENING` movement 31 days ago, then a movement for every sale, refund
 * and void of the last 30 days (by the cashier, at the sale's time, under the
 * sale's number), then whatever the shop's own documents posted — and
 * `balanceAfter` follows them in (createdAt, id) order, so the newest movement
 * on each line holds its on hand.
 *
 * The opening is what makes it land: it is the line's on hand less everything
 * that moved since. The seed owns the opening and the sales' movements and
 * rebuilds them on every run (the history above is regenerated, and `--reset`
 * deletes sales); movements the shop posted itself (deliveries, case breaks,
 * corrections) are kept, and only their balances are rewritten.
 */
async function seedStockLedger(companyId: string, mainSiteId: string) {
  const now = Date.now()
  const since = new Date(now - 30 * DAY_MS)
  const lines = await prisma.inventoryItem.findMany({
    where: { site: { companyId } },
    select: { id: true, unit: true, currentStock: true, name: true },
  })
  const lineIds = lines.map((line) => line.id)
  const unitOf = new Map(lines.map((line) => [line.id, line.unit]))

  await prisma.stockMovement.deleteMany({
    where: { itemId: { in: lineIds }, reason: { in: ["OPENING", "SALE", "REFUND", "VOID"] } },
  })

  // A sale voided at the till has a VOID document putting its stock back. The
  // history above marks a void on the sale alone, which never moved stock.
  const sales = await prisma.retailSale.findMany({
    where: {
      companyId,
      postedAt: { gte: since },
      OR: [{ status: "POSTED" }, { status: "VOIDED", reversals: { some: { saleType: "VOID" } } }],
    },
    select: {
      id: true,
      saleNo: true,
      saleType: true,
      postedAt: true,
      cashierId: true,
      lines: { select: { inventoryItemId: true, quantity: true } },
    },
  })

  const byLine = new Map<string, LedgerRow[]>(lineIds.map((id) => [id, []]))
  for (const sale of sales) {
    const kind =
      sale.saleType === "SALE"
        ? ({ reason: "SALE", movementType: "ISSUE", sourceType: "RETAIL_SALE", sign: -1, words: "Retail sale" } as const)
        : sale.saleType === "REFUND"
          ? ({ reason: "REFUND", movementType: "RECEIPT", sourceType: "RETAIL_REFUND", sign: 1, words: "Retail refund" } as const)
          : ({ reason: "VOID", movementType: "RECEIPT", sourceType: "RETAIL_VOID", sign: 1, words: "Retail sale void" } as const)
    for (const line of sale.lines) {
      const rows = byLine.get(line.inventoryItemId)
      const unit = unitOf.get(line.inventoryItemId)
      if (!rows || !unit) continue
      const units = quantity(line.quantity).abs()
      rows.push({
        id: randomUUID(),
        createdAt: sale.postedAt!,
        change: kind.sign < 0 ? units.negated() : units,
        balanceAfter: null,
        create: {
          itemId: line.inventoryItemId,
          movementType: kind.movementType,
          quantity: units,
          unit,
          issuedById: sale.cashierId,
          notes: `${kind.words} ${sale.saleNo}`,
          sourceType: kind.sourceType,
          sourceId: `${sale.id}:${line.inventoryItemId}`,
          reason: kind.reason,
          reference: sale.saleNo,
          change: kind.sign < 0 ? units.negated() : units,
          createdAt: sale.postedAt!,
        },
      })
    }
  }

  const kept = await prisma.stockMovement.findMany({
    where: { itemId: { in: lineIds } },
    select: { id: true, itemId: true, createdAt: true, change: true, balanceAfter: true },
  })
  for (const movement of kept) byLine.get(movement.itemId)!.push({ ...movement })

  const created: Prisma.StockMovementCreateManyInput[] = []
  const rebalanced: Array<{ id: string; balanceAfter: Prisma.Decimal }> = []
  const restated: string[] = []
  for (const line of lines) {
    const rows = byLine.get(line.id)!
    rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

    // The opening is what was on the shelf before all of this; never so little
    // that the line would have sold stock it did not have.
    const moved = rows.reduce((sum, row) => sum.plus(row.change), ZERO)
    let opening = quantity(line.currentStock).minus(moved)
    let running = ZERO
    let lowest = ZERO
    for (const row of rows) {
      running = running.plus(row.change)
      if (running.lessThan(lowest)) lowest = running
    }
    if (opening.plus(lowest).lessThan(ZERO)) opening = lowest.negated()
    if (opening.isZero() && rows.length === 0) continue

    const firstAt = rows[0]?.createdAt.getTime() ?? now
    const openingAt = new Date(Math.min(now - 31 * DAY_MS, firstAt - 60 * 1000))
    if (!opening.isZero()) {
      rows.unshift({
        id: randomUUID(),
        createdAt: openingAt,
        change: opening,
        balanceAfter: null,
        create: {
          itemId: line.id,
          movementType: "RECEIPT",
          quantity: opening,
          unit: line.unit,
          notes: "Opening stock",
          reason: "OPENING",
          reference: "Opening",
          change: opening,
          createdAt: openingAt,
        },
      })
    }

    let balance = ZERO
    for (const row of rows) {
      balance = balance.plus(row.change)
      if (row.create) {
        created.push({ ...row.create, id: row.id, referenceId: "", balanceAfter: balance })
      } else if (!row.balanceAfter || !row.balanceAfter.equals(balance)) {
        rebalanced.push({ id: row.id, balanceAfter: balance })
      }
    }
    if (!balance.equals(line.currentStock)) {
      await prisma.inventoryItem.update({ where: { id: line.id }, data: { currentStock: balance } })
      restated.push(`${line.name} ${line.currentStock} → ${balance}`)
    }
  }

  // One block of movement numbers from the global sequence, taken under its lock.
  const firstNumber =
    created.length === 0
      ? 0
      : await prisma.$transaction(async (tx) => {
          const first = await reserveIdentifier(tx, { companyId, entity: "STOCK_MOVEMENT" })
          await tx.globalIdSequence.update({
            where: { entityKey_scopeKey: { entityKey: "STOCK_MOVEMENT", scopeKey: "GLOBAL" } },
            data: { lastNumber: { increment: created.length - 1 } },
          })
          return Number(first.split("-").pop())
        })
  const prefix = ID_ENTITY_CONFIG.STOCK_MOVEMENT.prefix
  created.forEach((row, index) => {
    row.referenceId = `${prefix}-${String(firstNumber + index).padStart(4, "0")}`
  })
  for (let index = 0; index < created.length; index += 500) {
    await prisma.stockMovement.createMany({ data: created.slice(index, index + 500) })
  }
  for (const row of rebalanced) {
    await prisma.stockMovement.update({ where: { id: row.id }, data: { balanceAfter: row.balanceAfter } })
  }

  for (const [namePrefix, shelf] of SHELVES) {
    await prisma.inventoryItem.updateMany({
      where: { siteId: mainSiteId, name: { startsWith: namePrefix } },
      data: { shelf },
    })
  }

  console.log(
    `  stock ledger: ${created.length} movement(s) written, ${rebalanced.length} rebalanced` +
      (restated.length > 0 ? `; on hand follows the ledger for ${restated.join(", ")}` : ""),
  )
}

/** Stable pseudo-barcode from the SKU, so a re-run does not renumber the shelf. */
function hashCode(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }
  return hash
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})

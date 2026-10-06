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
 * A liquor store priced in **USD at 15.5% VAT**, taking **cash, card, EcoCash and
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

import { execFileSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Prisma, WorkspaceProfile, type NotificationType, type RetailTenderType } from "@prisma/client"
import { ID_ENTITY_CONFIG, reserveIdentifier } from "@/lib/id-generator"
import { money, multiplyMoney, quantity, rate, sumMoney, ZERO } from "@/lib/money"
import { runAccountingSeedPack } from "@/lib/accounting/bootstrap"
import { RETAIL_ROLE_ACCOUNT_CODES } from "@/lib/accounting/defaults"
import { postIntegrationEvent } from "@/lib/accounting/integration"
import { RETAIL_SOURCE_TYPES } from "@/lib/retail/posting-settings"
import { prisma } from "@/lib/prisma"
import { deleteFromBinForGood, listBinEntries, moveToBin } from "@/lib/retail/bin"
import { CATEGORY_SEEDS, ensureRetailCategories } from "@/lib/retail/categories"
import { activeRetailPriceList } from "@/lib/retail/shelf-pricing"
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
import { hashInviteToken, INVITE_DAYS } from "@/lib/retail/people/invite"

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
 * A Harare bottle store's shelf, priced in USD at 15.5% VAT (20-products 3.5 draws 15%; ZIMRA takes 15.5% since January).
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
  // STK-07: sent to Borrowdale on TRF-0008, 48 left at Harare Main Branch.
  { code: "FANTA-500", name: "Fanta Orange 500ml", unit: "bottle", price: "1.00", cost: "0.76", stock: 48, sold30: 30, min: 24, reorder: 48, weight: 30, category: "Soft drinks" },
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

// ZIMRA's standard rate since 1 January 2026 (VAT15_5, its taxID 1): the till signs only a rate ZIMRA maps (SET-08).
const VAT_PERCENT = "15.50"

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

/** ZiG per US dollar: today's rate on Payments (SET-05), the one the seeded ZiG sales were taken at. */
const ZWG_RATE = "26.8000"

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
  /** Take units of one product out of the window before the others are dealt (a sale whose lines are fixed). */
  reserve(code: string, units: number) {
    let left = units
    for (let index = this.chunks.length - 1; index >= 0 && left > 0; index -= 1) {
      const chunk = this.chunks[index]!
      if (chunk.code !== code) continue
      const used = Math.min(chunk.units, left)
      chunk.units -= used
      left -= used
      if (chunk.units === 0) this.chunks.splice(index, 1)
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
  // SET-02: their short codes are HRE and BDL; a tenant seeded before carries
  // MAIN and BORROWDALE, which are renamed in place.
  async function branch(code: string, earlier: string, name: string, location: string) {
    const found =
      (await prisma.site.findFirst({ where: { companyId, code }, select: { id: true } })) ??
      (await prisma.site.findFirst({ where: { companyId, code: earlier }, select: { id: true } }))
    return found
      ? prisma.site.update({
          where: { id: found.id },
          data: { code, name, location, isActive: true, closedAt: null, closedById: null },
        })
      : prisma.site.create({ data: { companyId, code, name, location } })
  }
  const site = await branch("HRE", "MAIN", "Harare Main Branch", "14 Samora Machel Avenue, Harare")
  const borrowdale = await branch("BDL", "BORROWDALE", "Borrowdale", "Borrowdale Village, Harare")

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
    update: { name: "Back till", siteId: site.id, isActive: true, deviceKind: "BROWSER" },
    create: { companyId, code: "TILL-2", name: "Back till", siteId: site.id, deviceKind: "BROWSER" },
  })
  // SET-03: the TillsList board's other three tills (their devices: `seedTills`).
  const handheld = await prisma.retailRegister.upsert({
    where: { companyId_code: { companyId, code: "TILL-3" } },
    update: { name: "Handheld 1", siteId: site.id, isActive: true, deviceKind: "KORA" },
    create: { companyId, code: "TILL-3", name: "Handheld 1", siteId: site.id, deviceKind: "KORA" },
  })
  const borrowdaleTill = await prisma.retailRegister.upsert({
    where: { companyId_code: { companyId, code: "TILL-4" } },
    update: { name: "Borrowdale till", siteId: borrowdale.id, isActive: true, deviceKind: "COUNTER_MINI" },
    create: { companyId, code: "TILL-4", name: "Borrowdale till", siteId: borrowdale.id },
  })
  await prisma.retailRegister.upsert({
    where: { companyId_code: { companyId, code: "TILL-5" } },
    update: { name: "Cold room till", siteId: site.id, isActive: true, deviceKind: "COUNTER_MINI" },
    create: { companyId, code: "TILL-5", name: "Cold room till", siteId: site.id },
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
    (await prisma.retailCategory.findMany({ where: { companyId, archivedAt: null }, select: { id: true, name: true } })).map(
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
    /** Another branch's till (Borrowdale); else Harare Main Branch. */
    site?: typeof site
    /** A short shift that closed at this time, with sales at exactly these times. */
    closesAt?: Date
    saleTimes?: Date[]
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
  /*
    SET-03 (10-setup 3.7): Handheld 1's evening shift yesterday, its last sale
    at 21:50, and the Borrowdale till's early shift today, its last sale at
    09:12 — what the TillsList board's "Last sale" column reads. They open
    before the Front till's 07:58, so its shift keeps the highest number, and
    their sales take their share of the 30-day quotas like any other.
  */
  const harareAt = (days: number, hour: number, minute: number) => harareTime(days, hour, minute)
  slots.push({
    register: handheld,
    openedAt: harareAt(1, 17, 2),
    open: false,
    cashier: staffNamed("Chipo Dube"),
    float: "50.00",
    closesAt: harareAt(1, 22, 6),
    saleTimes: [harareAt(1, 17, 40), harareAt(1, 18, 55), harareAt(1, 19, 31), harareAt(1, 20, 18), harareAt(1, 21, 4), harareAt(1, 21, 50)],
  })
  const borrowdaleOpens = harareAt(0, 7, 30)
  if (borrowdaleOpens.getTime() < now.getTime()) {
    slots.push({
      register: borrowdaleTill,
      site: borrowdale,
      openedAt: borrowdaleOpens,
      open: false,
      cashier: staffNamed("Farai Moyo"),
      float: "50.00",
      closesAt: new Date(Math.min(harareAt(0, 9, 40).getTime(), now.getTime() - 60 * 1000)),
      saleTimes: [harareAt(0, 7, 46), harareAt(0, 8, 21), harareAt(0, 8, 57), harareAt(0, 9, 12)],
    })
  }
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
    if (slot.saleTimes) return slot.saleTimes.filter((postedAt) => postedAt.getTime() <= now.getTime() && !(postedAt.getTime() >= windowOpens && postedAt.getTime() < windowCounts))
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
  /*
    SET-07. The shop's newest sale is the one Setup › Receipts previews, so it
    is the board's: six Castle Lager 340ml with their deposit and a bag of
    ice, paid by EcoCash (9.30). Its units come out of the window's quotas
    first, so every product's 30-day count still lands exactly.
  */
  const newestSale = salePlans
    .flatMap((plan, slotIndex) => plan.map((postedAt) => ({ slotIndex, at: postedAt.getTime() })))
    .reduce<{ slotIndex: number; at: number } | null>((best, next) => (!best || next.at > best.at ? next : best), null)
  const PREVIEW_PICKS = [
    { code: "CASTLE-340", units: 6 },
    { code: "ICE-2KG", units: 1 },
  ]
  if (newestSale && newestSale.at >= windowCounts) {
    for (const pickLine of PREVIEW_PICKS) quota.reserve(pickLine.code, pickLine.units)
    windowSalesLeft -= 1
  }
  let previewSaleId: string | null = null
  const byCode = new Map(CATALOGUE.map((entry) => [entry.code, entry]))
  const codeOfProduct = new Map([...stocked].map(([code, line]) => [line.productId, code]))

  for (const [slotIndex, slot] of slots.entries()) {
    {
      const cashier = slot.cashier
      const openedAt = slot.openedAt
      const isOpenShift = slot.open
      const closedAt = isOpenShift ? null : (slot.closesAt ?? new Date(openedAt.getTime() + (7 * 60 + between(-4, 5)) * 60 * 1000))
      const slotSiteId = (slot.site ?? site).id

      const shiftId = randomUUID()
      const shiftNo = `SH-${String(slotIndex + 1).padStart(5, "0")}`
      const openingFloat = money(slot.float)

      let cashTaken = money(0)

      for (const postedAt of salePlans[slotIndex]!) {
        saleSeq += 1
        const saleId = randomUUID()
        const inWindow = postedAt.getTime() >= windowCounts
        const isPreviewSale = newestSale?.slotIndex === slotIndex && newestSale.at === postedAt.getTime()
        if (isPreviewSale) previewSaleId = saleId

        // In the window, this sale's share of the quotas; before it, a weighted pick.
        const picks = isPreviewSale
          ? PREVIEW_PICKS
          : inWindow
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
          // The preview sale carries its bottles' deposit, as the till charges it.
          const lineDeposit = isPreviewSale && product.deposit ? multiplyMoney(quantity, product.deposit) : money(0)
          lines.push({
            depositAmount: lineDeposit,
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
        const saleDeposit = sumMoney(lines.map((line) => money((line.depositAmount ?? 0) as Prisma.Decimal)))
        const inZwg = !isPreviewSale && Math.random() < 0.08
        const currency = inZwg ? "ZWG" : "USD"
        const exchangeRate = inZwg ? rate(ZWG_RATE) : rate("1")
        const baseAmount = inZwg ? money(totalAmount.div(rate(ZWG_RATE))) : totalAmount
        if (inZwg) zwgSales += 1

        const roll = Math.random()
        const tender: RetailTenderType = isPreviewSale
          ? "ECOCASH"
          : inZwg
          ? "CASH"
          : roll < 0.5
            ? "CASH"
            : roll < 0.74
              ? "ECOCASH"
              : roll < 0.92
                ? "CARD"
                : "TRANSFER"

        const named = !isPreviewSale && Math.random() < 0.22
        saleRows.push({
          id: saleId,
          companyId,
          saleNo: `S-${String(saleSeq).padStart(6, "0")}`,
          shiftId,
          registerId: slot.register.id,
          siteId: slotSiteId,
          cashierId: cashier.id,
          cashierName: cashier.name,
          customerName: named ? pick(CUSTOMERS) : null,
          saleType: "SALE",
          status: "POSTED",
          subtotal,
          discountAmount: money(0),
          taxAmount,
          totalAmount,
          depositAmount: saleDeposit,
          tenderedAmount: totalAmount.plus(saleDeposit),
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
          // What the customer paid: the goods and the deposit on their bottles.
          amount: totalAmount.plus(saleDeposit),
          currency,
          exchangeRate,
          baseAmount: baseAmount.plus(saleDeposit),
          reference: tender === "ECOCASH" ? `EC${between(100000, 999999)}` : null,
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
            registerId: slot.register.id,
            sourceSaleId: saleId,
            siteId: slotSiteId,
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
              row.id !== previewSaleId &&
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
        registerId: slot.register.id,
        siteId: slotSiteId,
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

  await seedSites({ companyId, mainSiteId: site.id, borrowdaleId: borrowdale.id, reset })
  await seedTills(companyId)
  await seedStockPeople(companyId, passwordHash)
  await seedTillPins(companyId, passwordHash)
  await seedPeople({ companyId, mainSiteId: site.id, borrowdaleId: borrowdale.id, passwordHash, reset })
  await seedTransfers({ companyId, mainSiteId: site.id, borrowdaleId: borrowdale.id, reset })
  await seedStockLedger(companyId, site.id)
  await seedBin({ companyId, siteId: site.id, locationId: location.id, wineId: categoryIds.get("Wine") ?? null, reset })
  await seedPayments(companyId)
  await seedPosting(companyId)
  await seedReceipts(companyId)
  await seedFiscal(companyId)

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
 * SET-02. Setup › Sites as the SitesList board draws it: Harare Main Branch
 * (HRE, the default) with its phone, hours and three places — Shop floor,
 * Back store, Cold room — and Borrowdale (BDL) with its shop floor, both
 * selling from the shop's price list. Stock values are whatever the stock seed
 * put on their shelves. `--reset` takes away sites added since (an acceptance
 * run's Avondale): deleted when nothing else refers to them, else closed.
 */
async function seedSites(input: { companyId: string; mainSiteId: string; borrowdaleId: string; reset: boolean }) {
  const { companyId, mainSiteId, borrowdaleId } = input
  const priceList = await activeRetailPriceList(companyId)
  await prisma.site.update({
    where: { id: mainSiteId },
    data: {
      phone: "+263 24 270 5521",
      openingHours: "Mon to Sat 08:00 to 22:00, Sun 10:00 to 18:00",
      priceListId: priceList?.id ?? null,
    },
  })
  await prisma.site.update({ where: { id: borrowdaleId }, data: { priceListId: priceList?.id ?? null } })

  const places: Array<[siteId: string, code: string, name: string]> = [
    [mainSiteId, "SHOP", "Shop floor"],
    [mainSiteId, "BACK", "Back store"],
    [mainSiteId, "COLD", "Cold room"],
    [borrowdaleId, "SHOP", "Shop floor"],
  ]
  for (const [siteId, code, name] of places) {
    const sortOrder = places.filter((place) => place[0] === siteId).findIndex((place) => place[1] === code)
    await prisma.stockLocation.upsert({
      where: { siteId_code: { siteId, code } },
      update: { name, sortOrder, isActive: true },
      create: { siteId, code, name, sortOrder },
    })
  }
  // Any other place at the two sites is not on the board.
  for (const siteId of [mainSiteId, borrowdaleId]) {
    const keep = places.filter((place) => place[0] === siteId).map((place) => place[1])
    const shopFloor = await prisma.stockLocation.findUniqueOrThrow({ where: { siteId_code: { siteId, code: "SHOP" } } })
    const extra = await prisma.stockLocation.findMany({ where: { siteId, code: { notIn: keep } }, select: { id: true } })
    if (extra.length === 0) continue
    await prisma.inventoryItem.updateMany({
      where: { locationId: { in: extra.map((place) => place.id) } },
      data: { locationId: shopFloor.id },
    })
    await prisma.stockLocation.updateMany({ where: { id: { in: extra.map((place) => place.id) } }, data: { isActive: false } })
  }

  if (!input.reset) return
  // An acceptance run's moves between places at the two sites (a place removed,
  // a line moved to the back store) go with the places it changed, which are
  // restored above. Seeded lines sit on the shop floor.
  const seededSites = [mainSiteId, borrowdaleId]
  for (const siteId of seededSites) {
    const shopFloor = await prisma.stockLocation.findUniqueOrThrow({ where: { siteId_code: { siteId, code: "SHOP" } } })
    await prisma.inventoryItem.updateMany({ where: { siteId, locationId: { not: shopFloor.id } }, data: { locationId: shopFloor.id } })
  }
  const placeMoves = await prisma.stockMovement.deleteMany({
    where: { reason: "PLACE_MOVE", item: { siteId: { in: seededSites } } },
  })
  if (placeMoves.count > 0) console.log(`  removed ${placeMoves.count} move(s) between places`)

  const others = await prisma.site.findMany({
    where: { companyId, id: { notIn: [mainSiteId, borrowdaleId] } },
    select: { id: true, name: true },
  })
  for (const other of others) {
    try {
      await prisma.$transaction([
        prisma.stockLocation.deleteMany({ where: { siteId: other.id } }),
        prisma.site.delete({ where: { id: other.id } }),
      ])
      console.log(`  removed the site ${other.name}`)
    } catch {
      await prisma.site.update({ where: { id: other.id }, data: { isActive: false, closedAt: new Date() } })
      console.log(`  closed the site ${other.name} (it has history)`)
    }
  }
}

/**
 * SET-03 (10-setup 3.7). The devices on the TillsList board: Front till's
 * CounterMini (seen now, 4.12.0), Back till's browser on a Windows PC (seen a
 * few minutes ago), Handheld 1's Kora (last seen yesterday 21:55, no shift:
 * Closed), the Borrowdale till's CounterMini (silent for two hours: Offline 2
 * hours) and the Cold room till with no device (Not paired). All paired on 2
 * August 2026 by Tafara Nyathi. Their keys are random hashes nobody holds.
 * Every run starts again from these: devices, codes and messages an
 * acceptance run made go, and so do the tills it added that never sold.
 */
async function seedTills(companyId: string) {
  const tafara = await prisma.user.findFirst({
    where: { companyId, email: "tafara.manager@bottlestore.test" },
    select: { id: true },
  })
  if (!tafara) {
    console.log("  tills: Tafara Nyathi missing, skipped")
    return
  }
  await prisma.retailDeviceMessage.deleteMany({ where: { companyId } })
  await prisma.retailPairingCode.deleteMany({ where: { companyId } })
  await prisma.retailPairingThrottle.deleteMany({ where: { companyId } })
  await prisma.retailDevice.deleteMany({ where: { companyId } })

  const seeded = ["TILL-1", "TILL-2", "TILL-3", "TILL-4", "TILL-5"]
  const strays = await prisma.retailRegister.findMany({
    where: { companyId, code: { notIn: seeded } },
    select: { id: true, code: true },
  })
  let removed = 0
  for (const stray of strays) {
    const used = await prisma.retailShift.count({ where: { companyId, registerId: stray.id } })
    if (used > 0) await prisma.retailRegister.update({ where: { id: stray.id }, data: { isActive: false } })
    else {
      await prisma.retailRegister.delete({ where: { id: stray.id } })
      removed += 1
    }
  }

  const tills = new Map(
    (await prisma.retailRegister.findMany({ where: { companyId, code: { in: seeded } }, select: { id: true, code: true } })).map(
      (till) => [till.code, till.id],
    ),
  )
  const now = Date.now()
  const minutesAgo = (minutes: number) => new Date(now - minutes * 60 * 1000)
  const pairedAt = new Date("2026-08-02T09:20:00+02:00")
  // Front and Back till are seen now, so both read Selling. Nothing calls in
  // for them until the device heartbeat lands (SET-04): five minutes after
  // seeding they read "Offline", as a real till that stopped calling would.
  const devices: Array<{ code: string; kind: "COUNTER_MINI" | "KORA" | "BROWSER"; label?: string; lastSeenAt: Date }> = [
    { code: "TILL-1", kind: "COUNTER_MINI", lastSeenAt: new Date(now) },
    { code: "TILL-2", kind: "BROWSER", label: "Windows PC", lastSeenAt: new Date(now) },
    { code: "TILL-3", kind: "KORA", lastSeenAt: harareTime(1, 21, 55) },
    { code: "TILL-4", kind: "COUNTER_MINI", lastSeenAt: minutesAgo(2 * 60 + 3) },
  ]
  for (const device of devices) {
    const registerId = tills.get(device.code)
    if (!registerId) continue
    await prisma.retailDevice.create({
      data: {
        companyId,
        registerId,
        kind: device.kind,
        label: device.label ?? null,
        keyHash: createHash("sha256").update(randomUUID()).digest("hex"),
        appVersion: "4.12.0",
        pairedAt,
        pairedById: tafara.id,
        lastSeenAt: device.lastSeenAt,
        createdAt: pairedAt,
      },
    })
  }
  console.log(`  tills: 5 (4 paired, Cold room till not paired)${removed ? `, ${removed} added by a test run removed` : ""}`)
}

/**
 * SET-04: who sells at the tills, with their PINs, so a paired till's "Who is
 * selling?" offers Chipo D., Kuda B. and Farai M. Kuda Banda is a cashier the
 * admin area also seeds (upserted by email, so the two converge). The PINs are
 * demo values, printed here and nowhere else.
 */
const TILL_PINS: Array<{ email: string; name: string; pin: string }> = [
  { email: "chipo.till@bottlestore.test", name: "Chipo Dube", pin: "2580" },
  { email: "kuda.till@bottlestore.test", name: "Kuda Banda", pin: "1470" },
  { email: "farai.till@bottlestore.test", name: "Farai Moyo", pin: "3691" },
  // The manager approves at the till with hers (SET-06).
  { email: "tafara.manager@bottlestore.test", name: "Tafara Nyathi", pin: "4826" },
  // ADM-02: the owner and the stock clerk who counts on the phone carry one too (Staff and PINs: "Set").
  { email: "owner@bottlestore.test", name: "Tendai Mhlanga", pin: "1357" },
  { email: "rudo.stock@bottlestore.test", name: "Rudo Moyo", pin: "5091" },
]

async function seedTillPins(companyId: string, passwordHash: string) {
  const bcrypt = await import("bcryptjs")
  await prisma.user.upsert({
    where: { email: "kuda.till@bottlestore.test" },
    update: { name: "Kuda Banda", role: "CASHIER", companyId, isActive: true },
    create: { email: "kuda.till@bottlestore.test", name: "Kuda Banda", role: "CASHIER", companyId, password: passwordHash, isActive: true },
  })
  // ADM-02: when each was last used (Last in on Staff and PINs), and Farai's
  // locked after five wrong tries a moment ago (the till's 15-minute lock).
  const now = Date.now()
  const todayAt = (hour: number, minute: number) => new Date(Math.min(harareTime(0, hour, minute).getTime(), now - 60_000))
  const used: Record<string, Date> = {
    "chipo.till@bottlestore.test": new Date(now - 4 * 60_000),
    "kuda.till@bottlestore.test": new Date(now - 6 * 60_000),
    "rudo.stock@bottlestore.test": todayAt(10, 40),
    "tafara.manager@bottlestore.test": todayAt(12, 31),
    "farai.till@bottlestore.test": harareTime(1, 21, 40),
  }
  for (const person of TILL_PINS) {
    const user = await prisma.user.findFirst({ where: { companyId, email: person.email }, select: { id: true } })
    if (!user) continue
    const pinHash = await bcrypt.hash(person.pin, 10)
    const locked = person.email === "farai.till@bottlestore.test"
    const state = {
      companyId,
      pinHash,
      failedAttempts: locked ? 5 : 0,
      lockedUntil: locked ? new Date(now - 2 * 60_000 + 15 * 60_000) : null,
      mustChange: false,
      issuedById: null,
      lastUnlockedAt: used[person.email] ?? null,
    }
    await prisma.retailTillPin.upsert({ where: { userId: user.id }, update: state, create: { userId: user.id, ...state } })
  }
  console.log(`  till PINs: ${TILL_PINS.map((person) => `${person.name} ${person.pin}`).join(", ")}`)
  await seedTillRules(companyId)
}

/**
 * ADM-02. Setup › Staff and PINs as the PeopleList board draws it, with the
 * test accounts of 98-decisions C-40: Tendai Sibanda stays the active stock
 * clerk and Ruvimbo Chari the bookkeeper who signs in
 * (`bookkeeper@bottlestore.test`), so the board's invited Ruvimbo is Tatenda
 * Gumbo here — a cashier at Borrowdale invited two days ago with a PIN, whose
 * link the run prints. Rufaro Ndlovu is the manager without access (C-44).
 * Farai Moyo works at Borrowdale and Harare Main Branch (C-42). Phones as the
 * board has them, in E.164. Each person's `RETAIL_PERSON.INVITED` is at
 * their `createdAt` (not the owner's), and Rufaro's removal at its day.
 * `--reset` takes away people an acceptance run added (deleted when nothing
 * else refers to them, else their access removed).
 */
async function seedPeople(input: {
  companyId: string
  mainSiteId: string
  borrowdaleId: string
  passwordHash: string
  reset: boolean
}) {
  const { companyId, mainSiteId, borrowdaleId, passwordHash } = input
  type Seeded = {
    email: string | null
    name: string
    role: "SUPERADMIN" | "MANAGER" | "CASHIER" | "STOCK_CLERK" | "FINANCE_OFFICER"
    sites: string[] | "ALL"
    phone: string
    removedDaysAgo?: number
  }
  const PEOPLE: Seeded[] = [
    { email: "owner@bottlestore.test", name: "Tendai Mhlanga", role: "SUPERADMIN", sites: "ALL", phone: "+263774120098" },
    { email: "tafara.manager@bottlestore.test", name: "Tafara Nyathi", role: "MANAGER", sites: [mainSiteId], phone: "+263773012290" },
    { email: "chipo.till@bottlestore.test", name: "Chipo Dube", role: "CASHIER", sites: [mainSiteId], phone: "+263712204410" },
    { email: "kuda.till@bottlestore.test", name: "Kuda Banda", role: "CASHIER", sites: [mainSiteId], phone: "+263785510921" },
    { email: "rudo.stock@bottlestore.test", name: "Rudo Moyo", role: "STOCK_CLERK", sites: "ALL", phone: "+263771182044" },
    { email: "farai.till@bottlestore.test", name: "Farai Moyo", role: "CASHIER", sites: [borrowdaleId, mainSiteId], phone: "+263719027713" },
    { email: "bookkeeper@bottlestore.test", name: "Ruvimbo Chari", role: "FINANCE_OFFICER", sites: "ALL", phone: "+263775510283" },
    { email: "tendai.stock@bottlestore.test", name: "Tendai Sibanda", role: "STOCK_CLERK", sites: "ALL", phone: "+263776401187" },
    { email: "rufaro.manager@bottlestore.test", name: "Rufaro Ndlovu", role: "MANAGER", sites: [mainSiteId], phone: "+263713305521", removedDaysAgo: 19 },
    { email: null, name: "Tatenda Gumbo", role: "CASHIER", sites: [borrowdaleId], phone: "+263782206614" },
  ]
  const owner = await prisma.user.findFirstOrThrow({ where: { companyId, email: "owner@bottlestore.test" }, select: { id: true } })
  const ownerActor = { companyId, userId: owner.id, userName: "Tendai Mhlanga", userRole: "SUPERADMIN" }
  const personRole: Record<Seeded["role"], string> = {
    SUPERADMIN: "OWNER",
    MANAGER: "MANAGER",
    CASHIER: "CASHIER",
    STOCK_CLERK: "STOCK_CLERK",
    FINANCE_OFFICER: "BOOKKEEPER",
  }
  const siteName = (id: string) => (id === mainSiteId ? "Harare Main Branch" : "Borrowdale")
  const keep: string[] = []
  let link: string | null = null

  for (const person of PEOPLE) {
    const found = person.email
      ? await prisma.user.findFirst({ where: { email: person.email }, select: { id: true, createdAt: true } })
      : await prisma.user.findFirst({ where: { companyId, phone: person.phone }, select: { id: true, createdAt: true } })
    const removedAt = person.removedDaysAgo ? harareTime(person.removedDaysAgo, 9, 15) : null
    const data = {
      name: person.name,
      role: person.role,
      companyId,
      phone: person.phone,
      allSites: person.sites === "ALL",
      isActive: !removedAt,
      accessRemovedAt: removedAt,
      accessRemovedById: removedAt ? owner.id : null,
    }
    const invitedAt = person.email ? null : harareTime(2, 10, 0)
    const user = found
      ? await prisma.user.update({ where: { id: found.id }, data, select: { id: true, createdAt: true } })
      : await prisma.user.create({
          data: { ...data, email: person.email, password: person.email ? passwordHash : null, ...(invitedAt ? { createdAt: invitedAt } : {}) },
          select: { id: true, createdAt: true },
        })
    keep.push(user.id)
    await prisma.userSiteAccess.deleteMany({ where: { userId: user.id } })
    if (person.sites !== "ALL") {
      await prisma.userSiteAccess.createMany({ data: person.sites.map((siteId) => ({ userId: user.id, siteId, companyId })) })
    }

    // The one still to join: a link for 7 days from two days ago, and a PIN sent with it.
    if (invitedAt) {
      const waiting = await prisma.retailStaffInvite.findFirst({ where: { userId: user.id, acceptedAt: null, revokedAt: null } })
      if (!waiting || input.reset) {
        await prisma.retailStaffInvite.deleteMany({ where: { userId: user.id } })
        const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "")
        await prisma.retailStaffInvite.create({
          data: {
            companyId,
            userId: user.id,
            invitedById: owner.id,
            tokenHash: hashInviteToken(token),
            sentTo: person.phone,
            expiresAt: new Date(invitedAt.getTime() + INVITE_DAYS * 86_400_000),
            createdAt: invitedAt,
          },
        })
        const bcrypt = await import("bcryptjs")
        const pinHash = await bcrypt.hash("8257", 10)
        const pin = { companyId, pinHash, failedAttempts: 0, lockedUntil: null, mustChange: true, issuedById: owner.id, issuedAt: invitedAt, lastUnlockedAt: null }
        await prisma.retailTillPin.upsert({ where: { userId: user.id }, update: pin, create: { userId: user.id, ...pin } })
        link = `/join/${token}`
      }
    }

    // Their invite, at the moment they were added (the owner was there first).
    if (person.role !== "SUPERADMIN") {
      const invited = await prisma.platformAuditEvent.findFirst({
        where: { companyId, entityId: user.id, eventType: RETAIL_AUDIT_EVENTS.personInvited },
        select: { id: true },
      })
      if (!invited) {
        await writeRetailAuditEvent(prisma, {
          actor: ownerActor,
          eventType: RETAIL_AUDIT_EVENTS.personInvited,
          entityType: "User",
          entityId: user.id,
          payload: {
            name: person.name,
            role: personRole[person.role],
            sites: person.sites === "ALL" ? ["All sites"] : person.sites.map(siteName),
            pin: person.role !== "FINANCE_OFFICER",
            email: Boolean(person.email),
          },
        })
        const written = await prisma.platformAuditEvent.findFirst({
          where: { companyId, entityId: user.id, eventType: RETAIL_AUDIT_EVENTS.personInvited },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        })
        if (written) await prisma.platformAuditEvent.update({ where: { id: written.id }, data: { createdAt: user.createdAt } })
      }
    }
    if (removedAt) {
      await prisma.retailTillPin.deleteMany({ where: { userId: user.id } })
      const removed = await prisma.platformAuditEvent.findFirst({
        where: { companyId, entityId: user.id, eventType: RETAIL_AUDIT_EVENTS.personAccessRemoved },
        select: { id: true },
      })
      if (!removed) {
        await writeRetailAuditEvent(prisma, {
          actor: ownerActor,
          eventType: RETAIL_AUDIT_EVENTS.personAccessRemoved,
          entityType: "User",
          entityId: user.id,
          payload: { closedShifts: [] },
        })
        const written = await prisma.platformAuditEvent.findFirst({
          where: { companyId, entityId: user.id, eventType: RETAIL_AUDIT_EVENTS.personAccessRemoved },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        })
        if (written) await prisma.platformAuditEvent.update({ where: { id: written.id }, data: { createdAt: removedAt } })
      }
    }
  }

  // People an acceptance run added: gone when nothing refers to them, else without access.
  if (input.reset) {
    const extra = await prisma.user.findMany({
      where: {
        companyId,
        id: { notIn: keep },
        role: { in: ["SUPERADMIN", "MANAGER", "SHOP_MANAGER", "CASHIER", "STOCK_CLERK", "FINANCE_OFFICER"] },
        OR: [{ staffInvites: { some: {} } }, { email: null }],
      },
      select: { id: true, name: true },
    })
    for (const person of extra) {
      try {
        await prisma.user.delete({ where: { id: person.id } })
      } catch {
        await prisma.user.update({
          where: { id: person.id },
          data: { isActive: false, accessRemovedAt: new Date(), accessRemovedById: owner.id },
        })
        await prisma.retailTillPin.deleteMany({ where: { userId: person.id } })
      }
    }
    if (extra.length) console.log(`  people: ${extra.map((person) => person.name).join(", ")} taken away (acceptance)`)
  }
  console.log(
    `  people: ${PEOPLE.length} on Staff and PINs; Tatenda Gumbo's PIN 8257` +
      (link ? `, join link ${link} on the shop's host` : ", invite already out"),
  )
}

/**
 * Till rules (SET-06, board TillRules): the board's values, which are the
 * defaults, last changed by Tafara Nyathi on 28 September — so the page's
 * footer reads "Last changed by Tafara Nyathi, 28 September." Saves of the
 * page that test runs left are cleared, so every run puts it back.
 */
async function seedTillRules(companyId: string) {
  const tafara = await prisma.user.findFirst({
    where: { companyId, email: "tafara.manager@bottlestore.test" },
    select: { id: true },
  })
  const rules = {
    refundPinOver: new Prisma.Decimal(20),
    voidPin: "ALWAYS" as const,
    refundReasons: ["Damaged", "Wrong item", "Changed mind", "Overcharged"],
    voidReasons: ["Rang up wrong", "Customer left", "Test sale"],
    splitTender: true,
    referenceRequired: true,
    maxCashierDiscountPercent: new Prisma.Decimal(10),
    drawerOpenWithoutSale: false,
    cashDropPromptOver: new Prisma.Decimal(500),
    offlineHours: 24,
    updatedById: tafara?.id ?? null,
  }
  await prisma.retailTillRules.upsert({ where: { companyId }, update: rules, create: { companyId, ...rules } })
  const changedAt = new Date("2026-09-28T16:12:00+02:00")
  await prisma.$executeRaw`UPDATE "RetailTillRules" SET "updatedAt" = ${changedAt} WHERE "companyId" = ${companyId}`
  await prisma.platformAuditEvent.deleteMany({
    where: { companyId, entityType: "RetailSettings", entityId: "till-rules", eventType: RETAIL_AUDIT_EVENTS.settingsChanged },
  })
  console.log("  till rules: the board's, last changed by Tafara Nyathi on 28 September")
}

/**
 * The stock area's people (30-stock 3.5): Rudo Moyo, the stock clerk who
 * counts on her phone and receives at Borrowdale. Upserted by her email, so
 * the admin seed and this one converge.
 */
async function seedStockPeople(companyId: string, passwordHash: string) {
  const rudo = { name: "Rudo Moyo", role: "STOCK_CLERK" as const, phone: "+263 77 118 2044", companyId, isActive: true }
  await prisma.user.upsert({
    where: { email: "rudo.stock@bottlestore.test" },
    update: rudo,
    create: { email: "rudo.stock@bottlestore.test", password: passwordHash, ...rudo },
  })
}

/**
 * What Borrowdale keeps besides Bohlinger's: 664 units with its 96, before
 * TRF-0008 arrives. Borrowdale sells nothing in the seeded history, so each
 * line holds at least what the transfers below brought in.
 */
const BORROWDALE_STOCK: Array<[code: string, onHand: number]> = [
  ["AMARULA-750", 6],
  ["JAMESON-750", 2],
  ["GORDONS-750", 4],
  ["ICE-2KG", 20],
  ["CASTLE-340", 240],
  ["COKE-500", 150],
  ["CHIBUKU-1L", 146],
]

type SeedTransfer = {
  no: string
  from: "HRE" | "BDL"
  sentAt: Date
  sentBy: string
  /** Received at, by whom; absent while on the way. */
  received?: { at: Date; by: string }
  lines: Array<[code: string, sent: number, lost?: number]>
  moving?: { vehicle: string; driver: string; note: string; arrives: string }
}

/**
 * STK-07. Transfers as the TransfersList board shows them, between Harare
 * Main Branch (HRE) and Borrowdale (BDL): TRF-0006 (Borrowdale's ice, 2 bags
 * lost on the way), TRF-0007 (spirits, received by Rudo Moyo 37 minutes after
 * it left) and TRF-0008 on the way this morning, with five older ones for the
 * months before. Each leg is a `TRANSFER_OUT`/`TRANSFER_IN` movement; the
 * ledger seed after this one works each line's opening back from its on
 * hand, so Harare Main Branch still holds the catalogue's figures after
 * sending. Every run starts again from these: what an acceptance run sent
 * (and its movements) goes, and Borrowdale's lines are set back.
 */
async function seedTransfers(input: { companyId: string; mainSiteId: string; borrowdaleId: string; reset: boolean }) {
  const { companyId, mainSiteId, borrowdaleId } = input
  const people = await prisma.user.findMany({
    where: { companyId, email: { in: ["tafara.manager@bottlestore.test", "rudo.stock@bottlestore.test"] } },
    select: { id: true, email: true },
  })
  const tafara = people.find((person) => person.email.startsWith("tafara"))?.id
  const rudo = people.find((person) => person.email.startsWith("rudo"))?.id
  if (!tafara || !rudo) {
    console.log("  transfers: Tafara Nyathi or Rudo Moyo missing, skipped")
    return
  }

  await prisma.stockMovement.deleteMany({
    where: { sourceType: "RETAIL_STOCK_TRANSFER", reason: { in: ["TRANSFER_OUT", "TRANSFER_IN", "TRANSFER_BACK"] }, item: { site: { companyId } } },
  })
  await prisma.retailStockTransfer.deleteMany({ where: { companyId } })
  // STK-08: what the gone transfers wrote — their Activity, and the losses an acceptance run wrote off.
  await prisma.platformAuditEvent.deleteMany({ where: { companyId, entityType: "RetailStockTransfer" } })
  const losses = { companyId, sourceType: "RETAIL_STOCK_ADJUSTMENT" as const, description: { startsWith: "Lost on the way, TRF-" } }
  await prisma.journalEntry.deleteMany({ where: losses })
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId, sourceType: "RETAIL_STOCK_ADJUSTMENT", sourceId: { contains: ":lost:" } } })
  // Their "sent" and "cancelled" notices would open transfers that are gone.
  const notices = { companyId, type: { in: ["RETAIL_TRANSFER_SENT", "RETAIL_TRANSFER_CANCELLED"] as NotificationType[] } }
  await prisma.notificationRecipient.deleteMany({ where: { notification: notices } })
  await prisma.notification.deleteMany({ where: notices })

  const bdlFloor = await prisma.stockLocation.findUniqueOrThrow({ where: { siteId_code: { siteId: borrowdaleId, code: "SHOP" } } })
  const hreLines = await prisma.inventoryItem.findMany({
    where: { siteId: mainSiteId },
    select: { id: true, itemCode: true, name: true, unit: true, unitCost: true, productId: true },
  })
  const hre = new Map(hreLines.map((line) => [line.itemCode, line]))
  const keepAtBdl = new Set(["BOHLINGER-330", ...BORROWDALE_STOCK.map(([code]) => code)])
  for (const [code, onHand] of BORROWDALE_STOCK) {
    const home = hre.get(code)
    if (!home) throw new Error(`The transfers seed needs ${code} at Harare Main Branch.`)
    const line = { name: home.name, unit: home.unit, unitCost: home.unitCost, productId: home.productId, currentStock: quantity(onHand), locationId: bdlFloor.id }
    await prisma.inventoryItem.upsert({
      where: { siteId_itemCode: { siteId: borrowdaleId, itemCode: code } },
      update: line,
      create: { siteId: borrowdaleId, itemCode: code, category: "OTHER", ...line },
    })
  }
  // Lines an acceptance run made at Borrowdale by receiving something else.
  const strays = await prisma.inventoryItem.findMany({
    where: { siteId: borrowdaleId, itemCode: { notIn: [...keepAtBdl] } },
    select: { id: true, name: true },
  })
  for (const stray of strays) {
    try {
      await prisma.$transaction([
        prisma.stockMovement.deleteMany({ where: { itemId: stray.id } }),
        prisma.inventoryItem.delete({ where: { id: stray.id } }),
      ])
    } catch {
      await prisma.inventoryItem.update({ where: { id: stray.id }, data: { currentStock: quantity(0) } })
    }
  }
  const bdlLines = await prisma.inventoryItem.findMany({
    where: { siteId: borrowdaleId },
    select: { id: true, itemCode: true, name: true, unit: true, unitCost: true, productId: true },
  })
  const bdl = new Map(bdlLines.map((line) => [line.itemCode, line]))

  const sentToday = new Date(Math.min(harareTime(0, 8, 30).getTime(), Date.now() - 60 * 1000))
  const older = (days: number, hour: number, minute: number) => harareTime(days, hour, minute)
  const transfers: SeedTransfer[] = [
    { no: "TRF-0001", from: "HRE", sentAt: older(205, 9, 40), sentBy: tafara, received: { at: older(205, 11, 5), by: rudo }, lines: [["CASTLE-340", 48], ["COKE-500", 24]] },
    { no: "TRF-0002", from: "HRE", sentAt: older(175, 14, 10), sentBy: tafara, received: { at: older(175, 15, 0), by: rudo }, lines: [["CHIBUKU-1L", 60]] },
    { no: "TRF-0003", from: "BDL", sentAt: older(145, 10, 20), sentBy: rudo, received: { at: older(145, 12, 30), by: tafara }, lines: [["CASTLE-340", 24]] },
    { no: "TRF-0004", from: "HRE", sentAt: older(90, 8, 50), sentBy: tafara, received: { at: older(90, 10, 15), by: rudo }, lines: [["CASTLE-340", 24], ["COKE-500", 24]] },
    { no: "TRF-0005", from: "HRE", sentAt: older(55, 13, 5), sentBy: tafara, received: { at: older(55, 14, 20), by: rudo }, lines: [["AMARULA-750", 2], ["GORDONS-750", 2]] },
    { no: "TRF-0006", from: "BDL", sentAt: older(8, 16, 20), sentBy: rudo, received: { at: older(8, 18, 5), by: tafara }, lines: [["ICE-2KG", 46, 2]] },
    {
      no: "TRF-0007",
      from: "HRE",
      sentAt: older(4, 12, 3),
      sentBy: tafara,
      received: { at: older(4, 12, 40), by: rudo },
      lines: [["AMARULA-750", 4], ["JAMESON-750", 2], ["GORDONS-750", 2]],
    },
    {
      no: "TRF-0008",
      from: "HRE",
      sentAt: sentToday,
      sentBy: tafara,
      lines: [["CASTLE-340", 240], ["COKE-500", 120], ["CHIBUKU-1L", 120], ["FANTA-500", 60]],
      moving: { vehicle: "Shop bakkie, AEZ 4471", driver: "Simba Mutasa", note: "For the weekend at Borrowdale", arrives: "Today, by 11:00" },
    },
  ]

  const movements: Prisma.StockMovementCreateManyInput[] = []
  const written: Array<{ id: string; spec: SeedTransfer }> = []
  for (const spec of transfers) {
    const [fromLines, toLines] = spec.from === "HRE" ? [hre, bdl] : [bdl, hre]
    const [fromSiteId, toSiteId] = spec.from === "HRE" ? [mainSiteId, borrowdaleId] : [borrowdaleId, mainSiteId]
    const legs = spec.lines.map(([code, sent, lost = 0]) => {
      const from = fromLines.get(code)
      const to = toLines.get(code)
      if (!from?.productId || (spec.received && !to)) throw new Error(`The transfers seed cannot move ${code} on ${spec.no}.`)
      return { code, sent, lost, received: spec.received ? sent - lost : 0, from, to: spec.received ? to! : null }
    })
    const transfer = await prisma.retailStockTransfer.create({
      data: {
        companyId,
        transferNo: spec.no,
        fromSiteId,
        toSiteId,
        status: spec.received ? "RECEIVED" : "ON_THE_WAY",
        sentAt: spec.sentAt,
        sentById: spec.sentBy,
        driver: spec.moving?.driver ?? null,
        vehicle: spec.moving?.vehicle ?? null,
        arrives: spec.moving?.arrives ?? null,
        note: spec.moving?.note ?? null,
        receivedAt: spec.received?.at ?? null,
        receivedById: spec.received?.by ?? null,
        createdAt: spec.sentAt,
        lines: {
          // A moment apart, so the record lists them in the order they were packed.
          create: legs.map((leg, index) => ({
            companyId,
            createdAt: new Date(spec.sentAt.getTime() + index),
            productId: leg.from.productId!,
            fromItemId: leg.from.id,
            toItemId: leg.to?.id ?? null,
            quantitySent: quantity(leg.sent),
            quantityReceived: quantity(leg.received),
            quantityLost: quantity(leg.lost),
            unitCost: money(leg.from.unitCost ?? 0),
          })),
        },
      },
      select: { id: true, lines: { select: { id: true, fromItemId: true } } },
    })
    written.push({ id: transfer.id, spec })
    const lineId = new Map(transfer.lines.map((line) => [line.fromItemId, line.id]))
    const toName = spec.from === "HRE" ? "Borrowdale" : "Harare Main Branch"
    const fromName = spec.from === "HRE" ? "Harare Main Branch" : "Borrowdale"
    for (const leg of legs) {
      movements.push({
        itemId: leg.from.id,
        movementType: "ISSUE",
        quantity: quantity(leg.sent),
        unit: leg.from.unit,
        issuedById: spec.sentBy,
        notes: `Transfer to ${toName}`,
        sourceType: "RETAIL_STOCK_TRANSFER",
        sourceId: `${transfer.id}:${lineId.get(leg.from.id)}`,
        reason: "TRANSFER_OUT",
        reference: spec.no,
        change: quantity(-leg.sent),
        createdAt: spec.sentAt,
        referenceId: "",
      })
      if (leg.to && leg.received > 0) {
        movements.push({
          itemId: leg.to.id,
          movementType: "RECEIPT",
          quantity: quantity(leg.received),
          unit: leg.to.unit,
          issuedById: spec.received!.by,
          notes: `Transfer from ${fromName}`,
          sourceType: "RETAIL_STOCK_TRANSFER",
          sourceId: `${transfer.id}:${lineId.get(leg.from.id)}:in`,
          reason: "TRANSFER_IN",
          reference: spec.no,
          change: quantity(leg.received),
          createdAt: spec.received!.at,
          referenceId: "",
        })
      }
    }
  }
  // Movement numbers from the global sequence, one block under its lock.
  const first = await prisma.$transaction(async (tx) => {
    const reserved = await reserveIdentifier(tx, { companyId, entity: "STOCK_MOVEMENT" })
    await tx.globalIdSequence.update({
      where: { entityKey_scopeKey: { entityKey: "STOCK_MOVEMENT", scopeKey: "GLOBAL" } },
      data: { lastNumber: { increment: movements.length - 1 } },
    })
    return Number(reserved.split("-").pop())
  })
  movements.forEach((row, index) => {
    row.referenceId = `${ID_ENTITY_CONFIG.STOCK_MOVEMENT.prefix}-${String(first + index).padStart(4, "0")}`
  })
  await prisma.stockMovement.createMany({ data: movements })
  await prisma.idSequence.upsert({
    where: { companyId_entityKey_scopeKey: { companyId, entityKey: "RETAIL_STOCK_TRANSFER", scopeKey: "GLOBAL" } },
    update: { lastNumber: transfers.length },
    create: { companyId, entityKey: "RETAIL_STOCK_TRANSFER", scopeKey: "GLOBAL", lastNumber: transfers.length },
  })
  console.log(`  transfers: ${transfers.length} between Harare Main Branch and Borrowdale, ${movements.length} movement(s)`)
  await seedTransferActivity({ companyId, written, names: { [tafara]: "Tafara Nyathi", [rudo]: "Rudo Moyo" } })
}

/**
 * STK-08. Each transfer's Activity as sending and receiving it wrote it:
 * "Sent 540 units to Borrowdale", "Received at Harare Main Branch: 44 units,
 * 2 lost on the way", and on TRF-0008 Tafara Nyathi's vehicle, set four
 * minutes after it left (the TransferRecord board's "Activity 2").
 */
async function seedTransferActivity(input: {
  companyId: string
  written: Array<{ id: string; spec: SeedTransfer }>
  names: Record<string, string>
}) {
  const { companyId, written, names } = input
  const actor = (userId: string) => ({ companyId, userId, userName: names[userId] ?? null, userRole: null })
  const stamp = async (entityId: string, eventType: string, at: Date) => {
    const latest = await prisma.platformAuditEvent.findFirst({
      where: { companyId, entityId, eventType },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })
    if (latest) await prisma.platformAuditEvent.update({ where: { id: latest.id }, data: { createdAt: at } })
  }
  let events = 0
  for (const { id, spec } of written) {
    const [fromName, toName] = spec.from === "HRE" ? ["Harare Main Branch", "Borrowdale"] : ["Borrowdale", "Harare Main Branch"]
    const units = spec.lines.reduce((sum, [, sent]) => sum + sent, 0)
    const lost = spec.lines.reduce((sum, [, , gone = 0]) => sum + gone, 0)
    await writeRetailAuditEvent(prisma, {
      actor: actor(spec.sentBy),
      eventType: RETAIL_AUDIT_EVENTS.transferSent,
      entityType: "RetailStockTransfer",
      entityId: id,
      payload: { transferNo: spec.no, lines: spec.lines.length, units, from: fromName, to: toName },
    })
    await stamp(id, RETAIL_AUDIT_EVENTS.transferSent, spec.sentAt)
    events += 1
    if (spec.received) {
      await writeRetailAuditEvent(prisma, {
        actor: actor(spec.received.by),
        eventType: RETAIL_AUDIT_EVENTS.transferReceived,
        entityType: "RetailStockTransfer",
        entityId: id,
        payload: { transferNo: spec.no, to: toName, received: units - lost, lost, stillComing: 0 },
      })
      await stamp(id, RETAIL_AUDIT_EVENTS.transferReceived, spec.received.at)
      events += 1
    }
    if (spec.moving) {
      await auditRecordEdited(prisma, {
        actor: actor(spec.sentBy),
        entityType: "RetailStockTransfer",
        entityId: id,
        field: "vehicle",
        label: "Vehicle",
        from: null,
        to: spec.moving.vehicle,
      })
      await stamp(id, RETAIL_AUDIT_EVENTS.recordEdited, new Date(Math.min(spec.sentAt.getTime() + 4 * 60 * 1000, Date.now())))
      events += 1
    }
  }
  console.log(`  ${events} transfer activity events`)
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
 * PRD-02: the liquor set as the Categories board shows it — VAT included (15.5%, ZIMRA's rate),
 * the 18+ check on the four alcohol categories, the board's target margins,
 * top level, stamped as the liquor store's seed and out of the bin. With
 * --reset a category a test run added goes: deleted when nothing is filed
 * under it, else to the bin (the catalogue below files every line again).
 */
async function seedCategories(companyId: string, reset: boolean) {
  const seeds = CATEGORY_SEEDS.LIQUOR
  const kept: string[] = []
  for (const seed of seeds) {
    // The live one by that name, else the latest in the bin (brought back).
    const row = await prisma.retailCategory.findFirst({
      where: { companyId, name: { equals: seed.name, mode: "insensitive" } },
      orderBy: [{ archivedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
      select: { id: true },
    })
    if (!row) throw new Error(`The ${seed.name} category was not seeded.`)
    kept.push(row.id)
    await prisma.retailCategory.update({
      where: { id: row.id },
      data: {
        name: seed.name,
        // The shelf's rate, which ZIMRA maps, not the seed's 15% (SET-08).
        vatRate: money(VAT_PERCENT),
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
  const others = await prisma.retailCategory.findMany({
    where: { companyId, id: { notIn: kept } },
    select: { id: true, _count: { select: { products: true } } },
  })
  await prisma.retailCategory.updateMany({ where: { companyId, id: { notIn: kept } }, data: { parentId: null } })
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
/**
 * ADM-07: the bin as the BinList board shows it — Nederburg Rosé 750ml, a
 * wine the shop stopped stocking, moved to the bin by Tendai Mhlanga today at
 * 09:02 through the product's own move (one minute before the run when that
 * is earlier). The board's PO-0029 (an order, BUY-02) and "Happy hour (old)"
 * (a price list, PRD-05) join when those kinds can go in the bin; T. Marange
 * is not merged here. With --reset anything else in the bin — what test runs
 * left — goes for good, so the bin reads as the board does.
 */
async function seedBin(input: { companyId: string; siteId: string; locationId: string; wineId: string | null; reset: boolean }) {
  const { companyId } = input
  const owner = await prisma.user.findFirst({ where: { companyId, role: "SUPERADMIN" }, select: { id: true, name: true } })
  if (!owner) {
    console.log("  bin: no owner to move Nederburg Rosé, skipped")
    return
  }
  const actor = { companyId, userId: owner.id, userName: owner.name, userRole: "SUPERADMIN" }
  const code = "NEDERBURG-ROSE-750"
  const item =
    (await prisma.inventoryItem.findFirst({ where: { siteId: input.siteId, itemCode: code }, select: { id: true } })) ??
    (await prisma.inventoryItem.create({
      data: {
        itemCode: code,
        name: "Nederburg Rosé 750ml",
        category: "OTHER",
        unit: "bottle",
        siteId: input.siteId,
        locationId: input.locationId,
        currentStock: quantity(12),
        minStock: quantity(6),
        reorderQty: quantity(12),
        unitCost: 9.4,
      },
      select: { id: true },
    }))
  const existing = await prisma.product.findFirst({ where: { companyId, code }, select: { id: true, archivedAt: true } })
  const at = new Date(Math.min(harareTime(0, 9, 2).getTime(), Date.now() - 60_000))

  // Already in the bin today by the owner's own move: nothing to do.
  if (existing?.archivedAt) {
    const binned = await prisma.platformAuditEvent.findFirst({
      where: { companyId, entityType: "Product", entityId: existing.id, eventType: RETAIL_AUDIT_EVENTS.recordBinned },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    })
    if (binned && binned.createdAt.getTime() === existing.archivedAt.getTime() && existing.archivedAt.getTime() === at.getTime()) {
      console.log("  bin: Nederburg Rosé 750ml already in the bin")
    } else {
      await prisma.product.update({ where: { id: existing.id }, data: { archivedAt: null } })
    }
  }
  const current = existing ? await prisma.product.findUniqueOrThrow({ where: { id: existing.id }, select: { archivedAt: true } }) : null
  if (!current?.archivedAt) {
    const productId = await upsertShelfListing({
      companyId,
      productId: existing?.id ?? null,
      sku: code,
      name: "Nederburg Rosé 750ml",
      inventoryItemId: item.id,
      unitPrice: money("12.60"),
      taxPercent: money(VAT_PERCENT),
      categoryId: input.wineId,
      costPrice: money("9.40"),
    })
    await moveToBin(actor, { kind: "product", id: productId }, at)
    const event = await prisma.platformAuditEvent.findFirst({
      where: { companyId, entityType: "Product", entityId: productId, eventType: RETAIL_AUDIT_EVENTS.recordBinned },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })
    if (event) await prisma.platformAuditEvent.update({ where: { id: event.id }, data: { createdAt: at } })
    console.log("  bin: Nederburg Rosé 750ml moved to the bin by Tendai Mhlanga")
  }

  if (input.reset) {
    const strays = (await listBinEntries(companyId)).filter((entry) => !(entry.kind === "product" && entry.name === "Nederburg Rosé 750ml"))
    if (strays.length) {
      const gone = await deleteFromBinForGood(
        actor,
        strays.map((entry) => ({ kind: entry.kind, id: entry.id })),
      )
      console.log(`  bin: ${strays.length} left by test runs gone for good (${gone.deleted} deleted, ${gone.kept} kept)`)
    }
  }
}

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

/**
 * SET-05. Setup › Payments as the board draws it: every tender on but
 * InnBucks, the rate by hand rounded to the nearest 1, EcoCash merchant
 * "0921 774" showing as "HARARE BOTTLE", and today's ZiG rate 26.80 set at
 * 07:30 by the owner (Tendai Mhlanga) over 2 October's 26.95 — so the save
 * bar reads "Rate changed by Tendai Mhlanga today at 07:30." (run before
 * 07:30, the rate is yesterday's 07:30 one). Every run puts
 * the page back the way the board has it: rates, saves and rate events on
 * Payments that test runs left are cleared first.
 */
async function seedPayments(companyId: string) {
  const owner = await prisma.user.findFirst({ where: { companyId, role: "SUPERADMIN" }, select: { id: true, name: true } })
  if (!owner) {
    console.log("  payments: no owner to set the rate, skipped")
    return
  }
  const settings = {
    takeCashUsd: true,
    takeCashZig: true,
    takeCard: true,
    takeEcocash: true,
    takeInnbucks: false,
    takeBankTransfer: true,
    takeOnAccount: true,
    takeVouchers: true,
    zigRateSource: "MANUAL" as const,
    zigChangeRounding: new Prisma.Decimal(1),
    ecocashMerchantCode: "0921 774",
    ecocashDisplayName: "HARARE BOTTLE",
    updatedById: owner.id,
  }
  await prisma.retailPaymentSettings.upsert({ where: { companyId }, update: settings, create: { companyId, ...settings } })

  await prisma.currencyRate.deleteMany({ where: { companyId, baseCurrency: "USD", quoteCurrency: "ZWG" } })
  await prisma.platformAuditEvent.deleteMany({
    where: {
      companyId,
      entityType: "RetailSettings",
      entityId: "payments",
      eventType: { in: [RETAIL_AUDIT_EVENTS.settingsChanged, RETAIL_AUDIT_EVENTS.zigRateSet] },
    },
  })
  // The latest 07:30 in Harare that has passed: this morning's, or yesterday's
  // when the seed runs before it (a rate set in the future would not apply yet).
  const morning = harareTime(0, 7, 30).getTime() <= Date.now() ? harareTime(0, 7, 30) : harareTime(1, 7, 30)
  const rates = [
    { rate: 26.95, at: new Date("2026-10-02T07:25:00+02:00"), previous: null },
    { rate: Number(ZWG_RATE), at: morning, previous: "26.95" },
  ]
  for (const entry of rates) {
    await prisma.currencyRate.create({
      data: {
        companyId,
        baseCurrency: "USD",
        quoteCurrency: "ZWG",
        rate: entry.rate,
        effectiveDate: entry.at,
        createdAt: entry.at,
        createdById: owner.id,
        source: "MANUAL",
      },
    })
    await writeRetailAuditEvent(prisma, {
      actor: { companyId, userId: owner.id, userName: owner.name, userRole: "SUPERADMIN" },
      eventType: RETAIL_AUDIT_EVENTS.zigRateSet,
      entityType: "RetailSettings",
      entityId: "payments",
      payload: { rate: entry.rate.toFixed(2), previous: entry.previous, source: "MANUAL" },
    })
    const written = await prisma.platformAuditEvent.findFirst({
      where: { companyId, eventType: RETAIL_AUDIT_EVENTS.zigRateSet, entityId: "payments" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })
    if (written) await prisma.platformAuditEvent.update({ where: { id: written.id }, data: { createdAt: entry.at } })
  }
  console.log(`  payments: all tenders on but InnBucks, ZiG ${ZWG_RATE} set by ${owner.name}`)
}

/**
 * SET-09. Setup › Posting to the books as the board draws it, over the
 * tenant's own chart: the Zimbabwe retail pack applied (so "1001 Till cash,
 * ZiG" and "2250 Vouchers issued" are there and every role has its account),
 * each tender that is on mapped — US dollar cash to 1000, ZiG cash to 1001,
 * vouchers to 2250 — posting at the end of each day, last changed by the
 * owner on 1 September, and last night's 23:00 run: 412 sales, 6 deliveries,
 * 1 count. Every run puts the page back the way the board has it: runs, saves
 * and accounts that test runs left are cleared first.
 */
/**
 * SET-07. Setup › Receipts as the ReceiptSettings board draws it: the shop's
 * name and street on top, the deposit and age lines at the bottom, the VAT
 * and licence numbers on, no logo, one copy, also sent on WhatsApp — saved
 * by the owner (Tendai Mhlanga) on 12 September, which the save bar reads.
 */
async function seedReceipts(companyId: string) {
  const owner = await prisma.user.findFirst({ where: { companyId, role: "SUPERADMIN" }, select: { id: true, name: true } })
  if (!owner) {
    console.log("  receipts: no owner, skipped")
    return
  }
  const settings = {
    header: "HARARE BOTTLE STORE\n14 Samora Machel Ave",
    footer: "Bring the bottles back for your deposit.\nNot for sale to persons under 18.",
    showVatNumber: true,
    showLicenceNumber: true,
    printLogo: false,
    copies: 1,
    alsoSendBy: "WHATSAPP" as const,
    updatedById: owner.id,
  }
  await prisma.retailReceiptSettings.upsert({ where: { companyId }, update: settings, create: { companyId, ...settings } })
  const changedAt = new Date("2026-09-12T11:20:00+02:00")
  await prisma.$executeRaw`UPDATE "RetailReceiptSettings" SET "updatedAt" = ${changedAt} WHERE "companyId" = ${companyId}`
  await prisma.platformAuditEvent.deleteMany({
    where: { companyId, entityType: "RetailSettings", entityId: "receipts", eventType: RETAIL_AUDIT_EVENTS.settingsChanged },
  })
  await writeRetailAuditEvent(prisma, {
    actor: { companyId, userId: owner.id, userName: owner.name, userRole: "SUPERADMIN" },
    eventType: RETAIL_AUDIT_EVENTS.settingsChanged,
    entityType: "RetailSettings",
    entityId: "receipts",
    payload: {
      page: "receipts",
      changes: [
        { field: "footer", label: "Bottom of the receipt", from: "", to: settings.footer },
        { field: "alsoSendBy", label: "Also send by", from: "Nothing", to: "WhatsApp" },
      ],
    },
  })
  const saved = await prisma.platformAuditEvent.findFirst({
    where: { companyId, eventType: RETAIL_AUDIT_EVENTS.settingsChanged, entityId: "receipts" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (saved) await prisma.platformAuditEvent.update({ where: { id: saved.id }, data: { createdAt: changedAt } })
  console.log("  receipts: the board's top and bottom, WhatsApp on, last changed by the owner on 12 September")
}

async function seedPosting(companyId: string) {
  const owner = await prisma.user.findFirst({ where: { companyId, role: "SUPERADMIN" }, select: { id: true, name: true } })
  if (!owner) {
    console.log("  posting: no owner, skipped")
    return
  }
  await runAccountingSeedPack({ companyId, mode: "APPLY" })

  const accounts = await prisma.chartOfAccount.findMany({ where: { companyId }, select: { id: true, code: true } })
  const byCode = new Map(accounts.map((account) => [account.code, account.id]))
  const tenders: Array<[RetailTenderType, string | null, string]> = [
    ["CASH", "USD", "1000"],
    ["CASH", "ZWG", "1001"],
    ["CARD", null, "1015"],
    ["ECOCASH", null, "1016"],
    ["INNBUCKS", null, "1016"],
    ["TRANSFER", null, "1017"],
    ["ON_ACCOUNT", null, "1100"],
    ["VOUCHER", null, "2250"],
  ]
  for (const [tenderType, currency, code] of tenders) {
    const clearingAccountId = byCode.get(code)!
    const where = { companyId, tenderType, siteId: null, registerCode: null, currency }
    const existing = await prisma.tenderAccountMapping.findFirst({ where, select: { id: true } })
    if (existing) await prisma.tenderAccountMapping.update({ where: { id: existing.id }, data: { clearingAccountId, isActive: true } })
    else await prisma.tenderAccountMapping.create({ data: { ...where, clearingAccountId, isActive: true } })
  }
  for (const [role, code] of Object.entries(RETAIL_ROLE_ACCOUNT_CODES)) {
    const accountId = byCode.get(code)!
    await prisma.retailAccountRoleMapping.upsert({
      where: { companyId_role: { companyId, role: role as keyof typeof RETAIL_ROLE_ACCOUNT_CODES } },
      update: { accountId },
      create: { companyId, role: role as keyof typeof RETAIL_ROLE_ACCOUNT_CODES, accountId },
    })
  }
  // An account a test run quick-added, and nothing posted to it.
  await prisma.chartOfAccount.deleteMany({
    where: { companyId, code: "1012", journalLines: { none: {} }, tenderClearingMappings: { none: {} }, retailRoleMappings: { none: {} } },
  })

  await prisma.retailPostingSettings.upsert({
    where: { companyId },
    update: { schedule: "END_OF_DAY", updatedById: owner.id },
    create: { companyId, schedule: "END_OF_DAY", updatedById: owner.id },
  })
  await prisma.platformAuditEvent.deleteMany({
    where: {
      companyId,
      entityType: "RetailSettings",
      entityId: "posting",
      eventType: { in: [RETAIL_AUDIT_EVENTS.settingsChanged, RETAIL_AUDIT_EVENTS.postingRun, RETAIL_AUDIT_EVENTS.postingAccountAdded] },
    },
  })
  const changedAt = new Date("2026-09-01T10:15:00+02:00")
  await writeRetailAuditEvent(prisma, {
    actor: { companyId, userId: owner.id, userName: owner.name, userRole: "SUPERADMIN" },
    eventType: RETAIL_AUDIT_EVENTS.settingsChanged,
    entityType: "RetailSettings",
    entityId: "posting",
    payload: {
      page: "posting",
      changes: [{ field: "schedule", label: "Post", from: "With every sale", to: "At the end of each day" }],
    },
  })
  const saved = await prisma.platformAuditEvent.findFirst({
    where: { companyId, eventType: RETAIL_AUDIT_EVENTS.settingsChanged, entityId: "posting" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (saved) await prisma.platformAuditEvent.update({ where: { id: saved.id }, data: { createdAt: changedAt } })

  // What test runs of earlier builds left unable to post (a sale whose payments did not balance, two runs that
  // once clashed on an entry number): tried once more, and set aside if it still cannot post, so "Ready to post"
  // reads as the board has it. The error stays on the event.
  const stuck = { companyId, sourceType: { in: RETAIL_SOURCE_TYPES }, sourceId: { not: null }, status: "FAILED" as const }
  for (const event of await prisma.accountingIntegrationEvent.findMany({ where: stuck })) {
    await postIntegrationEvent(event).catch(() => "failed")
  }
  await prisma.accountingIntegrationEvent.updateMany({ where: stuck, data: { status: "IGNORED" } })

  await prisma.retailPostingRun.deleteMany({ where: { companyId } })
  const lastNight = harareTime(1, 23, 0)
  await prisma.retailPostingRun.create({
    data: {
      companyId,
      trigger: "SCHEDULE",
      startedAt: lastNight,
      finishedAt: new Date(lastNight.getTime() + 40_000),
      salesPosted: 412,
      deliveriesPosted: 6,
      countsPosted: 1,
    },
  })
  console.log(`  posting: tenders and roles over the chart, end of each day, last run ${lastNight.toISOString()}`)
}

/**
 * SET-08. Setup › Fiscal device as the FiscalSettings board draws it: device
 * 0441-2209, serial HC-FD-88120, registered by the owner (Tendai Mhlanga) on
 * 14 March, answering now; days 210–213 closed on the four evenings before
 * today with their Z-report totals, and day 214 open since the Front till's
 * shift opened this morning, its receipts this morning's sales. The rules are
 * the defaults (with the last shift; keep selling). The device is a demo
 * device: its key and certificate are made here, and it talks to the FDMS
 * test connector (`scripts/fake-fdms.mjs`, or `RETAIL_DEMO_FDMS_URL`), never
 * to ZIMRA. Every run puts the page back the way the board has it.
 */
async function seedFiscal(companyId: string) {
  const owner = await prisma.user.findFirst({ where: { companyId, role: "SUPERADMIN" }, select: { id: true, name: true } })
  if (!owner) {
    console.log("  fiscal: no owner, skipped")
    return
  }
  const providerKey = "ZIMRA_FDMS"
  // Devices a test run retired by typing a new device ID go, with their days and receipts.
  const retired = await prisma.fiscalisationProviderConfig.findMany({
    where: { companyId, providerKey: { startsWith: `${providerKey}#` } },
    select: { id: true },
  })
  if (retired.length > 0) {
    const ids = retired.map((row) => row.id)
    await prisma.fiscalReceipt.deleteMany({ where: { fiscalDay: { providerConfigId: { in: ids } } } })
    await prisma.fiscalDay.deleteMany({ where: { providerConfigId: { in: ids } } })
    await prisma.fiscalisationProviderConfig.deleteMany({ where: { id: { in: ids } } })
  }
  const existing = await prisma.fiscalisationProviderConfig.findUnique({
    where: { companyId_providerKey: { companyId, providerKey } },
    select: { id: true, certificateRef: true },
  })
  const keeps = (() => {
    try {
      const bundle = JSON.parse(existing?.certificateRef ?? "") as { cert?: string; key?: string }
      return Boolean(bundle.cert && bundle.key)
    } catch {
      return false
    }
  })()
  const device = {
    apiBaseUrl: process.env.RETAIL_DEMO_FDMS_URL ?? "http://127.0.0.1:9911",
    deviceId: "0441-2209",
    serialNumber: "HC-FD-88120",
    isActive: true,
    registeredAt: new Date("2026-03-14T10:20:00+02:00"),
    registeredById: owner.id,
    lastOkAt: new Date(),
    lastFailedAt: null,
    ...(keeps ? {} : { certificateRef: demoDeviceCertificate() }),
  }
  const provider = await prisma.fiscalisationProviderConfig.upsert({
    where: { companyId_providerKey: { companyId, providerKey } },
    update: device,
    create: { companyId, providerKey, ...device },
  })
  // What registering maps from ZIMRA's applicable taxes: 15.5% is its taxID 1, the shelf's rate.
  await prisma.taxCode.updateMany({ where: { companyId, code: "VAT15_5" }, data: { zimraTaxId: 1 } })

  // The board's five days: four closed evenings and today's, open since the Front till's shift.
  const days = await prisma.fiscalDay.findMany({ where: { providerConfigId: provider.id }, select: { id: true } })
  await prisma.fiscalReceipt.deleteMany({ where: { fiscalDayId: { in: days.map((day) => day.id) } } })
  await prisma.fiscalDay.deleteMany({ where: { providerConfigId: provider.id } })
  const front = await prisma.retailShift.findFirst({
    where: { companyId, status: "OPEN", registerName: "Front till" },
    orderBy: { openedAt: "desc" },
    select: { openedAt: true },
  })
  const openedToday = front?.openedAt ?? harareTime(0, 7, 58)
  const closed: Array<{ no: number; back: number; opens: [number, number]; closes: [number, number]; total: string }> = [
    { no: 210, back: 4, opens: [7, 55], closes: [22, 1], total: "2977.40" },
    { no: 211, back: 3, opens: [7, 52], closes: [21, 58], total: "4102.00" },
    { no: 212, back: 2, opens: [7, 57], closes: [22, 11], total: "3488.75" },
    { no: 213, back: 1, opens: [7, 54], closes: [22, 4], total: "3912.20" },
  ]
  let globalNo = 61_480
  for (const day of closed) {
    const cents = BigInt(new Prisma.Decimal(day.total).times(100).toFixed(0))
    // VAT at 15.5% inside the takings, as the Z-report counts them.
    const tax = BigInt(new Prisma.Decimal(day.total).times(15.5).dividedBy(115.5).times(100).toFixed(0))
    const receipts = 180 + day.no - 200
    globalNo += receipts
    await prisma.fiscalDay.create({
      data: {
        companyId,
        providerConfigId: provider.id,
        deviceId: provider.deviceId!,
        fiscalDayNo: day.no,
        status: "CLOSED",
        openedAt: harareTime(day.back, ...day.opens),
        closedAt: harareTime(day.back, ...day.closes),
        lastReceiptCounter: receipts,
        lastReceiptGlobalNo: globalNo,
        countersJson: JSON.stringify({
          receiptCount: receipts,
          lastReceiptCounter: receipts,
          lastReceiptGlobalNo: globalNo,
          counters: [
            { fiscalCounterType: "SaleByTax", fiscalCounterCurrency: "USD", fiscalCounterTaxID: 1, fiscalCounterTaxPercent: "15.50", fiscalCounterValueCents: cents.toString() },
            { fiscalCounterType: "SaleTaxByTax", fiscalCounterCurrency: "USD", fiscalCounterTaxID: 1, fiscalCounterTaxPercent: "15.50", fiscalCounterValueCents: tax.toString() },
          ],
          receiptsWithoutTaxLines: [],
        }),
      },
    })
  }
  const today = await prisma.fiscalDay.create({
    data: {
      companyId,
      providerConfigId: provider.id,
      deviceId: provider.deviceId!,
      fiscalDayNo: 214,
      status: "OPENED",
      openedAt: openedToday,
      lastReceiptGlobalNo: globalNo,
    },
  })
  // This morning's sales, signed into day 214 and taken by ZIMRA.
  const sales = await prisma.retailSale.findMany({
    where: { companyId, status: "POSTED", saleType: "SALE", postedAt: { gte: openedToday }, fiscalReceipt: null },
    orderBy: [{ postedAt: "asc" }, { id: "asc" }],
    select: { id: true, saleNo: true, currency: true, postedAt: true },
  })
  let counter = 0
  for (const sale of sales) {
    counter += 1
    globalNo += 1
    await prisma.fiscalReceipt.create({
      data: {
        companyId,
        retailSaleId: sale.id,
        receiptNumber: sale.saleNo,
        fiscalNumber: `${provider.deviceId}/214/${counter}`,
        status: "SUCCESS",
        issuedAt: sale.postedAt,
        providerKey,
        receiptCounter: counter,
        receiptGlobalNo: globalNo,
        fiscalDayId: today.id,
        receiptType: "FISCALINVOICE",
        receiptCurrency: sale.currency,
        lastSyncedAt: sale.postedAt,
      },
    })
  }
  await prisma.fiscalDay.update({
    where: { id: today.id },
    data: { lastReceiptCounter: counter, lastReceiptGlobalNo: globalNo },
  })

  await prisma.retailFiscalSettings.upsert({
    where: { companyId },
    update: { dayClose: "WITH_LAST_SHIFT", whenUnreachable: "KEEP_SELLING", updatedById: null },
    create: { companyId },
  })
  await prisma.platformAuditEvent.deleteMany({
    where: {
      companyId,
      entityType: "RetailSettings",
      entityId: "fiscal",
      eventType: { in: [RETAIL_AUDIT_EVENTS.settingsChanged, RETAIL_AUDIT_EVENTS.fiscalConnected, RETAIL_AUDIT_EVENTS.fiscalDayClosed] },
    },
  })
  console.log(`  fiscal: device 0441-2209 registered 14 March, days 210–213 closed, day 214 open with ${sales.length} receipt(s)`)
}

/** A demo device's key and a self-signed certificate for it, in the bundle shape registration writes. */
function demoDeviceCertificate(): string {
  const dir = mkdtempSync(join(tmpdir(), "demo-fdms-"))
  try {
    execFileSync(
      "openssl",
      ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-days", "730", "-subj", "/CN=HC-FD-88120"],
      { stdio: "ignore" },
    )
    return JSON.stringify({ cert: readFileSync(join(dir, "cert.pem"), "utf8"), key: readFileSync(join(dir, "key.pem"), "utf8") })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

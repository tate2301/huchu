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
import { money, multiplyMoney, quantity, rate, sumMoney, toNumberOrZero, ZERO } from "@/lib/money"
import { ensureAccountingDefaults, runAccountingSeedPack } from "@/lib/accounting/bootstrap"
import { RETAIL_ROLE_ACCOUNT_CODES } from "@/lib/accounting/defaults"
import { postIntegrationEvent } from "@/lib/accounting/integration"
import { createJournalEntryFromSource } from "@/lib/accounting/posting"
import { RETAIL_SOURCE_TYPES } from "@/lib/retail/posting-settings"
import { prisma } from "@/lib/prisma"
import { builtInTemplate, type TemplateQuery } from "@/lib/reports/definitions/retail/templates"
import { getReportDefinition } from "@/lib/reports/registry"
import { fromTemplateQuery } from "@/lib/reports/template-query"
import { addContact, createSupplier, type SendsWord, type SupplierInput } from "@/lib/retail/buying/suppliers"
import { createProduct } from "@/lib/retail/products/create"
import { productInput } from "@/lib/retail/products/input"
import { deleteFromBinForGood, listBinEntries, moveToBin } from "@/lib/retail/bin"
import { CATEGORY_SEEDS, ensureRetailCategories } from "@/lib/retail/categories"
import { findDefaultPriceList, followPrice } from "@/lib/retail/prices/change"
import { tradingDayKey } from "@/lib/retail/z-report"
import { addDays, dayKey, formatWhen } from "@/lib/workspace/format"
import {
  auditCashMoved,
  auditRecordEdited,
  auditSalePosted,
  auditAmount,
  auditShiftOpened,
  RETAIL_AUDIT_EVENTS,
  writeRetailAuditEvent,
} from "@/lib/retail/audit"
import { closeDay, dayFigures, DayRefused, loadDayRows } from "@/lib/retail/floor/day-close"
import { bookEmptiesReturn, emptiesBalances, inStore, recordEmptiesCredit, recordEmptiesEntry, recordSaleEmpties } from "@/lib/retail/stock/empties"
import { postRetailJournal } from "@/app/api/v2/retail/_helpers"
import { ensureRetailSaleAccountingPosted } from "@/app/api/v2/retail/_services"
import { expireVouchers } from "@/lib/retail/vouchers/expire"
import { issueCreditNote, issueVoucher, sellGiftVouchers } from "@/lib/retail/vouchers/issue"
import { postVoucherIssue } from "@/lib/retail/vouchers/posting"
import { redeemInSale } from "@/lib/retail/vouchers/redeem"
import { addMonths } from "@/lib/retail/vouchers/dates"
import { adjustmentJournal, adjustStock, type AdjustWhy } from "@/lib/retail/stock/adjustments"
import { breakCase } from "@/lib/retail/stock/cases"
import { applyPromotions, shareCents, type SnapshotPromotion } from "@/lib/retail/pricing/engine"
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
 * Castle Lager 340ml, Jameson and Johnnie Walker; Jaggermeister is out, its
 * 30 days' sales all before it ran out `soldOutDays` ago (STK-02's StockList
 * board). `weight` is how often the line sold before the window, so older
 * history has the same shape. Bohlinger's sits at Borrowdale; Zambezi and
 * Bols are no longer sold. The sales are at the line's own site, so On hand's
 * cover reads these figures line by line.
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
  /** Sold out this many days ago: every unit of `sold30` sold before then. */
  soldOutDays?: number
  /** A real EAN-13, check digit and all (PRD-06 prints it as EAN-13); the rest get a 12-digit stand-in. */
  barcode?: string
}
const CATALOGUE: CatalogueEntry[] = [
  { code: "AMARULA-750", name: "Amarula Cream 750ml", unit: "bottle", price: "18.25", cost: "13.03", stock: 13, sold30: 63, min: 12, reorder: 24, weight: 64, category: "Spirits" },
  { code: "BERNINI-275", name: "Bernini Blush 275ml", unit: "bottle", price: "1.75", cost: "1.20", stock: 48, sold30: 40, min: 24, reorder: 48, weight: 40, category: "Ciders and coolers" },
  { code: "BOHLINGER-330", name: "Bohlinger’s 330ml", unit: "bottle", price: "1.55", cost: "1.08", stock: 96, sold30: 70, min: 36, reorder: 48, weight: 70, category: "Beer", site: "BORROWDALE" },
  { code: "CASTLE-340", name: "Castle Lager 340ml", unit: "bottle", price: "1.20", cost: "0.86", stock: 26, sold30: 90, min: 96, reorder: 96, weight: 88, category: "Beer", deposit: "0.10" },
  { code: "CASTLE-CASE", name: "Castle Lager case of 24", unit: "case", price: "26.50", cost: "20.10", stock: 22, sold30: 55, min: 8, reorder: 10, weight: 55, category: "Beer" },
  { code: "CHARCOAL-4KG", name: "Charcoal 4kg", unit: "bag", price: "3.90", cost: "2.40", stock: 11, sold30: 20, min: 6, reorder: 12, weight: 20, category: "Snacks", barcode: "6001586239666" },
  { code: "CHIBUKU-1L", name: "Chibuku Scud 1L", unit: "carton", price: "1.10", cost: "0.82", stock: 210, sold30: 102, min: 60, reorder: 120, weight: 350, category: "Beer" },
  { code: "CHIBUKU-12", name: "Chibuku crate of 12", unit: "crate", price: "12.50", cost: "9.84", stock: 17, sold30: 21, min: 4, reorder: 6, weight: 21, category: "Beer" },
  { code: "COKE-500", name: "Coca-Cola 500ml", unit: "bottle", price: "0.75", cost: "0.52", stock: 180, sold30: 216, min: 48, reorder: 96, weight: 216, category: "Soft drinks" },
  // STK-07: sent to Borrowdale on TRF-0008, 48 left at Harare Main Branch.
  { code: "FANTA-500", name: "Fanta Orange 500ml", unit: "bottle", price: "1.00", cost: "0.76", stock: 48, sold30: 30, min: 24, reorder: 48, weight: 30, category: "Soft drinks" },
  { code: "COKE-6PK", name: "Coke 500ml six-pack", unit: "pack", price: "4.20", cost: "3.12", stock: 30, sold30: 36, min: 6, reorder: 12, weight: 36, category: "Soft drinks" },
  { code: "GORDONS-750", name: "Gordon’s Gin 750ml", unit: "bottle", price: "16.40", cost: "12.40", stock: 18, sold30: 68, min: 6, reorder: 12, weight: 67, category: "Spirits" },
  { code: "HUNTERS-330", name: "Hunter’s Gold 330ml", unit: "bottle", price: "1.85", cost: "1.31", stock: 60, sold30: 50, min: 24, reorder: 48, weight: 50, category: "Ciders and coolers" },
  { code: "ICE-2KG", name: "Ice 2kg bag", unit: "bag", price: "1.50", cost: "1.00", stock: 40, sold30: 86, min: 20, reorder: 40, weight: 86, category: "Ice and mixers" },
  { code: "JAGER-750", name: "Jaggermeister 750ml", unit: "bottle", price: "32.00", cost: "24.00", stock: 0, sold30: 18, min: 6, reorder: 12, weight: 18, category: "Spirits", soldOutDays: 6 },
  { code: "JAMESON-750", name: "Jameson Irish Whiskey 750ml", unit: "bottle", price: "27.90", cost: "22.15", stock: 9, sold30: 90, min: 12, reorder: 12, weight: 121, category: "Spirits" },
  { code: "BLKLABEL-750", name: "Johnnie Walker Black 750ml", unit: "bottle", price: "42.00", cost: "33.60", stock: 6, sold30: 60, min: 12, reorder: 12, weight: 58, category: "Spirits" },
  { code: "NEDERBURG-750", name: "Nederburg Cabernet 750ml", unit: "bottle", price: "12.60", cost: "9.40", stock: 24, sold30: 20, min: 8, reorder: 12, weight: 20, category: "Wine" },
  { code: "SAVANNA-330", name: "Savanna Dry 330ml", unit: "bottle", price: "1.85", cost: "1.38", stock: 72, sold30: 45, min: 24, reorder: 48, weight: 45, category: "Ciders and coolers" },
  { code: "TONIC-200", name: "Schweppes Tonic 200ml", unit: "can", price: "0.60", cost: "0.38", stock: 96, sold30: 40, min: 24, reorder: 48, weight: 40, category: "Ice and mixers" },
  { code: "TWOKEYS-750", name: "Two Keys Whisky 750ml", unit: "bottle", price: "9.75", cost: "7.10", stock: 28, sold30: 30, min: 12, reorder: 12, weight: 30, category: "Spirits" },
  { code: "ZAMBEZI-375", name: "Zambezi Lager 375ml", unit: "bottle", price: "1.35", cost: "0.95", stock: 144, sold30: 0, min: 48, reorder: 48, weight: 40, category: "Beer", deposit: "0.10", archived: true },
  { code: "BOLS-50", name: "Bols Brandy 50ml", unit: "bottle", price: "1.80", cost: "1.20", stock: 6, sold30: 12, min: 2, reorder: 12, weight: 12, category: "Spirits" },
  { code: "BOLS-750", name: "Bols Brandy 750ml", unit: "bottle", price: "14.20", cost: "11.22", stock: 6, sold30: 0, min: 6, reorder: 6, weight: 6, category: "Spirits", archived: true },
]

/**
 * PRD-08's bundles and buy-more deals, made by the owner, and how many sold:
 * in the last 30 days and the 30 before. Their sales are bundle-tagged
 * component lines dealt out of the products' own 30-day quotas, so they count
 * in each product's "Sold, 30 days". A buy-more group is three (or two) of one
 * product, `groups` saying how many of each. Gin and tonic is US$17.30, not the
 * packet's 18.90: Gordon's is US$16.40 here, so 18.90 would cost more than the
 * gin and four tonics at US$18.80 (98-decisions, PRD-08).
 */
type BundleSeed = {
  code: string
  kind: "FIXED_SET" | "BUY_MORE"
  name: string
  price: string
  buy?: number
  barcode?: string
  category?: string
  made: string
  items: Array<[code: string, quantity: number]>
  sold30: number
  soldPrev: number
  groups?: Record<string, number>
}
const BUNDLE_SEEDS: BundleSeed[] = [
  {
    code: "BND-0004",
    kind: "FIXED_SET",
    name: "Braai pack",
    price: "11.00",
    barcode: "6001234500044",
    category: "Beer",
    made: "2026-08-02T09:40:00+02:00",
    items: [["CASTLE-340", 6], ["ICE-2KG", 1], ["CHARCOAL-4KG", 1]],
    sold30: 10,
    soldPrev: 4,
  },
  {
    code: "BND-0005",
    kind: "FIXED_SET",
    name: "Gin and tonic",
    price: "17.30",
    category: "Spirits",
    made: "2026-08-20T10:15:00+02:00",
    items: [["GORDONS-750", 1], ["TONIC-200", 4]],
    sold30: 9,
    soldPrev: 0,
  },
  {
    code: "BND-0006",
    kind: "BUY_MORE",
    name: "Any 3 ciders",
    price: "5.00",
    buy: 3,
    category: "Ciders and coolers",
    made: "2026-09-01T08:30:00+02:00",
    items: [["SAVANNA-330", 1], ["HUNTERS-330", 1], ["BERNINI-275", 1]],
    sold30: 44,
    soldPrev: 0,
    groups: { "SAVANNA-330": 15, "HUNTERS-330": 16, "BERNINI-275": 13 },
  },
  {
    code: "BND-0007",
    kind: "BUY_MORE",
    name: "Second Amarula half price",
    price: "27.38",
    buy: 2,
    category: "Spirits",
    made: "2026-09-03T11:05:00+02:00",
    items: [["AMARULA-750", 1]],
    sold30: 6,
    soldPrev: 0,
    groups: { "AMARULA-750": 6 },
  },
]

/** The deposit values the shop names (CATALOGUE's `deposit`). */
const DEPOSIT_KINDS = [{ amount: "0.10", name: "Bottles, 340 to 375ml" }]

/** Econet airtime: sold at whatever the cashier types, so its shelf price is only a starting figure. */
const AIRTIME = { code: "ECONET-AIRTIME", name: "Econet airtime", price: "1.00", stock: 1000 }

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
  "Farai Chikore", "Tinashe Mavhunga",
]

/** FLR-01, CUS-02: the customers' WhatsApp numbers, E.164 (the customers spec's names, C-44). */
const CUSTOMER_PHONES: Record<string, string> = {
  "Farai Chikore": "+263775091144",
  "Tinashe Mavhunga": "+263713308826",
  "Tapiwa Marange": "+263774123388",
  "Nyasha Gwenzi": "+263712209014",
  "Rutendo Banda": "+263783015521",
  "Munashe Chari": "+263779881043",
  "Blessing Ncube": "+263736402219",
  "Kudzai Zhou": "+263771056672",
  "Simba Mutasa": "+263718840397",
  "Rudo Chirwa": "+263785527710",
}

/**
 * FLR-01: the SalesList and SaleRecord boards' morning, rung on the two open
 * drawers (the Front till, Chipo Dube; the stale Back till, Farai Moyo, C-41).
 * At the board's times once the day has reached them; seeded earlier, the same
 * morning ends a few minutes before the run. Their units come out of the
 * window's quotas, so every product's 30-day count still lands; Tinashe's
 * Jameson comes back with RFD-0044 and the voided Castle with its VOID
 * document, so neither changes what sold.
 */
type FloorSale = {
  key: "tinashe" | "voided" | "four" | "card" | "chikore" | "last"
  saleNo?: string
  at: [number, number]
  till: "front" | "back"
  customer?: string
  lines: Array<{ code: string; units: number; price?: string }>
  tender: RetailTenderType
  reference?: string
}
const FLOOR_SALES: FloorSale[] = [
  { key: "tinashe", at: [10, 20], till: "front", customer: "Tinashe Mavhunga", lines: [{ code: "JAMESON-750", units: 1 }], tender: "CASH" },
  { key: "voided", saleNo: "SALE-31858", at: [10, 58], till: "back", lines: [{ code: "CASTLE-340", units: 1 }], tender: "CASH" },
  {
    key: "four",
    saleNo: "SALE-31862",
    at: [11, 12],
    till: "front",
    lines: [{ code: "TWOKEYS-750", units: 1 }, { code: "COKE-500", units: 2 }, { code: "BERNINI-275", units: 1 }],
    tender: "CASH",
  },
  {
    key: "card",
    saleNo: "SALE-31866",
    at: [11, 40],
    till: "front",
    // The board's ice at US$2.20 (the bag before this week's price).
    lines: [{ code: "BLKLABEL-750", units: 1 }, { code: "ICE-2KG", units: 1, price: "2.20" }],
    tender: "CARD",
    reference: "CBZ 4412 0988",
  },
  {
    key: "chikore",
    saleNo: "SALE-31869",
    at: [12, 2],
    till: "back",
    customer: "Farai Chikore",
    lines: [{ code: "BERNINI-275", units: 4 }, { code: "CASTLE-340", units: 1 }, { code: "CHIBUKU-1L", units: 1 }],
    tender: "CASH",
  },
  {
    key: "last",
    saleNo: "SALE-31870",
    at: [12, 10],
    till: "front",
    lines: [{ code: "CASTLE-340", units: 8 }, { code: "CHARCOAL-4KG", units: 3 }, { code: "ICE-2KG", units: 1 }, { code: "TONIC-200", units: 1 }],
    tender: "ECOCASH",
    reference: "EC448120",
  },
]
/** The run's last sale is SALE-31870; RFD-0044 is the 44th refund. */
const LAST_SALE_NO = 31870
const FLOOR_REFUND_NO = 44
/** PRD-10: CN-0031 and CN-0033 are refunds paid as credit notes, dealt with the history. */
const VOUCHER_REFUNDS = 2

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

/** Days since this week's Monday in Harare (Monday 0 … Sunday 6): the week the Overview's "this week" reads. */
function daysSinceMonday() {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Harare", weekday: "short" }).format(new Date())
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday)
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
    // STK-09: what an empty is worth going back to a supplier.
    bottleDeposit: money("0.10"),
    crateDeposit: money("3.00"),
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
  // Harare Main Branch's licence: alcohol from 08:00 to 22:00 Monday to Saturday, 10:00 to 18:00 on Sunday.
  for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
    const hours = weekday === 0 ? { alcoholFrom: 10 * 60, alcoholUntil: 18 * 60 } : { alcoholFrom: 8 * 60, alcoholUntil: 22 * 60 }
    await prisma.retailLicenceHours.upsert({
      where: { siteId_weekday: { siteId: site.id, weekday } },
      update: hours,
      create: { companyId, siteId: site.id, weekday, ...hours },
    })
  }
  // What the shop calls its deposit values: the till shows the name beside the bottles.
  for (const kind of DEPOSIT_KINDS) {
    await prisma.retailDepositKind.upsert({
      where: { companyId_amount: { companyId, amount: money(kind.amount) } },
      update: { name: kind.name },
      create: { companyId, amount: money(kind.amount), name: kind.name },
    })
  }
  await ensureRetailCategories(prisma, companyId, "LIQUOR")
  await seedCategories(companyId, reset)
  await seedAirtimeCategory(companyId)
  await seedShopSettingsSave(companyId)
  const categoryIds = new Map(
    (await prisma.retailCategory.findMany({ where: { companyId, archivedAt: null }, select: { id: true, name: true } })).map(
      (row) => [row.name, row.id],
    ),
  )

  type Stocked = { inventoryItemId: string; productId: string; unit: string }
  const stocked = new Map<string, Stocked>()

  // PRD-03: the default list is a flag; every product goes on it and the till prices from it.
  const shelfList = await prisma.priceList.upsert({
    where: { companyId_name: { companyId, name: "Retail" } },
    update: { isDefault: true, state: "ON", archivedAt: null },
    create: { companyId, name: "Retail", kind: "RETAIL", taxInclusive: true, state: "ON", isDefault: true },
    select: { id: true },
  })

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

    // The product, its price on the default list, and the line claimed by it (PRD-03: written directly).
    const productId = await seedShelfLine({
      companyId,
      listId: shelfList.id,
      code: entry.code,
      name: entry.name,
      itemId: item.id,
      price: entry.price,
      barcode: entry.barcode ?? `600${String(Math.abs(hashCode(entry.code))).padStart(9, "0").slice(0, 9)}`,
      // Zambezi and Bols are archived: off every till, their stock kept.
      isActive: !entry.archived,
      categoryId: categoryIds.get(entry.category) ?? null,
      cost: entry.cost,
      deposit: entry.deposit ?? null,
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
      // PRD-08: the Castle case carries a US$3.00 deposit on its crate.
      data: {
        packOfId: stocked.get(single)!.productId,
        packSize: size,
        breakAtTill: true,
        ...(pack === "CASTLE-CASE" ? { returnable: true, depositAmount: money("3.00") } : {}),
      },
    })
  }
  await seedAirtime({ companyId, siteId: site.id, locationId: location.id, listId: shelfList.id, categoryId: categoryIds.get("Airtime") ?? null })
  /*
    The range is exactly the catalogue. Anything else ranged on this tenant —
    a product a test run added by hand — goes to the bin with --reset, so the
    tabs read Selling 20 · Low stock 5 (the four low, and Jaggermeister out) ·
    Archived 2 · All 22.
  */
  if (reset) {
    const strays = await prisma.product.updateMany({
      where: {
        companyId,
        archivedAt: null,
        code: { notIn: [...CATALOGUE.map((entry) => entry.code), SPRITE.code, COKE_2L.code, AIRTIME.code] },
        inventoryItems: { some: {} },
      },
      data: { archivedAt: new Date() },
    })
    if (strays.count) console.log(`  ${strays.count} product(s) not in the catalogue moved to the bin`)

    /*
      The products' Activity is the seed's again: what acceptance walks changed
      on a record (reorder levels, shelves, prices, costs) goes with the values
      the catalogue above has just put back. The seed's own line, Amarula's
      price change, is written again below.
    */
    const ranged = await prisma.product.findMany({
      where: { companyId, code: { in: [...CATALOGUE.map((entry) => entry.code), SPRITE.code, COKE_2L.code] } },
      select: { id: true },
    })
    const edits = await prisma.platformAuditEvent.deleteMany({
      where: { companyId, eventType: RETAIL_AUDIT_EVENTS.recordEdited, entityType: "Product", entityId: { in: ranged.map((product) => product.id) } },
    })
    if (edits.count) console.log(`  reset: cleared ${edits.count} edit(s) from the products' Activity`)
  }
  console.log(`  ${CATALOGUE.length} lines on the shelf (4 low, 1 out, 2 archived, Bohlinger’s at Borrowdale)`)

  // ── Customers ────────────────────────────────────────────────────────────
  const customers: Array<{ id: string; name: string }> = []
  for (const name of CUSTOMERS) {
    const existing = await prisma.customer.findFirst({
      where: { companyId, name },
      select: { id: true },
    })
    const phone = CUSTOMER_PHONES[name] ?? null
    const customer = existing
      ? await prisma.customer.update({ where: { id: existing.id }, data: { phone, isActive: true }, select: { id: true, name: true } })
      : await prisma.customer.create({ data: { companyId, name, phone, isActive: true }, select: { id: true, name: true } })
    customers.push(customer)
  }
  const customerNamed = (name: string) => customers.find((customer) => customer.name === name)!

  // ── Promotions (PRD-09): the nine on the boards; the history's lines carry what they took off.
  const promotions = await seedPromotions({ companyId, productIds: new Map([...stocked].map(([code, line]) => [code, line.productId])), categoryIds })

  if (reset) {
    // Only the trading history, never the shelf or the staff. A reset that wiped
    // the catalogue would take the demo's barcodes with it.
    const sales = await prisma.retailSale.findMany({ where: { companyId }, select: { id: true } })
    const saleIds = sales.map((sale) => sale.id)
    // PRD-10: vouchers spent on the history hold it; they are seeded again below.
    await clearVouchers(companyId)
    await prisma.retailSalePayment.deleteMany({ where: { saleId: { in: saleIds } } })
    await prisma.retailSaleLine.deleteMany({ where: { saleId: { in: saleIds } } })
    await prisma.retailSale.deleteMany({ where: { companyId } })
    // Their journals go with them (PRD-10 posts the vouchers' sales), and any a run before left behind.
    await clearSaleJournals(companyId)
    await prisma.retailHeldCart.deleteMany({ where: { companyId } })
    // The days closed over the history being replaced: their Z-reports, the cash banked and its journal.
    const banked = { companyId, sourceType: "RETAIL_DAY_BANKED" as const }
    await prisma.bankTransaction.deleteMany({ where: banked })
    await prisma.journalEntry.deleteMany({ where: banked })
    await prisma.accountingIntegrationEvent.deleteMany({ where: banked })
    await prisma.retailDayClose.deleteMany({ where: { companyId } })
    await prisma.retailZReport.deleteMany({ where: { companyId } })
    await prisma.retailShift.deleteMany({ where: { companyId } })
    // The next shift number is worked out again from the history written below
    // (SH-<n> after the last seeded one), not from the run before.
    await prisma.idSequence.deleteMany({
      where: { companyId, entityKey: { in: ["RETAIL_SHIFT", "RETAIL_SALE", "RETAIL_REFUND", "RETAIL_VOID"] } },
    })
    console.log(`  reset: cleared ${saleIds.length} previous sale(s) and their shifts`)
  }

  // PRD-08: the bundles their sales below are tagged with.
  const bundleSeeds = await seedBundles({ companyId, productIds: new Map([...stocked].map(([code, line]) => [code, line.productId])), reset })

  // ── The history ──────────────────────────────────────────────────────────
  type ShiftRow = Prisma.RetailShiftCreateManyInput
  type SaleRow = Prisma.RetailSaleCreateManyInput
  type LineRow = Prisma.RetailSaleLineCreateManyInput
  type PaymentRow = Prisma.RetailSalePaymentCreateManyInput

  const shiftRows: ShiftRow[] = []
  const movementRows: Prisma.RetailCashMovementCreateManyInput[] = []
  const dropApprover = staff.find((person) => person.name === "Tafara Nyathi") ?? null
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
  /*
    FLR-01: the boards' morning (FLOOR_SALES) at its own times once the day is
    past 12:13; seeded earlier, moved back whole so SALE-31870 is three minutes
    old, and the Front till opens in time for the first of them.
  */
  const boardLast = harareTime(0, 12, 10)
  const floorShift = Math.min(0, now.getTime() - 3 * 60 * 1000 - boardLast.getTime())
  const floorAt = (at: [number, number]) => new Date(harareTime(0, at[0], at[1]).getTime() + floorShift)
  const floorFirst = floorAt(FLOOR_SALES[0]!.at)
  const frontOpens = harareTime(0, 7, 58)
  const frontToday = frontOpens.getTime() < floorFirst.getTime() - 20 * 60 * 1000 ? frontOpens : new Date(floorFirst.getTime() - 20 * 60 * 1000)
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
    /** Its sales may run up to here rather than the boards' first sale (FLR-03: Handheld 1 before SALE-31858). */
    until?: Date
  }
  const slots: Slot[] = []
  for (let dayOffset = days; dayOffset >= 0; dayOffset -= 1) {
    if (dayOffset === 0) {
      slots.push({
        register,
        openedAt: frontToday,
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
  /*
    FLR-03 (C-41): three drawers open at the run. The stale Back till, Farai
    Moyo, with its ten sales of that afternoon (the boards' Farai Chikore sale
    makes eleven); and Handheld 1, Tendai Mhlanga, opened at 10:05 with no
    float and forty sales before the boards' SALE-31858, so the boards'
    numbers still land.
  */
  slots.push({
    register: backRegister,
    openedAt: staleOpenedAt,
    open: true,
    cashier: staffNamed("Farai Moyo"),
    float: "100.00",
    saleTimes: Array.from({ length: 10 }, (_, index) => new Date(staleOpenedAt.getTime() + (12 + index * 31) * 60 * 1000)),
  })
  const ownerUser = await prisma.user.findFirst({ where: { companyId, email: "owner@bottlestore.test" }, select: { id: true, name: true } })
  const handheldOpens = floorAt([10, 5])
  const handheldUntil = floorAt([10, 57])
  if (ownerUser && handheldOpens.getTime() > frontToday.getTime()) {
    const span = handheldUntil.getTime() - handheldOpens.getTime() - 2 * 60 * 1000
    slots.push({
      register: handheld,
      openedAt: handheldOpens,
      open: true,
      cashier: { id: ownerUser.id, name: ownerUser.name ?? "Tendai Mhlanga", cashier: true },
      float: "0.00",
      until: handheldUntil,
      saleTimes: Array.from({ length: 40 }, (_, index) => new Date(handheldOpens.getTime() + 60 * 1000 + Math.floor((span * index) / 40))),
    })
  }
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
  // Shift numbers are company-wide (FLR-03) and the Front till's open shift has the highest.
  {
    const frontOpen = slots.findIndex((slot) => slot.open && slot.register.id === register.id)
    slots.push(...slots.splice(frontOpen, 1))
  }

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
    FLR-05 (seedSignOffs signs the rest off): this week, Monday to the run,
    every counted drawer balanced but three short and waiting for a sign-off —
    Chipo Dube −US$7.15, Farai Moyo −US$8.14, Chipo Dube −US$0.50 — on the
    Front till's Wednesday, Thursday and Friday once the week has them, else
    on the week's closed drawers in order (the Front till's first), then the
    last ones before Monday; nothing closed uncounted this week. Last week's
    Wednesday, Chipo Dube's Front till drawer counted US$412.50 against
    US$432.50: the drawer she agreed to repay.
  */
  const weekStarts = harareTime(daysSinceMonday(), 0, 0)
  const frontOn = (daysBack: number) =>
    closedSlots.find((slot) => slot.register.id === register.id && dayKey(slot.openedAt) === dayKey(harareTime(daysBack, 12, 0)))
  const thisWeek = closedSlots.filter((slot) => slot.openedAt.getTime() >= weekStarts.getTime())
  for (const slot of thisWeek) {
    uncounted.delete(slot)
    differences.delete(slot)
  }
  const byOpening = (a: Slot, b: Slot) => a.openedAt.getTime() - b.openedAt.getTime()
  const named = [2, 3, 4].map((weekday) => daysSinceMonday() - weekday).filter((back) => back >= 1).map(frontOn).filter((slot): slot is Slot => Boolean(slot))
  const fallback = [
    ...thisWeek.filter((slot) => slot.register.id === register.id).sort(byOpening),
    ...thisWeek.filter((slot) => slot.register.id !== register.id).sort(byOpening),
    ...closedSlots.filter((slot) => slot.register.id === register.id && slot.openedAt.getTime() < weekStarts.getTime()).sort(byOpening).reverse(),
  ]
  const shortThisWeek = (named.length === 3 ? named : [...named, ...fallback.filter((slot) => !named.includes(slot))].slice(0, 3)).sort(byOpening)
  const SHORT_THIS_WEEK: Array<[string, string]> = [["Chipo Dube", "-7.15"], ["Farai Moyo", "-8.14"], ["Chipo Dube", "-0.50"]]
  // What each cashier said at the close: a difference over US$1.00 needs it, and the week's three all have one.
  const SHORT_NOTES = ["Counted twice, still short.", "Busy afternoon, change given in a hurry.", "Not sure where it went. Counted twice."]
  const OVER_NOTES = ["A customer left without the change.", "Counted twice, still over.", "Change not taken at the counter."]
  const closeNotes = new Map<Slot, string>()
  const WEEK_NOTES = ["Counted twice, still short. Not sure where it went.", "Short after the evening rush. Checking the EcoCash slips.", "Fifty cents out, change in coins."]
  shortThisWeek.forEach((slot, index) => {
    const [who, amount] = SHORT_THIS_WEEK[index]!
    slot.cashier = staffNamed(who)
    uncounted.delete(slot)
    differences.set(slot, money(amount))
    closeNotes.set(slot, WEEK_NOTES[index]!)
  })
  const pinnedExpected = new Map<Slot, Prisma.Decimal>()
  const recovered = frontOn(daysSinceMonday() + 5)
  if (recovered && !shortThisWeek.includes(recovered)) {
    recovered.cashier = staffNamed("Chipo Dube")
    // It was counted: the drawer closed without a count about a week ago is the one before it.
    if (uncounted.delete(recovered)) {
      const earlier = closedSlots[closedSlots.indexOf(recovered) - 1]
      if (earlier) {
        uncounted.add(earlier)
        differences.delete(earlier)
      }
    }
    differences.set(recovered, money("-20.00"))
    pinnedExpected.set(recovered, money("432.50"))
    closeNotes.set(recovered, "A US$20 went out as change for a US$10.")
  }

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
    // Nothing after the boards' first sale but the boards' morning itself (FLR-01, below).
    if (slot.saleTimes) {
      const before = (slot.until ?? floorFirst).getTime()
      return slot.saleTimes.filter((postedAt) => postedAt.getTime() < before && !(postedAt.getTime() >= windowOpens && postedAt.getTime() < windowCounts))
    }
    const count = Math.max(3, Math.round(between(9, 17) * dayBusyness(slot.openedAt)))
    return Array.from(
      { length: count },
      (_, saleIndex) => new Date(slot.openedAt.getTime() + between(5, 6 * 60) * 60 * 1000 + saleIndex * 1000),
    ).filter((postedAt) => {
      const at = postedAt.getTime()
      return at < floorFirst.getTime() && !(at >= windowOpens && at < windowCounts)
    })
  })
  /*
    FLR-01: the Front till's other sales between the boards' (SALE-31859 to
    -31861, -31863 to -31865, -31867 and -31868), so every number runs in the
    order it was rung and SALE-31870 is the newest. The last of them is
    Setup › Receipts' preview sale (SET-07).
  */
  const frontSlot = slots.findIndex((slot) => slot.open && slot.register.id === register.id)
  salePlans[frontSlot]!.push(
    ...([[11, 0], [11, 4], [11, 8], [11, 20], [11, 27], [11, 33], [11, 46], [11, 56]] as Array<[number, number]>).map(floorAt),
  )
  /*
    FLR-05: the recovered drawer's morning took a function's order in cash —
    fourteen cases of Castle Lager and five bags of ice, US$378.50 — so its
    float stays US$100.00 and a drop to the safe brings what should be in the
    drawer to the US$432.50 the SignOff board reads. Its units come out of the
    window's quotas first, like the preview sale's, and it is never refunded
    or voided.
  */
  const FUNCTION_PICKS = [
    { code: "CASTLE-CASE", units: 14 },
    { code: "ICE-2KG", units: 5 },
  ]
  const recoveredIndex = recovered && pinnedExpected.has(recovered) ? slots.indexOf(recovered) : -1
  const functionOrderAt = recoveredIndex >= 0 ? new Date(recovered!.openedAt.getTime() + 2 * HOUR_MS + 10 * 60 * 1000) : null
  if (functionOrderAt) salePlans[recoveredIndex]!.push(functionOrderAt)
  const isFunctionOrder = (slotIndex: number, postedAt: Date) => slotIndex === recoveredIndex && postedAt.getTime() === functionOrderAt?.getTime()
  let windowSalesLeft = salePlans.flat().filter((postedAt) => postedAt.getTime() >= windowCounts).length
  const quota = new WindowQuota(CATALOGUE.filter((entry) => !entry.soldOutDays))
  /*
    STK-02. A line that sold out (Jaggermeister, six days ago) sells its
    30 days' units only in the window's sales before then, from a quota of
    its own; the newest sale is later still, so it never takes one.
  */
  const soldOut = CATALOGUE.filter((entry) => entry.soldOutDays)
  const soldOutBy = now.getTime() - Math.max(0, ...soldOut.map((entry) => entry.soldOutDays!)) * DAY_MS
  const soldOutQuota = new WindowQuota(soldOut)
  const soldOutCodes = new Set(soldOut.map((entry) => entry.code))
  let soldOutSalesLeft = salePlans
    .flat()
    .filter((postedAt) => postedAt.getTime() >= windowCounts && postedAt.getTime() < soldOutBy).length
  const giveBack = (code: string, units: number) => (soldOutCodes.has(code) ? soldOutQuota : quota).giveBack(code, units)
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
  if (functionOrderAt && functionOrderAt.getTime() >= windowCounts) {
    for (const pickLine of FUNCTION_PICKS) quota.reserve(pickLine.code, pickLine.units)
    windowSalesLeft -= 1
    if (functionOrderAt.getTime() < soldOutBy) soldOutSalesLeft -= 1
  }
  /*
    PRD-08. The bundles' sales: each is its own sale on a closed drawer, of
    the bundle's lines alone. In the window their units come out of the
    quotas first, like the preview sale's; the 30 days before take the Braai
    pack's four. Never refunded or voided.
  */
  const bundleSales = new Map<string, { bundle: SeededBundle; picks: Array<{ code: string; units: number }> }>()
  {
    const closedPlans = salePlans.flatMap((plan, slotIndex) =>
      slots[slotIndex]!.open ? [] : plan.map((postedAt) => ({ slotIndex, at: postedAt.getTime(), key: `${slotIndex}|${postedAt.getTime()}` })),
    )
    const taken = new Set<string>()
    const place = (from: number, to: number) => {
      const free = closedPlans.filter((entry) => entry.at >= from && entry.at < to && !taken.has(entry.key) && !isFunctionOrder(entry.slotIndex, new Date(entry.at)))
      const chosen = free.length ? free[Math.floor(Math.random() * free.length)]! : null
      if (chosen) taken.add(chosen.key)
      return chosen
    }
    for (const seed of BUNDLE_SEEDS) {
      const bundle = bundleSeeds.get(seed.code)
      if (!bundle) continue
      const groups = seed.groups
        ? Object.entries(seed.groups).flatMap(([code, count]) => Array.from({ length: count }, () => [{ code, units: seed.buy! }]))
        : Array.from({ length: seed.sold30 }, () => seed.items.map(([code, units]) => ({ code, units })))
      for (const picks of groups) {
        const slot = place(windowCounts, floorFirst.getTime())
        if (!slot) break
        for (const line of picks) quota.reserve(line.code, line.units)
        windowSalesLeft -= 1
        if (slot.at < soldOutBy) soldOutSalesLeft -= 1
        bundleSales.set(slot.key, { bundle, picks })
      }
      for (let index = 0; index < seed.soldPrev; index += 1) {
        const slot = place(windowOpens - 30 * DAY_MS, windowOpens)
        if (slot) bundleSales.set(slot.key, { bundle, picks: seed.items.map(([code, units]) => ({ code, units })) })
      }
    }
  }
  /*
    FLR-01: refunds are numbered RFD-0001 upwards and the boards' RFD-0044
    (this morning's) is the newest, so the history holds exactly 43, on
    closed drawers outside the window's quiet hours.
  */
  const refundable = salePlans.flatMap((plan, slotIndex) =>
    slots[slotIndex]!.open
      ? []
      : plan
          .filter((postedAt) => !isFunctionOrder(slotIndex, postedAt) && !bundleSales.has(`${slotIndex}|${postedAt.getTime()}`))
          .map((postedAt) => postedAt.getTime())
          .filter((at) => !(at + 20 * 60 * 1000 >= windowOpens && at + 20 * 60 * 1000 < windowCounts))
          .map((at) => `${slotIndex}|${at}`),
  )
  const refundPicks = new Set<string>()
  // Less the vouchers' two refunds paid as credit notes (PRD-10), so the boards' RFD-0044 stays the newest.
  while (refundPicks.size < Math.min(FLOOR_REFUND_NO - 1 - VOUCHER_REFUNDS, refundable.length)) refundPicks.add(pick(refundable))

  /**
   * A void as the till writes it (FLR-01): the sale VOIDED with its reason, and a
   * VOID document beside it with every line and payment the other way, so the
   * day's takings net it to nothing and the stock ledger puts it back.
   */
  const voidDocument = (sale: SaleRow, reason: string, approver: { id: string; name: string } | null) => {
    sale.status = "VOIDED"
    sale.voidReason = reason
    const at = new Date((sale.postedAt as Date).getTime() + 1000)
    const voidId = randomUUID()
    const negate = (value: unknown) => money(value as Prisma.Decimal).negated()
    saleRows.push({
      ...sale,
      id: voidId,
      saleNo: `V-${voidId}`,
      saleType: "VOID",
      status: "POSTED",
      sourceSaleId: sale.id,
      // A till's client reference is the sale's own; its VOID document has none.
      clientRef: null,
      customerId: null,
      customerName: null,
      voidReason: null,
      overrideReason: reason,
      approvedById: approver?.id ?? null,
      approvedByName: approver?.name ?? null,
      subtotal: negate(sale.subtotal),
      taxAmount: negate(sale.taxAmount),
      totalAmount: negate(sale.totalAmount),
      depositAmount: negate(sale.depositAmount ?? 0),
      tenderedAmount: negate(sale.tenderedAmount ?? 0),
      baseAmount: negate(sale.baseAmount),
      postedAt: at,
      createdAt: at,
      updatedAt: at,
    })
    for (const line of lineRows.filter((row) => row.saleId === sale.id)) {
      lineRows.push({
        ...line,
        id: randomUUID(),
        saleId: voidId,
        sourceLineId: line.id as string,
        quantity: negate(line.quantity),
        taxAmount: negate(line.taxAmount),
        lineTotal: negate(line.lineTotal),
        costTotal: negate(line.costTotal),
        depositAmount: negate(line.depositAmount ?? 0),
        promotionId: null,
        promotionDiscount: money(0),
        createdAt: at,
      })
    }
    let cash = money(0)
    for (const payment of paymentRows.filter((row) => row.saleId === sale.id)) {
      paymentRows.push({ ...payment, id: randomUUID(), saleId: voidId, amount: negate(payment.amount), baseAmount: negate(payment.baseAmount), createdAt: at })
      if (payment.tenderType === "CASH") cash = cash.plus(money(sale.baseAmount as Prisma.Decimal))
    }
    voids += 1
    return cash
  }

  // FLR-01: the boards' sales that stand take their units out of the window first.
  for (const floor of FLOOR_SALES.filter((entry) => entry.key !== "tinashe" && entry.key !== "voided")) {
    for (const line of floor.lines) quota.reserve(line.code, line.units)
  }
  let previewSaleId: string | null = null
  let functionOrderSaleId: string | null = null
  const bundleSaleIds = new Set<string>()
  const byCode = new Map(CATALOGUE.map((entry) => [entry.code, entry]))
  const festive = festiveDates()
  const pairs2 = pairDeals()
  const categoryOfProduct = new Map(
    [...stocked].map(([code, line]) => [line.productId, categoryIds.get(byCode.get(code)?.category ?? "") ?? null]),
  )
  const codeOfProduct = new Map([...stocked].map(([code, line]) => [line.productId, code]))

  // PRD-10: the vouchers' sales, dealt with the history so they are numbered in it (`seedVouchers` reads them back).
  const voucherHooks = voucherHistory()
  {
    const board = voucherBoardSales({
      companyId,
      siteId: site.id,
      tills: { front: register.id, back: backRegister.id },
      cashier: staffNamed("Chipo Dube"),
      customerNamed,
      line: (code) => ({ ...stocked.get(code)!, ...byCode.get(code)! }),
    })
    saleRows.push(...board.sales)
    lineRows.push(...board.lines)
    paymentRows.push(...board.payments)
  }

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
        const functionOrder = isFunctionOrder(slotIndex, postedAt)
        if (functionOrder) functionOrderSaleId = saleId
        const bundleSale = bundleSales.get(`${slotIndex}|${postedAt.getTime()}`) ?? null
        if (bundleSale) bundleSaleIds.add(saleId)

        // In the window, this sale's share of the quotas; before it, a weighted pick.
        const picks = bundleSale
          ? bundleSale.picks
          : isPreviewSale
          ? PREVIEW_PICKS
          : functionOrder
          ? FUNCTION_PICKS
          : inWindow
          ? [...quota.take(windowSalesLeft--), ...(postedAt.getTime() < soldOutBy ? soldOutQuota.take(soldOutSalesLeft--) : [])]
          : Array.from({ length: between(1, 2) }, () => {
              let product = pickProduct()
              // Spirits sold slower in the weeks before the festive US$2 came off them (PRD-09's record compares the two).
              if (product.category === "Spirits" && postedAt >= festive.before && postedAt < festive.starts && Math.random() < 0.45) product = pickProduct()
              // Two for one price brings them in pairs while it runs.
              const pairs = pairs2.some((deal) => deal.code === product.code && postedAt >= deal.from && postedAt <= deal.to)
              return { code: product.code, units: product.weight >= 200 || pairs ? between(1, 3) : 1 }
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
            ...(bundleSale ? { bundleId: bundleSale.bundle.id, bundleRef: `${saleId}:1` } : {}),
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
        // A bundle's lines share its price pro rata to their own, in whole cents (PRD-08's engine).
        if (bundleSale) priceBundleLines(lines, bundleSale.bundle)
        // The promotions running when it was rung, by the till's own engine (PRD-09); none on a bundle.
        else promoteLines(lines, promotions, postedAt, slotSiteId, (productId) => categoryOfProduct.get(productId) ?? null)
        // PRD-10: DV-0007's 10% off on a few sales of its first days.
        const discountRef = !bundleSale && !isPreviewSale && !functionOrder ? voucherHooks.discount(postedAt, lines) : null

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
        const inZwg = !isPreviewSale && !functionOrder && Math.random() < 0.08
        const currency = inZwg ? "ZWG" : "USD"
        const exchangeRate = inZwg ? rate(ZWG_RATE) : rate("1")
        const baseAmount = inZwg ? money(totalAmount.div(rate(ZWG_RATE))) : totalAmount
        if (inZwg) zwgSales += 1

        const roll = Math.random()
        const tender: RetailTenderType = isPreviewSale
          ? "ECOCASH"
          : inZwg || functionOrder
          ? "CASH"
          : roll < 0.5
            ? "CASH"
            : roll < 0.74
              ? "ECOCASH"
              : roll < 0.92
                ? "CARD"
                : "TRANSFER"

        // PRD-10: a voucher paying part or all of an older card, EcoCash or transfer sale (never the drawer's cash).
        const voucherUse =
          !discountRef && !bundleSale && !isPreviewSale && !functionOrder && currency === "USD" && !refundPicks.has(`${slotIndex}|${postedAt.getTime()}`)
            ? voucherHooks.use(postedAt, tender, totalAmount.plus(saleDeposit))
            : null
        const voucherRef = discountRef ?? voucherUse?.ref ?? null
        saleRows.push({
          id: saleId,
          companyId,
          ...(voucherRef ? { clientRef: voucherRef } : {}),
          saleNo: `S-${String(saleSeq).padStart(6, "0")}`,
          shiftId,
          registerId: slot.register.id,
          siteId: slotSiteId,
          cashierId: cashier.id,
          cashierName: cashier.name,
          // Walk-ins: `seedCustomers` (CUS-02) puts the shop's customers on the history afterwards.
          customerId: null,
          customerName: null,
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
        const voucherPart = voucherUse ? money(voucherUse.amount) : money(0)
        if (voucherUse) {
          paymentRows.push({ id: randomUUID(), companyId, saleId, tenderType: "VOUCHER", amount: voucherPart, currency, exchangeRate, baseAmount: voucherPart, reference: null, createdAt: postedAt })
        }
        if (totalAmount.plus(saleDeposit).minus(voucherPart).greaterThan(0)) paymentRows.push({
          id: randomUUID(),
          companyId,
          saleId,
          tenderType: tender,
          // What the customer paid: the goods and the deposit on their bottles.
          amount: totalAmount.plus(saleDeposit).minus(voucherPart),
          currency,
          exchangeRate,
          baseAmount: baseAmount.plus(saleDeposit).minus(voucherPart),
          reference: tender === "ECOCASH" ? `EC${between(100000, 999999)}` : null,
          createdAt: postedAt,
        })
        if (tender === "CASH") cashTaken = cashTaken.plus(baseAmount)

        // A refund every so often, against the sale just posted. Never one
        // landing in the window's quiet first hours; one inside the window
        // puts its units back to be sold again, so the quotas still net out.
        const refundAt = postedAt.getTime() + 20 * 60 * 1000
        if (refundPicks.has(`${slotIndex}|${postedAt.getTime()}`)) {
          saleSeq += 1
          refunds += 1
          const refundId = randomUUID()
          const refundedAt = new Date(refundAt)
          const source = lines[0]!
          if (refundAt >= windowCounts) giveBack(codeOfProduct.get(source.productId as string)!, Number(source.quantity))
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
              row.id !== functionOrderSaleId &&
              !bundleSaleIds.has(row.id as string) &&
              !saleRows.some((other) => other.sourceSaleId === row.id),
          )

        if (candidate) {
          cashTaken = cashTaken.minus(voidDocument(candidate, pick(VOID_REASONS), null))
          // A voided sale in the window sold nothing: its units go back.
          if ((candidate.postedAt as Date).getTime() >= windowCounts) {
            for (const line of lineRows.filter((row) => row.saleId === candidate.id)) {
              giveBack(codeOfProduct.get(line.productId as string)!, Number(line.quantity))
            }
          }
        }
      }

      /*
        FLR-03: about one closed drawer in four sent US$100–US$300 to the
        safe a few hours in, approved by Tafara Nyathi, never more than the
        drawer held; the drawer's expected cash and its count follow.
      */
      let dropped = money(0)
      const inDrawer = openingFloat.plus(cashTaken).minus(20)
      // FLR-05: a drawer whose expected cash the SignOff board fixes (its function order took enough) drops the rest.
      const pinned = pinnedExpected.get(slot)
      if (pinned && closedAt) {
        dropped = Prisma.Decimal.max(0, openingFloat.plus(cashTaken).minus(pinned))
        if (!openingFloat.plus(cashTaken).minus(dropped).equals(pinned)) console.warn(`  ${shiftNo} took too little cash to hold US$${pinned.toFixed(2)}`)
      } else if (closedAt && dropApprover && Math.random() < 0.25 && inDrawer.greaterThanOrEqualTo(100)) {
        dropped = money(String(Math.min(between(100, 300), Math.floor(inDrawer.toNumber()))))
      }
      if (closedAt && dropApprover && dropped.greaterThan(0)) {
        const at = new Date(Math.min(openedAt.getTime() + between(150, 300) * 60 * 1000, closedAt.getTime() - 10 * 60 * 1000))
        movementRows.push({
          id: randomUUID(),
          companyId,
          shiftId,
          type: "DROP_TO_SAFE",
          reasonCode: "CASH_LEVEL_TOO_HIGH",
          amount: dropped,
          currency: "USD",
          exchangeRate: rate("1"),
          baseAmount: dropped,
          recordedById: cashier.id,
          recordedByName: cashier.name,
          approvedById: dropApprover.id,
          approvedByName: dropApprover.name,
          createdAt: at,
        })
      }

      const expectedCash = openingFloat.plus(cashTaken).minus(dropped)
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
        closeNote: !wasCounted
          ? null
          : (closeNotes.get(slot) ?? (varianceAmount.abs().greaterThan(1) ? pick(varianceAmount.isNegative() ? SHORT_NOTES : OVER_NOTES) : null)),
        status: closedAt ? "CLOSED" : "OPEN",
        // The float each close left for the next opening's default (FLR-03; packet 54 counts it).
        floatLeft: closedAt ? money("100.00") : null,
        openedAt,
        closedAt,
        createdAt: openedAt,
        updatedAt: closedAt ?? openedAt,
      })
    }
  }

  // ── FLR-01: the boards' morning, then every number ──────────────────────
  {
    const front = shiftRows.find((row) => row.status === "OPEN" && row.registerCode === register.code)!
    const back = shiftRows.find((row) => row.status === "OPEN" && row.registerCode === backRegister.code)!
    const approver = staff.find((person) => person.name === "Tafara Nyathi") ?? null
    const written = new Map<FloorSale["key"], SaleRow>()
    for (const floor of FLOOR_SALES) {
      const shift = floor.till === "front" ? front : back
      const at = floorAt(floor.at)
      const saleId = randomUUID()
      const lines: LineRow[] = floor.lines.map((line) => {
        const product = byCode.get(line.code)!
        const target = stocked.get(line.code)!
        const units = rate(String(line.units))
        const price = line.price ?? product.price
        const gross = multiplyMoney(units, price)
        return {
          id: randomUUID(),
          companyId,
          saleId,
          inventoryItemId: target.inventoryItemId,
          productId: target.productId,
          itemName: product.name,
          quantity: units,
          unitPrice: money(price),
          discountAmount: money(0),
          taxAmount: gross.minus(netOfInclusiveTax(gross, VAT_PERCENT)),
          lineTotal: gross,
          costUnit: money(product.cost),
          costTotal: multiplyMoney(units, product.cost),
          depositAmount: money(0),
          createdAt: at,
        }
      })
      const total = sumMoney(lines.map((line) => line.lineTotal as Prisma.Decimal))
      const tax = sumMoney(lines.map((line) => line.taxAmount as Prisma.Decimal))
      const customer = floor.customer ? customerNamed(floor.customer) : null
      const row: SaleRow = {
        id: saleId,
        companyId,
        saleNo: floor.saleNo ?? `F-${saleId}`,
        shiftId: shift.id as string,
        registerId: shift.registerId,
        siteId: shift.siteId,
        cashierId: shift.cashierId,
        cashierName: shift.cashierName,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
        saleType: "SALE",
        status: "POSTED",
        subtotal: total.minus(tax),
        discountAmount: money(0),
        taxAmount: tax,
        totalAmount: total,
        depositAmount: money(0),
        tenderedAmount: total,
        changeAmount: money(0),
        currency: "USD",
        exchangeRate: rate("1"),
        baseAmount: total,
        // Johnnie Walker is age-checked: the ID a minute before the card went through.
        idCheckedAt: floor.key === "card" ? new Date(at.getTime() - 60 * 1000) : null,
        postedAt: at,
        createdAt: at,
        updatedAt: at,
      }
      saleRows.push(row)
      lineRows.push(...lines)
      paymentRows.push({
        id: randomUUID(),
        companyId,
        saleId,
        tenderType: floor.tender,
        amount: total,
        currency: "USD",
        exchangeRate: rate("1"),
        baseAmount: total,
        reference: floor.reference ?? null,
        createdAt: at,
      })
      if (floor.tender === "CASH") shift.expectedCash = money(shift.expectedCash as Prisma.Decimal).plus(total)
      written.set(floor.key, row)
    }

    // SALE-31858 rung up wrong on the Back till; Tafara Nyathi approved the void.
    const voided = written.get("voided")!
    back.expectedCash = money(back.expectedCash as Prisma.Decimal).minus(voidDocument(voided, "Rang up wrong", approver))

    // RFD-0044: Tinashe Mavhunga brought the Jameson back; the shelf takes it again.
    const sold = written.get("tinashe")!
    const soldLine = lineRows.find((line) => line.saleId === sold.id)!
    const refundAt = floorAt([11, 51])
    const refundId = randomUUID()
    const negate = (value: unknown) => money(value as Prisma.Decimal).negated()
    saleRows.push({
      ...sold,
      id: refundId,
      saleNo: `R-${refundId}`,
      saleType: "REFUND",
      sourceSaleId: sold.id,
      subtotal: negate(sold.subtotal),
      taxAmount: negate(sold.taxAmount),
      totalAmount: negate(sold.totalAmount),
      tenderedAmount: negate(sold.tenderedAmount),
      baseAmount: negate(sold.baseAmount),
      overrideReason: "Changed mind",
      restocked: true,
      postedAt: refundAt,
      createdAt: refundAt,
      updatedAt: refundAt,
    })
    lineRows.push({
      ...soldLine,
      id: randomUUID(),
      saleId: refundId,
      sourceLineId: soldLine.id as string,
      quantity: negate(soldLine.quantity),
      taxAmount: negate(soldLine.taxAmount),
      lineTotal: negate(soldLine.lineTotal),
      costTotal: negate(soldLine.costTotal),
      promotionId: null,
      promotionDiscount: money(0),
      createdAt: refundAt,
    })
    paymentRows.push({
      id: randomUUID(),
      companyId,
      saleId: refundId,
      tenderType: "CASH",
      amount: negate(sold.totalAmount),
      currency: "USD",
      exchangeRate: rate("1"),
      baseAmount: negate(sold.baseAmount),
      reference: null,
      createdAt: refundAt,
    })
    front.expectedCash = money(front.expectedCash as Prisma.Decimal).minus(money(sold.baseAmount as Prisma.Decimal))

    // Three sales of the last few days wait for a manager to look at them (W-44).
    const flaggable = saleRows
      .filter((row) => row.saleType === "SALE" && row.status === "POSTED" && ![...written.values()].includes(row))
      .filter((row) => (row.postedAt as Date).getTime() > now.getTime() - 4 * DAY_MS && (row.postedAt as Date).getTime() < floorFirst.getTime())
      .slice(-3)
    const why = ["Discount over the till's limit.", "Price changed at the till.", "Sold after licence hours."]
    flaggable.forEach((row, index) => {
      row.reviewReason = why[index]
    })

    // Numbers in the order they were rung: sales up to SALE-31870, refunds and voids from 1.
    const byTime = (a: SaleRow, b: SaleRow) => (a.postedAt as Date).getTime() - (b.postedAt as Date).getTime()
    const rung = saleRows.filter((row) => row.saleType === "SALE").sort(byTime)
    rung.forEach((row, index) => {
      row.saleNo = `SALE-${String(LAST_SALE_NO - (rung.length - 1 - index)).padStart(5, "0")}`
    })
    for (const floor of FLOOR_SALES) {
      const got = written.get(floor.key)!.saleNo
      if (floor.saleNo && got !== floor.saleNo) console.warn(`  the boards' ${floor.saleNo} came out as ${got}`)
    }
    saleRows
      .filter((row) => row.saleType === "REFUND")
      .sort(byTime)
      .forEach((row, index) => {
        row.saleNo = `RFD-${String(index + 1).padStart(4, "0")}`
      })
    saleRows
      .filter((row) => row.saleType === "VOID")
      .sort(byTime)
      .forEach((row, index) => {
        row.saleNo = `VOID-${String(index + 1).padStart(4, "0")}`
      })
    const refundNo = saleRows.find((row) => row.id === refundId)!.saleNo
    if (refundNo !== `RFD-${String(FLOOR_REFUND_NO).padStart(4, "0")}`) console.warn(`  the boards' refund is ${refundNo}, not RFD-0044`)
    console.log(`  the boards' morning: SALE-31858 to SALE-31870, ${refundNo}, ${flaggable.length} sales to look at`)
  }

  if (quota.left + soldOutQuota.left > 0) {
    console.warn(`  ${quota.left + soldOutQuota.left} unit(s) of the 30-day quotas were not sold: run again`)
  }

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
  await insert("drops to the safe on closed drawers", movementRows, (batch) =>
    prisma.retailCashMovement.createMany({ data: batch, skipDuplicates: true }),
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

  // ── Vouchers (PRD-10), through their services, on the sales dealt for them ──
  await seedVouchers(companyId)

  // ── Customers (CUS-02): the board's regulars, the members, their visits and points ──
  await seedCustomers(companyId)

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
  if (reset) await clearPurchasing(companyId)
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
  await seedPins(companyId, passwordHash)
  await seedPeople({ companyId, mainSiteId: site.id, borrowdaleId: borrowdale.id, passwordHash, reset })
  await seedSuppliers({ companyId, mainSiteId: site.id, softDrinksId: categoryIds.get("Soft drinks") ?? null, reset })
  await seedTransfers({ companyId, mainSiteId: site.id, borrowdaleId: borrowdale.id, reset })
  await seedAdjustments({ companyId, mainSiteId: site.id, reset })
  await seedCounts({ companyId, mainSiteId: site.id })
  await seedEmpties(companyId, site.id)
  await seedPriceHistory(companyId)
  await seedPriceLists({ companyId, borrowdaleId: borrowdale.id, reset })
  await seedStockLedger(companyId, site.id)
  await seedBin({ companyId, siteId: site.id, locationId: location.id, wineId: categoryIds.get("Wine") ?? null, reset })
  await seedPayments(companyId)
  await seedPosting(companyId)
  await seedReceipts(companyId)
  await seedFiscal(companyId)
  await seedOverview(companyId)
  await seedApprovals(companyId)
  await seedLoyalty(companyId)
  await seedShiftFloor(companyId)
  await seedShiftCounts(companyId)
  await seedShiftVariances(companyId)
  await seedSignOffs(companyId)
  await seedDayCloses(companyId)
  await seedImportDemo({ companyId, mainSiteId: site.id, softDrinksId: categoryIds.get("Soft drinks") ?? null })
  await seedReportTemplates(companyId)

  const takings = sumMoney(saleRows.map((row) => row.baseAmount as Prisma.Decimal))
  console.log(
    `\n  ${refunds} refund(s), ${voids} void(s) flagged, ${zwgSales} sale(s) settled in ZWG` +
      `\n  takings across the period: $${takings.toFixed(2)}` +
      `\n  three shifts left OPEN: the Front till this morning, the Back till 52 hours ago, Handheld 1 since 10:05` +
      `\n\nSign in as any of:\n${STAFF.map((s) => `  ${s.role.padEnd(12)} ${s.email}`).join("\n")}` +
      `\n  password: ${STAFF_PASSWORD}`,
  )
}

/**
 * STK-09 `seedEmpties()`: Harare Main Branch's Empties ledger, written through
 * the service in time order so every entry's "In the store" is the running
 * balance. A ledger brought forward from the paper book, customers' empties
 * brought back over five weeks, three returns (Delta twice, Natbrew) and
 * Delta's credit note CN-2210 on 2 October; then the board's three newest
 * rows — Delta's GRN-0005 return yesterday 17:40, Tapiwa Marange's 24 bottles
 * and 2 crates today 11:02 — with a deposit charged for every seeded sale of
 * the last 30 days that took one. The store holds 628 · 49 before the board's
 * four rows and 412 · 31 after; Held for customers reads US$84.30 and Owed by
 * suppliers US$231.00, which the seed checks.
 */
async function seedEmpties(companyId: string, mainSiteId: string) {
  await prisma.platformAuditEvent.deleteMany({ where: { companyId, entityType: "RetailEmptiesEntry" } })
  await prisma.retailEmptiesEntry.deleteMany({ where: { companyId, returnId: { not: null } } })
  await prisma.retailEmptiesEntry.deleteMany({ where: { companyId } })

  const tafara = await prisma.user.findFirstOrThrow({ where: { companyId, email: "tafara.manager@bottlestore.test" }, select: { id: true } })
  const actor = { companyId, userId: tafara.id, userName: "Tafara Nyathi", userRole: "MANAGER" }
  const delta = await prisma.vendor.findFirstOrThrow({ where: { companyId, name: "Delta Beverages" }, select: { id: true } })
  const natbrew =
    (await prisma.vendor.findFirst({ where: { companyId, name: "Natbrew" }, select: { id: true } })) ??
    (await prisma.vendor.create({ data: { companyId, name: "Natbrew", phone: "+263 24 262 1180" }, select: { id: true } }))
  const customers = await prisma.customer.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: "asc" } })
  const tapiwa = customers.find((customer) => customer.name === "Tapiwa Marange") ?? null

  type Step = { at: Date; run: (tx: Prisma.TransactionClient, at: Date) => Promise<unknown> }
  const steps: Step[] = []
  const back = (at: Date, bottles: number, crates: number, customerId: string | null) =>
    steps.push({
      at,
      run: (tx, when) =>
        recordEmptiesEntry(tx, { companyId, siteId: mainSiteId, kind: "BOTTLES_BACK", bottles, crates, deposit: money(bottles * 0.1 + crates * 3).negated(), customerId, createdById: tafara.id, at: when }),
    })

  // Customers' empties over five weeks: 40 visits of 12 to 48 bottles and 1 to 4 crates, 1,318 bottles and 103 crates in all.
  const bottles = Array.from({ length: 40 }, (_, i) => 12 + ((i * 17) % 37))
  const crates = Array.from({ length: 40 }, (_, i) => 1 + ((i * 3) % 4))
  const settle = (counts: number[], want: number, low: number, high: number) => {
    let gap = want - counts.reduce((sum, n) => sum + n, 0)
    for (let i = 0; gap !== 0 && i < counts.length * 64; i++) {
      const at = i % counts.length
      if (gap > 0 && counts[at]! < high) {
        counts[at]! += 1
        gap -= 1
      } else if (gap < 0 && counts[at]! > low) {
        counts[at]! -= 1
        gap += 1
      }
    }
  }
  settle(bottles, 1318, 12, 48)
  settle(crates, 103, 1, 4)
  bottles.forEach((count, i) => back(harareTime(38 - Math.floor(i * 0.7), 9 + (i % 8), (i * 13) % 60), count, crates[i]!, customers[i % Math.max(customers.length, 1)]?.id ?? null))

  // Three returns before 2 October; the first is the one CN-2210 credits.
  let firstReturn = ""
  const ret = (at: Date, supplierId: string, b: number, c: number, note: string, first = false) =>
    steps.push({
      at,
      run: async (tx, when) => {
        const booked = await bookEmptiesReturn(tx, { actor, siteId: mainSiteId, supplierId, bottles: b, crates: c, note, at: when })
        if (first) firstReturn = booked.id
      },
    })
  ret(harareTime(20, 16, 5), delta.id, 240, 20, "The delivery, 22 September", true)
  ret(harareTime(14, 15, 20), natbrew.id, 300, 20, "Their truck, 28 September")
  ret(harareTime(11, 17, 0), delta.id, 150, 14, "The delivery, 1 October")
  const creditAt = harareAt("2026-10-02", "09:30")
  steps.push({ at: creditAt, run: (tx, when) => recordEmptiesCredit(tx, { actor, returnId: firstReturn, creditNote: "CN-2210", amount: "84.00", at: when }) })

  // The board's newest rows.
  steps.push({
    at: harareTime(1, 17, 40),
    run: (tx, when) => bookEmptiesReturn(tx, { actor, siteId: mainSiteId, supplierId: delta.id, bottles: 240, crates: 20, reference: "GRN-0005", note: "The next delivery, 7 October", at: when }),
  })
  back(harareTime(0, 11, 2), 24, 2, tapiwa?.id ?? null)

  // A deposit charged for every seeded sale of the last 30 days that took one.
  const deposited = await prisma.retailSale.findMany({
    where: { companyId, saleType: "SALE", depositAmount: { gt: 0 }, postedAt: { gte: daysAgo(30) } },
    select: { id: true, saleNo: true, siteId: true, customerId: true, cashierId: true, depositAmount: true, postedAt: true },
  })
  for (const sale of deposited) {
    steps.push({
      at: sale.postedAt ?? new Date(),
      run: (tx, when) =>
        recordSaleEmpties(tx, { companyId, siteId: sale.siteId, saleId: sale.id, saleNo: sale.saleNo, customerId: sale.customerId, createdById: sale.cashierId, depositAmount: sale.depositAmount, lines: [], at: when }),
    })
  }

  // Brought forward from the paper ledger: what customers' deposits stood at before the history, so Held reads US$84.30.
  const charged = sumMoney(deposited.map((sale) => sale.depositAmount))
  const paidBack = money(bottles.reduce((sum, n) => sum + n, 0) * 0.1 + crates.reduce((sum, n) => sum + n, 0) * 3 + 8.4)
  const forward = money("84.30").plus(paidBack).minus(charged)
  steps.push({
    at: harareTime(40, 8, 0),
    run: (tx, when) =>
      recordEmptiesEntry(tx, { companyId, siteId: mainSiteId, kind: "DEPOSIT_CHARGED", deposit: forward, note: "Brought forward from the paper ledger", createdById: tafara.id, at: when }),
  })

  // Nothing after now: inStore() reads the latest entry, so a row stamped later
  // than the till's next write would hide it. The board's "today 11:02" row
  // lands a few minutes before now when the seed runs earlier, the rows before
  // it keeping their order a second apart.
  steps.sort((a, b) => a.at.getTime() - b.at.getTime())
  const latest = Date.now() - 3 * 60 * 1000
  steps.forEach((step, i) => {
    step.at = new Date(Math.min(step.at.getTime(), latest - (steps.length - 1 - i) * 1000))
  })
  for (const step of steps) await prisma.$transaction((tx) => step.run(tx, step.at))

  const balances = await emptiesBalances(prisma, companyId)
  const store = await inStore(prisma, mainSiteId)
  const future = await prisma.retailEmptiesEntry.count({ where: { companyId, createdAt: { gt: new Date() } } })
  if (future > 0) throw new Error(`Empties seed is off: ${future} entries stamped after now`)
  if (balances.held.toFixed(2) !== "84.30" || balances.owed.toFixed(2) !== "231.00" || store.bottles !== 412 || store.crates !== 31) {
    throw new Error(
      `Empties seed is off: held ${balances.held.toFixed(2)} (want 84.30), owed ${balances.owed.toFixed(2)} (want 231.00), in the store ${store.bottles} · ${store.crates} (want 412 · 31)`,
    )
  }
  console.log(`  empties: ${steps.length} entries, held US$84.30, owed US$231.00, 412 · 31 in the store`)
}

/**
 * FLR-03 `seedShiftFloor()`: the shift floor's books. `ensureAccountingDefaults`
 * gives an existing tenant 5110 Petty cash, the shift-open rule's two till
 * debits and the cash-movement and petty-cash rules. The three open drawers
 * and the drops are written with the history above.
 */
async function seedShiftFloor(companyId: string) {
  await ensureAccountingDefaults(companyId)
  const open = await prisma.retailShift.findMany({
    where: { companyId, status: "OPEN" },
    orderBy: { shiftNo: "asc" },
    select: { shiftNo: true, registerName: true, cashierName: true, expectedCash: true, _count: { select: { sales: { where: { saleType: "SALE", status: "POSTED" } } } } },
  })
  const drops = await prisma.retailCashMovement.count({ where: { companyId, type: "DROP_TO_SAFE" } })
  console.log(
    `  shift floor: ${open.map((shift) => `${shift.shiftNo} ${shift.registerName} (${shift.cashierName}, ${shift._count.sales} sales, US$${shift.expectedCash.toFixed(2)} in the drawer)`).join("; ")}; ${drops} drops to the safe`,
  )
}

/**
 * FLR-04 `seedShiftCounts()`: every closed drawer in the history as Count and
 * close leaves it. A counted one has its count by note adding up to what was
 * counted (US$ notes, largest first, the last few dollars as US$1; cents are
 * not notes, so they stay off the lines and in countedCash), the day's ZiG rate, no ZiG, the float
 * left for tomorrow (US$100.00, or all of it when less was counted) and the
 * rest to the safe, closed by its cashier. The three closed without a count
 * say why: "Device lost, counted next morning".
 */
async function seedShiftCounts(companyId: string) {
  const [shifts, rates] = await Promise.all([
    prisma.retailShift.findMany({
      where: { companyId, status: "CLOSED" },
      select: { id: true, cashierId: true, closedAt: true, countedCash: true },
    }),
    prisma.currencyRate.findMany({
      where: { companyId, baseCurrency: "USD", quoteCurrency: "ZWG" },
      orderBy: { effectiveDate: "asc" },
      select: { rate: true, effectiveDate: true },
    }),
  ])
  const NOTES = [100, 50, 20, 10, 5]
  const rows = shifts.map((shift) => {
    if (shift.countedCash === null) {
      return { id: shift.id, closedById: shift.cashierId, closeNote: "Device lost, counted next morning", countedUsd: null, countRate: null, lines: null, floatLeft: null, toSafe: null }
    }
    const counted = money(shift.countedCash)
    let left = Math.floor(counted.toNumber())
    const lines = NOTES.flatMap((note) => {
      const count = Math.floor(left / note)
      left -= count * note
      return count > 0 ? [{ denomination: String(note), count }] : []
    })
    if (left > 0) lines.push({ denomination: "1", count: left })
    const at = shift.closedAt ?? new Date()
    const dayRate = [...rates].reverse().find((row) => row.effectiveDate <= at)?.rate ?? null
    const floatLeft = counted.lessThan(100) ? counted : money("100.00")
    return {
      id: shift.id,
      closedById: shift.cashierId,
      closeNote: null,
      countedUsd: counted.toFixed(2),
      countRate: dayRate ? money(dayRate).toFixed(4) : "1.0000",
      lines: JSON.stringify({ USD: lines, ZWG: [] }),
      floatLeft: floatLeft.toFixed(2),
      toSafe: counted.minus(floatLeft).toFixed(2),
    }
  })
  await prisma.$executeRaw`
    UPDATE "RetailShift" AS s SET
      "closedById" = v."closedById",
      "closeNote" = COALESCE(v."closeNote", s."closeNote"),
      "countedUsd" = v."countedUsd"::numeric,
      "countedZig" = CASE WHEN v."countedUsd" IS NULL THEN NULL ELSE 0 END,
      "countRate" = v."countRate"::numeric,
      "countLines" = v."lines"::jsonb,
      "floatLeft" = v."floatLeft"::numeric,
      "toSafe" = v."toSafe"::numeric
    FROM (
      SELECT * FROM unnest(
        ${rows.map((row) => row.id)}::text[],
        ${rows.map((row) => row.closedById)}::text[],
        ${rows.map((row) => row.closeNote)}::text[],
        ${rows.map((row) => row.countedUsd)}::text[],
        ${rows.map((row) => row.countRate)}::text[],
        ${rows.map((row) => row.lines)}::text[],
        ${rows.map((row) => row.floatLeft)}::text[],
        ${rows.map((row) => row.toSafe)}::text[]
      ) AS t("id", "closedById", "closeNote", "countedUsd", "countRate", "lines", "floatLeft", "toSafe")
    ) AS v
    WHERE s."id" = v."id"`
  const uncounted = rows.filter((row) => row.countedUsd === null).length
  console.log(`  shift counts: ${rows.length - uncounted} closed drawers counted by note, ${uncounted} closed without a count`)
}

/** A seeded journal posted as that night's run posted it, whatever the shop's posting schedule. */
async function postSeededJournal(context: Parameters<typeof createJournalEntryFromSource>[0]) {
  const result = await createJournalEntryFromSource(context, prisma, { postNow: true })
  if (!result.entryId && !result.skipped) throw new Error(`${context.description}: ${result.error ?? "not posted"}`)
}

/**
 * FLR-05 `seedShiftVariances()`: every counted difference in the history as
 * the close books it (RETAIL_SHIFT_VARIANCE, FLR-04): a short drawer debits
 * Cash over short (5420), an over one credits it, dated at the close. The
 * history's other journals (its opens, sales and closes) are not seeded, so
 * 5420 reads exactly the drawers' differences and a recovery nets its own
 * back to nothing.
 */
async function seedShiftVariances(companyId: string) {
  const shiftIds = (await prisma.retailShift.findMany({ where: { companyId }, select: { id: true } })).map((shift) => shift.id)
  await prisma.journalEntry.deleteMany({ where: { companyId, sourceType: "RETAIL_SHIFT_VARIANCE", sourceId: { notIn: shiftIds } } })
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId, sourceType: "RETAIL_SHIFT_VARIANCE", sourceId: { notIn: shiftIds } } })
  const booked = new Set(
    (await prisma.journalEntry.findMany({ where: { companyId, sourceType: "RETAIL_SHIFT_VARIANCE" }, select: { sourceId: true } })).map((entry) => entry.sourceId),
  )
  const differences = await prisma.retailShift.findMany({
    where: { companyId, status: "CLOSED", closedAt: { not: null }, variance: { not: 0 } },
    orderBy: { closedAt: "asc" },
    select: { id: true, shiftNo: true, siteId: true, registerCode: true, cashierId: true, closedAt: true, variance: true },
  })
  let posted = 0
  for (const shift of differences.filter((row) => !booked.has(row.id))) {
    const variance = money(shift.variance!)
    const amount = toNumberOrZero(variance.abs())
    await postSeededJournal({
      companyId,
      sourceType: "RETAIL_SHIFT_VARIANCE",
      sourceId: shift.id,
      sourceSubtype: variance.isNegative() ? "SHORT" : "OVER",
      siteId: shift.siteId,
      registerCode: shift.registerCode,
      entryDate: shift.closedAt!,
      createdById: shift.cashierId,
      description: `Retail shift variance ${shift.shiftNo}`,
      amount,
      netAmount: amount,
      grossAmount: amount,
      taxAmount: 0,
      invertDirection: variance.isNegative(),
    })
    posted += 1
  }
  console.log(`  shift variances: ${posted} posted to cash over short; ${differences.length} counted differences in all`)
}

/**
 * FLR-05 `seedSignOffs()`: who signed off the drawers that closed out. Last
 * week's Wednesday's Front till drawer, Chipo Dube's US$20.00 short, Tafara
 * Nyathi recovered the next morning with her agreement noted, and its
 * recovery journal is posted (Dr 1150 Staff owe the shop, Cr 5420). Every
 * other difference before this week, and every drawer closed without a
 * count, Tafara accepted the morning after. Each sign-off has its approval
 * and its line on the shift's Activity ("Signed off: US$20.00 to recover",
 * "Signed off: accepted −US$3.40"), dated when he made it. This week's three
 * short drawers wait. A sign-off already made (an acceptance walk without
 * --reset) stays.
 */
async function seedSignOffs(companyId: string) {
  await ensureAccountingDefaults(companyId)
  const tafara = await prisma.user.findFirst({ where: { companyId, email: "tafara.manager@bottlestore.test" }, select: { id: true, name: true, role: true } })
  if (!tafara) return
  const weekStarts = harareTime(daysSinceMonday(), 0, 0)
  const lastWednesday = dayKey(harareTime(daysSinceMonday() + 5, 12, 0))
  const morningAfter = (closedAt: Date) => new Date(Math.min(closedAt.getTime() + 14 * 60 * 60 * 1000, Date.now() - 60 * 1000))

  // A recovery whose shift a reset replaced has nothing left to point at.
  const shiftIds = (await prisma.retailShift.findMany({ where: { companyId }, select: { id: true } })).map((shift) => shift.id)
  const orphans = { companyId, sourceType: "RETAIL_SHIFT_RECOVERY" as const, sourceId: { notIn: shiftIds } }
  await prisma.journalEntry.deleteMany({ where: orphans })
  await prisma.accountingIntegrationEvent.deleteMany({ where: orphans })
  await prisma.approvalAction.deleteMany({ where: { companyId, entityType: "RETAIL_SHIFT", entityId: { notIn: shiftIds } } })
  await prisma.platformAuditEvent.deleteMany({ where: { companyId, eventType: RETAIL_AUDIT_EVENTS.shiftSignedOff, entityId: { notIn: shiftIds } } })

  // The sign-off's line on the shift's Activity, dated when Tafara made it.
  const signedOff = async (shift: { id: string; shiftNo: string; variance: Prisma.Decimal | null }, outcome: "ACCEPT" | "RECOVER", at: Date, note: string | null) => {
    await writeRetailAuditEvent(prisma, {
      actor: { companyId, userId: tafara.id, userName: tafara.name, userRole: tafara.role },
      eventType: RETAIL_AUDIT_EVENTS.shiftSignedOff,
      entityType: "RetailShift",
      entityId: shift.id,
      reason: note,
      payload: { shiftNo: shift.shiftNo, outcome, amount: auditAmount(shift.variance), note },
    })
    await prisma.platformAuditEvent.updateMany({
      where: { companyId, eventType: RETAIL_AUDIT_EVENTS.shiftSignedOff, entityId: shift.id },
      data: { createdAt: at },
    })
  }

  const waiting = await prisma.retailShift.findMany({
    where: { companyId, status: "CLOSED", signOffOutcome: null, OR: [{ countedCash: null }, { variance: null }, { variance: { not: 0 } }] },
    select: { id: true, shiftNo: true, registerCode: true, siteId: true, cashierName: true, openedAt: true, closedAt: true, variance: true },
  })
  const recovered = waiting.find(
    (shift) =>
      shift.registerCode === "TILL-1" &&
      shift.cashierName === "Chipo Dube" &&
      shift.variance !== null &&
      money(shift.variance).equals(money("-20.00")) &&
      dayKey(shift.openedAt) === lastWednesday,
  )
  const before = waiting.filter((shift) => shift.closedAt && shift.closedAt.getTime() < weekStarts.getTime() && shift.id !== recovered?.id)
  for (const shift of before) {
    const at = morningAfter(shift.closedAt!)
    await prisma.retailShift.update({ where: { id: shift.id }, data: { signOffOutcome: "ACCEPT", signedOffAt: at, signedOffById: tafara.id } })
    await prisma.approvalAction.create({
      data: { companyId, entityType: "RETAIL_SHIFT", entityId: shift.id, action: "APPROVE", actedById: tafara.id, fromStatus: "CLOSED", toStatus: "SIGNED_OFF", createdAt: at },
    })
    await signedOff(shift, "ACCEPT", at, null)
  }

  if (recovered?.closedAt) {
    const at = morningAfter(recovered.closedAt)
    const note = "Chipo says a US$20 note went out as change for a US$10. Agreed to recover."
    await prisma.retailShift.update({
      where: { id: recovered.id },
      data: { signOffOutcome: "RECOVER", signedOffAt: at, signedOffById: tafara.id, signOffNote: note, recoverAmount: money("20.00") },
    })
    await prisma.approvalAction.create({
      data: { companyId, entityType: "RETAIL_SHIFT", entityId: recovered.id, action: "APPROVE", actedById: tafara.id, fromStatus: "CLOSED", toStatus: "SIGNED_OFF", note, createdAt: at },
    })
    await signedOff(recovered, "RECOVER", at, note)
    // After its variance journal (seedShiftVariances), so 5420 nets the drawer back to nothing.
    await postSeededJournal({
      companyId,
      sourceType: "RETAIL_SHIFT_RECOVERY",
      sourceId: recovered.id,
      siteId: recovered.siteId,
      registerCode: recovered.registerCode,
      entryDate: at,
      createdById: tafara.id,
      description: `Retail shift recovery ${recovered.shiftNo}`,
      amount: 20,
      netAmount: 20,
      grossAmount: 20,
      taxAmount: 0,
    })
  }

  const open = await prisma.retailShift.findMany({
    where: { companyId, status: "CLOSED", OR: [{ signOffOutcome: null }, { signOffOutcome: "LOOK_INTO" }], AND: [{ OR: [{ countedCash: null }, { variance: { not: 0 } }] }] },
    orderBy: { openedAt: "asc" },
    select: { shiftNo: true, cashierName: true, variance: true },
  })
  console.log(
    `  sign-offs: ${before.length} older difference(s) accepted by Tafara Nyathi; ${recovered ? `${recovered.shiftNo} recovered from Chipo Dube (US$20.00)` : "no drawer to recover"}; ` +
      `waiting: ${open.map((shift) => `${shift.shiftNo} ${shift.cashierName} ${shift.variance === null ? "not counted" : money(shift.variance).toFixed(2)}`).join(", ") || "none"}`,
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
/**
 * FLR-07 `seedDayCloses()`: every past trading day of the history closed at
 * 22:00 (or a few minutes after its last drawer closed, when later) by Tafara Nyathi through Close the day itself — each till's Z-report,
 * the figures frozen, the day's "Cash, US$" banked to CBZ (the default bank
 * account, made when the tenant has none of its own: the books' placeholder
 * does not count). Only where a day can close: the
 * day the stale Back till opened and the days of this week's unsigned
 * shortages stay "Not closed"; older accepted shortages close "Signed off short".
 */
async function seedDayCloses(companyId: string) {
  const tafara = await prisma.user.findFirst({ where: { companyId, email: "tafara.manager@bottlestore.test" }, select: { id: true, name: true, role: true, email: true } })
  if (!tafara) return
  // The books' own placeholder ("Operating Bank" at "Seeded Foundation Bank") is not a bank the shop uses.
  const settings = await prisma.accountingSettings.findUnique({ where: { companyId }, select: { defaultBankAccount: { select: { bankName: true } } } })
  if (!settings?.defaultBankAccount || settings.defaultBankAccount.bankName === "Seeded Foundation Bank") {
    const account =
      (await prisma.bankAccount.findFirst({ where: { companyId, name: "CBZ current account" }, select: { id: true } })) ??
      (await prisma.bankAccount.create({ data: { companyId, name: "CBZ current account", bankName: "CBZ", currency: "USD" }, select: { id: true } }))
    await prisma.accountingSettings.upsert({
      where: { companyId },
      update: { defaultBankAccountId: account.id },
      create: { companyId, defaultBankAccountId: account.id },
    })
  }

  const today = tradingDayKey(new Date())
  const [shifts, backOffice] = await Promise.all([
    prisma.retailShift.findMany({ where: { companyId }, select: { siteId: true, openedAt: true } }),
    prisma.retailSale.findMany({ where: { companyId, shiftId: null, saleType: { in: ["SALE", "REFUND", "VOID"] } }, select: { siteId: true, postedAt: true } }),
  ])
  const days = [
    ...new Set([
      ...shifts.map((shift) => `${shift.siteId}|${tradingDayKey(shift.openedAt)}`),
      ...backOffice.map((sale) => `${sale.siteId}|${tradingDayKey(sale.postedAt)}`),
    ]),
  ]
    .filter((key) => key.split("|")[1]! < today)
    .sort((a, b) => a.split("|")[1]!.localeCompare(b.split("|")[1]!))
  const actor = { user: { id: tafara.id, companyId, name: tafara.name, role: tafara.role, email: tafara.email } }
  let closed = 0
  let already = 0
  const left: string[] = []
  for (const key of days) {
    const [siteId, date] = key.split("|") as [string, string]
    const { shifts: own, sales } = await loadDayRows(companyId, siteId, date)
    const cash = money(dayFigures(own, sales).cashUsd)
    // 22:00, or a few minutes after the last drawer closed when that was later: a day never closes before its drawers.
    const lastDrawer = Math.max(0, ...own.map((shift) => shift.closedAt?.getTime() ?? 0))
    const closedAt = new Date(Math.max(new Date(`${date}T20:00:00.000Z`).getTime(), lastDrawer + 4 * 60_000))
    try {
      await closeDay(actor, { siteId, date, banked: (cash.isNegative() ? ZERO : cash).toFixed(2) }, { now: closedAt })
      closed += 1
    } catch (error) {
      if (!(error instanceof DayRefused) || error.status !== 409) throw error
      if (/closed already/.test(error.message)) already += 1
      else left.push(`${date} (${error.message})`)
    }
  }
  // The cash banked as each night's posting run posted it: Dr 1010 Operating bank, Cr 1005 Cash vault.
  for (const event of await prisma.accountingIntegrationEvent.findMany({ where: { companyId, sourceType: "RETAIL_DAY_BANKED", status: "PENDING" } })) {
    await postIntegrationEvent(event)
  }
  console.log(`  day closes: ${closed} closed, ${already} closed before, ${left.length} not closed${left.length ? `: ${left.join("; ")}` : ""}`)
}

async function seedSites(input: { companyId: string; mainSiteId: string; borrowdaleId: string; reset: boolean }) {
  const { companyId, mainSiteId, borrowdaleId } = input
  const priceList = await findDefaultPriceList(prisma, companyId)
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
 * few minutes ago), Handheld 1's Kora (last seen 44 minutes ago with a shift
 * open: Offline), the Borrowdale till's CounterMini (silent for two hours: Offline 2
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
    // FLR-03: Handheld 1 has Tendai Mhlanga's shift open and last called in 44 minutes ago (Offline).
    { code: "TILL-3", kind: "KORA", lastSeenAt: minutesAgo(44) },
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
 * ADM-03 `seedPins()`: the PINs testers type at a paired till, chosen (not
 * issued) so "Who is selling?" opens the till at once. Demo values, printed
 * here and nowhere else:
 *
 *   Tendai Mhlanga 1357 · Tafara Nyathi 2468 · Chipo Dube 1928
 *   Kuda Banda 3746 · Rudo Moyo 5091 · Farai Moyo 6024 (locked)
 *
 * Kuda Banda is a cashier the admin area also seeds (upserted by email, so the
 * two converge). Ruvimbo Chari has no PIN.
 */
const TILL_PINS: Array<{ email: string; name: string; pin: string }> = [
  { email: "owner@bottlestore.test", name: "Tendai Mhlanga", pin: "1357" },
  { email: "tafara.manager@bottlestore.test", name: "Tafara Nyathi", pin: "2468" },
  { email: "chipo.till@bottlestore.test", name: "Chipo Dube", pin: "1928" },
  { email: "kuda.till@bottlestore.test", name: "Kuda Banda", pin: "3746" },
  { email: "rudo.stock@bottlestore.test", name: "Rudo Moyo", pin: "5091" },
  { email: "farai.till@bottlestore.test", name: "Farai Moyo", pin: "6024" },
]

async function seedPins(companyId: string, passwordHash: string) {
  const bcrypt = await import("bcryptjs")
  await prisma.user.upsert({
    where: { email: "kuda.till@bottlestore.test" },
    update: { name: "Kuda Banda", role: "CASHIER", companyId, isActive: true },
    create: { email: "kuda.till@bottlestore.test", name: "Kuda Banda", role: "CASHIER", companyId, password: passwordHash, isActive: true },
  })
  // When each was last used (Last in on People): Chipo and Kuda selling now,
  // Rudo 10:40, Tafara 12:31, Farai last night — and Farai's locked by five
  // wrong tries on Back till at 08:12 today, until somebody sends a new one.
  const now = Date.now()
  const todayAt = (hour: number, minute: number) => new Date(Math.min(harareTime(0, hour, minute).getTime(), now - 60_000))
  const used: Record<string, Date> = {
    "chipo.till@bottlestore.test": new Date(now - 4 * 60_000),
    "kuda.till@bottlestore.test": new Date(now - 6 * 60_000),
    "rudo.stock@bottlestore.test": todayAt(10, 40),
    "tafara.manager@bottlestore.test": todayAt(12, 31),
    "farai.till@bottlestore.test": harareTime(1, 21, 40),
  }
  const lockedAt = todayAt(8, 12)
  for (const person of TILL_PINS) {
    const user = await prisma.user.findFirst({ where: { companyId, email: person.email }, select: { id: true, name: true, role: true } })
    if (!user) continue
    const pinHash = await bcrypt.hash(person.pin, 10)
    const locked = person.email === "farai.till@bottlestore.test"
    const state = {
      companyId,
      pinHash,
      failedAttempts: locked ? 5 : 0,
      lockedAt: locked ? lockedAt : null,
      mustChange: false,
      issuedById: null,
      lastUnlockedAt: used[person.email] ?? null,
    }
    await prisma.retailTillPin.upsert({ where: { userId: user.id }, update: state, create: { userId: user.id, ...state } })
    if (!locked) continue
    // The lock's event, at 08:12 on Back till (once).
    const event = await prisma.platformAuditEvent.findFirst({
      where: { companyId, entityId: user.id, eventType: RETAIL_AUDIT_EVENTS.pinLocked, createdAt: { gte: harareTime(0, 0, 0) } },
      select: { id: true },
    })
    if (!event) {
      await writeRetailAuditEvent(prisma, {
        actor: { companyId, userId: user.id, userName: user.name, userRole: user.role },
        eventType: RETAIL_AUDIT_EVENTS.pinLocked,
        entityType: "User",
        entityId: user.id,
        payload: { registerName: "Back till", source: "TILL" },
      })
      const written = await prisma.platformAuditEvent.findFirst({
        where: { companyId, entityId: user.id, eventType: RETAIL_AUDIT_EVENTS.pinLocked },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      })
      if (written) await prisma.platformAuditEvent.update({ where: { id: written.id }, data: { createdAt: lockedAt } })
    }
  }
  console.log(`  till PINs: ${TILL_PINS.map((person) => `${person.name} ${person.pin}`).join(", ")} (Farai locked at 08:12)`)
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
        const pin = { companyId, pinHash, failedAttempts: 0, lockedAt: null, mustChange: true, issuedById: owner.id, issuedAt: invitedAt, lastUnlockedAt: null }
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
    for (const sale of saleRows.filter((row) => row.shiftId === shift.id && row.saleType === "SALE")) {
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
    // At 10:04, moved back with the boards' morning when the run is before 12:13 (FLR-01). The
    // opening barely moves then, so the drop is kept after the morning's cash it sends to the safe:
    // two minutes after the drawer's second cash sale (its first, when it has one only).
    const morningShift = Math.min(0, now.getTime() - 3 * 60 * 1000 - harareTime(0, 12, 10).getTime())
    const cashSales = await prisma.retailSale.findMany({
      where: { companyId, shiftId: front.id as string, saleType: "SALE", payments: { some: { tenderType: "CASH" } } },
      orderBy: { postedAt: "asc" },
      take: 2,
      select: { postedAt: true },
    })
    const afterCash = cashSales.at(-1)?.postedAt
    const boardDrop = harareTime(0, 10, 4).getTime() + morningShift
    const dropAt = new Date(afterCash ? Math.max(boardDrop, afterCash.getTime() + 2 * 60 * 1000) : boardDrop)
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
          approvedById: manager.id,
          approvedByName: manager.name,
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
        why: "DROP",
        approvedBy: { id: manager.id, name: manager.name },
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
 * STK-04. The hand adjustments and the case break the boards show, written
 * through the services so each is what Adjust stock and Break a case write:
 * BRK-0012 (Tafara Nyathi on the Castle case's record, 30 Sep 18:02, one case
 * into 24 singles: cases 23 → 22, singles 2 → 26), ADJ-0030 (Amarula, own
 * use, Tafara Nyathi) and ADJ-0031 (Two Keys, broken, Rudo Moyo, US$7.10 —
 * under the limit). Each is written once, by its reference; the line is first
 * moved by the opposite of what it takes, so on hand still lands on the
 * catalogue's figure (the ledger's opening absorbs the rest).
 *
 * `--reset` takes every hand adjustment and case break away (the seeded ones
 * are written again), with their reversals, their journals and accounting
 * events, and their Activity, and the numbering starts again at the seeded
 * documents, so the next adjustment is ADJ-0032 and no reference is ever
 * shown twice. Journals and events an earlier run left for movements that no
 * longer exist go too, so the books agree with the stock ledger.
 */
async function seedAdjustments(input: { companyId: string; mainSiteId: string; reset: boolean }) {
  const { companyId, mainSiteId } = input
  const handMade: Prisma.StockMovementWhereInput = {
    item: { site: { companyId } },
    reason: { in: ["BROKEN", "OWN_USE", "FOUND", "CORRECTION", "CASE_BROKEN"] },
  }
  // The seeded documents, by reference and reason: an acceptance run's count may hold the same number.
  const seeded: Prisma.StockMovementWhereInput[] = [
    { reference: "BRK-0012", reason: "CASE_BROKEN" },
    { reference: "ADJ-0030", reason: "OWN_USE" },
    { reference: "ADJ-0031", reason: "BROKEN" },
  ]
  if (input.reset) await clearAdjustments(companyId, handMade)

  const user = (email: string) => prisma.user.findFirstOrThrow({ where: { companyId, email }, select: { id: true, name: true, role: true } })
  const actorOf = (person: { id: string; name: string; role: string }) => ({ companyId, userId: person.id, userName: person.name, userRole: person.role })
  const lineOf = (code: string) =>
    prisma.inventoryItem.findFirstOrThrow({ where: { siteId: mainSiteId, itemCode: code }, select: { id: true, productId: true, currentStock: true } })
  const exists = (reference: string) =>
    prisma.stockMovement.count({ where: { ...handMade, OR: seeded.filter((doc) => doc.reference === reference) } }).then((count) => count > 0)
  /** The next number the service takes is this one, unless the shop is already past it. */
  const numberFrom = async (entity: "RETAIL_STOCK_ADJUSTMENT" | "RETAIL_CASE_BREAK", reference: string) => {
    const wanted = Number(reference.split("-")[1]) - 1
    const where = { companyId_entityKey_scopeKey: { companyId, entityKey: entity, scopeKey: "GLOBAL" } }
    const row = await prisma.idSequence.findUnique({ where, select: { lastNumber: true } })
    if (row && row.lastNumber > wanted && !input.reset) return false
    await prisma.idSequence.upsert({ where, create: { companyId, entityKey: entity, scopeKey: "GLOBAL", lastNumber: wanted }, update: { lastNumber: wanted } })
    return true
  }
  /** The document's movements and audit event at the time the board gives it. */
  const dateIt = async (reference: string, at: Date, eventType: string) => {
    await prisma.stockMovement.updateMany({ where: { ...handMade, OR: seeded.filter((doc) => doc.reference === reference) }, data: { createdAt: at } })
    const event = await prisma.platformAuditEvent.findFirst({
      where: { companyId, eventType, payloadJson: { contains: `"reference":"${reference}"` } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })
    if (event) await prisma.platformAuditEvent.update({ where: { id: event.id }, data: { createdAt: at } })
  }

  // BRK-0012: the singles ran down to 2, so Tafara opened a case on its record.
  if (!(await exists("BRK-0012")) && (await numberFrom("RETAIL_CASE_BREAK", "BRK-0012"))) {
    const tafara = await user("tafara.manager@bottlestore.test")
    const [pack, single] = await Promise.all([lineOf("CASTLE-CASE"), lineOf("CASTLE-340")])
    await prisma.inventoryItem.update({ where: { id: pack.id }, data: { currentStock: pack.currentStock.plus(1) } })
    await prisma.inventoryItem.update({ where: { id: single.id }, data: { currentStock: single.currentStock.minus(24) } })
    await breakCase({ actor: actorOf(tafara), caseProductId: pack.productId!, siteId: mainSiteId, cases: 1 })
    await dateIt("BRK-0012", harareTime(6, 18, 2), RETAIL_AUDIT_EVENTS.caseBroken)
  }

  const adjustments: Array<{ reference: string; code: string; email: string; why: AdjustWhy; note: string; at: Date }> = [
    { reference: "ADJ-0030", code: "AMARULA-750", email: "tafara.manager@bottlestore.test", why: "OWN_USE", note: "Taken for the owner’s function", at: harareTime(5, 10, 15) },
    { reference: "ADJ-0031", code: "TWOKEYS-750", email: "rudo.stock@bottlestore.test", why: "BROKEN", note: "Dropped while restocking the shelf.", at: harareTime(4, 15, 40) },
  ]
  for (const entry of adjustments) {
    if (await exists(entry.reference)) continue
    if (!(await numberFrom("RETAIL_STOCK_ADJUSTMENT", entry.reference))) {
      console.log(`  ${entry.reference} skipped: the shop is past that number (run with --reset)`)
      continue
    }
    const person = await user(entry.email)
    const line = await lineOf(entry.code)
    await prisma.inventoryItem.update({ where: { id: line.id }, data: { currentStock: line.currentStock.plus(1) } })
    const actor = actorOf(person)
    const result = await adjustStock({ actor, productId: line.productId!, siteId: mainSiteId, why: entry.why, n: "1", note: entry.note })
    await dateIt(entry.reference, entry.at, RETAIL_AUDIT_EVENTS.stockAdjusted)
    const journal = adjustmentJournal(result, actor)
    if (journal) await postRetailJournal({ ...journal, entryDate: entry.at })
  }
  console.log("  adjustments: BRK-0012, ADJ-0030, ADJ-0031")
}

type SeedCountLine = { code: string; counted: number; why?: "BROKEN" | "NOT_KNOWN" | "FOUND"; expected?: number; cost?: string }

type SeedCount = {
  no: string
  name: string
  scope: "EVERYTHING" | "CATEGORIES" | "PLACE" | "PRODUCTS"
  categories?: string[]
  place?: "BACK" | "COLD"
  /** PRODUCTS: the stock lines it covers, by item code. */
  codes?: string[]
  counter: string
  startedAt: Date
  submittedAt: Date | null
  approvedAt: Date | null
  /** Only the lines that differ; every other line of the count matches what was expected. */
  differ?: SeedCountLine[]
  /** COUNTING: how many lines, in the phone's order, already have a figure. */
  counted?: number
}

/**
 * STK-05. The counts the CountsList board shows, at Harare Main Branch:
 * CNT-0020 (the spirits shelf with the wine on it, sent by Rudo Moyo this
 * morning and waiting for approval: Gordon's and Nederburg two short, Bols
 * Brandy 50ml two over), CNT-0021 (the cold room, Kuda Banda counting it
 * now), and the approved ones before them back to June. The beer lines are
 * kept in the back store and the soft drinks and ciders in the cold room.
 *
 * Approved counts are history: their rows carry the final figures, and each
 * differing line's COUNT movement is written at the approval time, before the
 * ledger seed solves each line's opening so on hand lands where it should.
 * Every run starts again from these: what an acceptance run started goes.
 */
async function seedCounts(input: { companyId: string; mainSiteId: string }) {
  const { companyId, mainSiteId } = input
  const people = await prisma.user.findMany({
    where: {
      companyId,
      email: {
        in: ["tafara.manager@bottlestore.test", "rudo.stock@bottlestore.test", "kuda.till@bottlestore.test", "tendai.stock@bottlestore.test"],
      },
    },
    select: { id: true, email: true, name: true },
  })
  const who = (prefix: string) => people.find((person) => person.email?.startsWith(prefix))
  const tafara = who("tafara")
  if (!tafara || !who("rudo") || !who("kuda") || !who("tendai")) {
    console.log("  counts: Tafara Nyathi, Rudo Moyo, Kuda Banda or Tendai Sibanda missing, skipped")
    return
  }

  // What an earlier run (or an acceptance run) left: the counts, their stock movements, Activity and messages.
  await prisma.stockMovement.deleteMany({ where: { reason: "COUNT", item: { site: { companyId } } } })
  // What an approval posted (STK-06): one journal per count, keyed by the count.
  const countIds = (await prisma.retailStockCount.findMany({ where: { companyId }, select: { id: true } })).map((row) => row.id)
  const countJournals = { companyId, sourceType: "RETAIL_STOCK_ADJUSTMENT" as const, sourceId: { in: countIds } }
  await prisma.journalEntry.deleteMany({ where: countJournals })
  await prisma.accountingIntegrationEvent.deleteMany({ where: countJournals })
  await prisma.retailStockCount.deleteMany({ where: { companyId } })
  await prisma.platformAuditEvent.deleteMany({ where: { companyId, entityType: "RetailStockCount" } })
  await prisma.notification.deleteMany({
    where: { companyId, type: { in: ["RETAIL_COUNT_ASSIGNED", "RETAIL_COUNT_SUBMITTED"] as NotificationType[] } },
  })
  // Every message that links to a count: the counter's count-link and the approver's approval-ask.
  await prisma.retailMessage.deleteMany({ where: { companyId, body: { contains: "/retail/stock/counts/" } } })

  // Where things are kept at the main branch.
  const placeOf = async (code: string) =>
    prisma.stockLocation.findUniqueOrThrow({ where: { siteId_code: { siteId: mainSiteId, code } }, select: { id: true, name: true } })
  const [back, cold] = await Promise.all([placeOf("BACK"), placeOf("COLD")])
  const categoryId = async (name: string) =>
    (await prisma.retailCategory.findFirst({ where: { companyId, name, archivedAt: null }, select: { id: true } }))?.id ?? null
  const ids = async (names: string[]) => (await Promise.all(names.map(categoryId))).filter((id): id is string => Boolean(id))
  await prisma.inventoryItem.updateMany({
    where: { siteId: mainSiteId, product: { is: { categoryId: { in: await ids(["Beer"]) } } } },
    data: { locationId: back.id },
  })
  await prisma.inventoryItem.updateMany({
    where: { siteId: mainSiteId, product: { is: { categoryId: { in: await ids(["Soft drinks", "Ciders and coolers"]) } } } },
    data: { locationId: cold.id },
  })

  // The phone walks the shelves in order, so the shelves are set before the lines are read.
  for (const [namePrefix, shelf] of SHELVES) {
    await prisma.inventoryItem.updateMany({ where: { siteId: mainSiteId, name: { startsWith: namePrefix } }, data: { shelf } })
  }
  const lines = await prisma.inventoryItem.findMany({
    where: { siteId: mainSiteId, productId: { not: null }, product: { is: { companyId, archivedAt: null } } },
    select: {
      id: true,
      itemCode: true,
      unit: true,
      shelf: true,
      locationId: true,
      currentStock: true,
      unitCost: true,
      product: { select: { id: true, name: true, isActive: true, categoryId: true } },
    },
  })
  const kept = lines.filter((line) => line.product!.isActive || !line.currentStock.isZero())
  const sortKey = (line: (typeof lines)[number]) => `${line.shelf?.trim() || "~"}|${line.product!.name}`

  // Today's, never later than now: a run before 10:40 still reads them as this morning's.
  const today = (hour: number, minute: number, before: number) =>
    new Date(Math.min(harareTime(0, hour, minute).getTime(), Date.now() - before * 60 * 1000))
  const counts: SeedCount[] = []
  // Fourteen weekly counts from June to the start of September, every figure as expected.
  const rota: Array<Pick<SeedCount, "name" | "scope" | "categories" | "place">> = [
    { name: "Spirits shelf", scope: "CATEGORIES", categories: ["Spirits"] },
    { name: "Beer, back store", scope: "PLACE", place: "BACK" },
    { name: "Soft drinks", scope: "CATEGORIES", categories: ["Soft drinks"] },
    { name: "Cold room", scope: "PLACE", place: "COLD" },
  ]
  for (let index = 0; index < 14; index += 1) {
    const daysBack = 7 * (14 - index) + 21
    counts.push({
      no: `CNT-${String(index + 2).padStart(4, "0")}`,
      ...rota[index % rota.length]!,
      counter: index % 2 === 0 ? "rudo" : "tafara",
      startedAt: harareTime(daysBack, 7, 0),
      submittedAt: harareTime(daysBack, 7, 50),
      approvedAt: harareTime(daysBack, 9, 5),
    })
  }
  const daysTo = (month: number, day: number) => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare" }).format(new Date())
    const [year] = today.split("-").map(Number)
    return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.UTC(year!, month - 1, day)) / DAY_MS)
  }
  counts.push(
    {
      no: "CNT-0016",
      name: "Spirits shelf",
      scope: "CATEGORIES",
      categories: ["Spirits"],
      counter: "tafara",
      startedAt: harareTime(daysTo(9, 16), 7, 0),
      submittedAt: harareTime(daysTo(9, 16), 7, 40),
      approvedAt: harareTime(daysTo(9, 16), 8, 15),
      differ: [{ code: "JAMESON-750", counted: -1, why: "NOT_KNOWN" }],
    },
    {
      no: "CNT-0017",
      name: "Soft drinks",
      scope: "CATEGORIES",
      categories: ["Soft drinks"],
      counter: "rudo",
      startedAt: harareTime(daysTo(9, 23), 7, 0),
      submittedAt: harareTime(daysTo(9, 23), 7, 35),
      approvedAt: harareTime(daysTo(9, 23), 9, 20),
      differ: [
        { code: "COKE-6PK", counted: -1, why: "NOT_KNOWN" },
        { code: "FANTA-500", counted: -3, why: "BROKEN" },
        { code: "SPRITE-500", counted: -5, why: "NOT_KNOWN" },
      ],
    },
    {
      no: "CNT-0018",
      name: "Everything",
      scope: "EVERYTHING",
      counter: "tafara",
      startedAt: harareTime(daysTo(9, 30), 5, 30),
      submittedAt: harareTime(daysTo(9, 30), 6, 40),
      approvedAt: harareTime(daysTo(9, 30), 7, 0),
      differ: [
        { code: "BLKLABEL-750", counted: -1, why: "NOT_KNOWN" },
        { code: "CASTLE-340", counted: -1, why: "BROKEN" },
        { code: "CASTLE-CASE", counted: -1, why: "NOT_KNOWN" },
        { code: "CHIBUKU-1L", counted: -3, why: "BROKEN" },
        { code: "BERNINI-275", counted: -1, why: "BROKEN" },
        { code: "HUNTERS-330", counted: -2, why: "NOT_KNOWN" },
        { code: "SAVANNA-330", counted: -1, why: "NOT_KNOWN" },
        { code: "TONIC-200", counted: -1, why: "NOT_KNOWN" },
        { code: "COKE-500", counted: -1, why: "NOT_KNOWN" },
      ],
    },
    {
      no: "CNT-0019",
      name: "Beer, back store",
      scope: "PLACE",
      place: "BACK",
      counter: "tafara",
      startedAt: harareTime(daysTo(10, 2), 8, 30),
      submittedAt: harareTime(daysTo(10, 2), 8, 58),
      approvedAt: harareTime(daysTo(10, 2), 9, 12),
      differ: [{ code: "ZAMBEZI-375", counted: -2, why: "BROKEN", cost: "0.86" }],
    },
    {
      no: "CNT-0020",
      name: "Spirits shelf",
      scope: "CATEGORIES",
      categories: ["Spirits", "Wine"],
      counter: "rudo",
      startedAt: today(10, 6, 40),
      submittedAt: today(10, 40, 6),
      approvedAt: null,
      differ: [
        { code: "GORDONS-750", expected: 22, counted: -2, why: "NOT_KNOWN" },
        { code: "NEDERBURG-750", expected: 18, counted: -2, why: "NOT_KNOWN" },
        { code: "BOLS-50", expected: 6, counted: 2, why: "FOUND" },
      ],
    },
    {
      no: "CNT-0021",
      name: "Cold room",
      scope: "PLACE",
      place: "COLD",
      counter: "kuda",
      startedAt: today(11, 5, 5),
      submittedAt: null,
      approvedAt: null,
      counted: 3,
    },
    // STK-06: over the owner's US$100.00, so a manager's approval waits for the owner. The back
    // shelf's bottles share their stock lines with the spirits shelf (one line per product at a site).
    {
      no: "CNT-0023",
      name: "Spirits, back shelf",
      scope: "PRODUCTS",
      codes: ["BLKLABEL-750", "JAMESON-750", "TWOKEYS-750", "BOLS-750"],
      counter: "tendai",
      startedAt: today(8, 30, 130),
      submittedAt: today(9, 5, 95),
      approvedAt: null,
      // −US$141.20 at today's costs: +33.60 − 132.90 + 14.20 − 56.10.
      differ: [
        { code: "BLKLABEL-750", counted: 1, why: "FOUND" },
        { code: "JAMESON-750", counted: -6, why: "NOT_KNOWN" },
        { code: "TWOKEYS-750", counted: 2, why: "FOUND" },
        { code: "BOLS-750", counted: -5, why: "BROKEN" },
      ],
    },
  )

  const placeIds = { BACK: back.id, COLD: cold.id }
  let movements = 0
  for (const spec of counts) {
    const categoryIds = await ids(spec.categories ?? [])
    const covered = kept
      .filter((line) =>
        spec.scope === "EVERYTHING"
          ? true
          : spec.scope === "PRODUCTS"
            ? (spec.codes ?? []).includes(line.itemCode)
            : spec.scope === "PLACE"
            ? line.locationId === placeIds[spec.place!]
            : categoryIds.includes(line.product!.categoryId ?? ""),
      )
      .sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0))
    const counter = who(spec.counter)!
    const done = spec.approvedAt !== null || spec.submittedAt !== null
    const firstAt = new Date(spec.startedAt.getTime() + 6 * 60 * 1000)
    let short = ZERO
    let over = ZERO
    const rows = covered.map((line, index) => {
      const differs = spec.differ?.find((entry) => entry.code === line.itemCode)
      const cost = money(differs?.cost ?? line.unitCost ?? 0)
      const expected = quantity(differs?.expected ?? line.currentStock)
      const difference = quantity(differs?.counted ?? 0)
      const isCounted = done || index < (spec.counted ?? 0)
      const value = multiplyMoney(difference, cost)
      if (difference.isNegative()) short = short.plus(value)
      else over = over.plus(value)
      return {
        id: randomUUID(),
        companyId,
        inventoryItemId: line.id,
        productId: line.product!.id,
        expected,
        counted: isCounted ? expected.plus(difference) : null,
        countedAt: isCounted ? new Date(firstAt.getTime() + index * 60 * 1000) : null,
        countedById: isCounted ? counter.id : null,
        expectedAtCount: isCounted ? expected : null,
        difference: isCounted ? difference : null,
        unitCost: cost,
        why: differs?.why ?? null,
        sortKey: sortKey(line),
      }
    })
    const unitOf = new Map(covered.map((line) => [line.id, line.unit]))
    const count = await prisma.retailStockCount.create({
      data: {
        companyId,
        countNo: spec.no,
        siteId: mainSiteId,
        name: spec.name,
        scope: spec.scope,
        categoryIds,
        placeId: spec.place ? placeIds[spec.place] : null,
        blind: true,
        keepSelling: true,
        status: spec.approvedAt ? "APPROVED" : spec.submittedAt ? "TO_APPROVE" : "COUNTING",
        counterId: counter.id,
        createdById: tafara.id,
        firstCountedAt: done || (spec.counted ?? 0) > 0 ? firstAt : null,
        submittedAt: spec.submittedAt,
        approvedAt: spec.approvedAt,
        approvedById: spec.approvedAt ? tafara.id : null,
        differenceValue: spec.approvedAt ? short.plus(over) : null,
        shortValue: spec.approvedAt ? short : null,
        overValue: spec.approvedAt ? over : null,
        createdAt: spec.startedAt,
        lines: { create: rows },
      },
      select: { id: true },
    })

    // The open counts' Activity: started by Tafara Nyathi, and sent by its counter.
    if (!spec.approvedAt) {
      const stamp = async (eventType: string, at: Date) => {
        const event = await prisma.platformAuditEvent.findFirst({
          where: { companyId, entityId: count.id, eventType },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        })
        if (event) await prisma.platformAuditEvent.update({ where: { id: event.id }, data: { createdAt: at } })
      }
      const actorOf = (person: { id: string; name: string }, role: string) => ({ companyId, userId: person.id, userName: person.name, userRole: role })
      await writeRetailAuditEvent(prisma, {
        actor: actorOf(tafara, "MANAGER"),
        eventType: RETAIL_AUDIT_EVENTS.countStarted,
        entityType: "RetailStockCount",
        entityId: count.id,
        payload: { countNo: spec.no, lines: rows.length, counterId: counter.id, counter: counter.name, blind: true, keepSelling: true },
      })
      await stamp(RETAIL_AUDIT_EVENTS.countStarted, spec.startedAt)
      if (spec.submittedAt) {
        const differ = rows.filter((row) => row.difference && !row.difference.isZero()).length
        await writeRetailAuditEvent(prisma, {
          actor: actorOf(counter, "STOCK_CLERK"),
          eventType: RETAIL_AUDIT_EVENTS.countSubmitted,
          entityType: "RetailStockCount",
          entityId: count.id,
          payload: { countNo: spec.no, lines: rows.length, differ },
        })
        await stamp(RETAIL_AUDIT_EVENTS.countSubmitted, spec.submittedAt)
      }
      continue
    }
    // Approved: each line that differed moved by its difference when the count was approved.
    for (const row of rows) {
      if (!row.difference || row.difference.isZero()) continue
      await prisma.stockMovement.create({
        data: {
          referenceId: await reserveIdentifier(prisma, { companyId, entity: "STOCK_MOVEMENT" }),
          itemId: row.inventoryItemId,
          movementType: "ADJUSTMENT",
          quantity: row.difference,
          unit: unitOf.get(row.inventoryItemId)!,
          issuedById: tafara.id,
          notes: { BROKEN: "Broken", NOT_KNOWN: "Not known", FOUND: "Found" }[row.why ?? "NOT_KNOWN"],
          sourceType: "RETAIL_STOCK_ADJUSTMENT",
          sourceId: `${count.id}:${row.id}`,
          reason: "COUNT",
          reference: spec.no,
          change: row.difference,
          createdAt: spec.approvedAt,
        },
      })
      movements += 1
    }
  }

  // The next count the shop starts is CNT-0024.
  const sequence = { companyId_entityKey_scopeKey: { companyId, entityKey: "RETAIL_STOCK_COUNT", scopeKey: "GLOBAL" } }
  await prisma.idSequence.upsert({
    where: sequence,
    create: { companyId, entityKey: "RETAIL_STOCK_COUNT", scopeKey: "GLOBAL", lastNumber: 23 },
    update: { lastNumber: 23 },
  })
  console.log(`  counts: ${counts.length} (CNT-0020 and CNT-0023 to approve, CNT-0021 counting), ${movements} count movement(s)`)
}

/**
 * `--reset` for STK-04: every hand adjustment and case break, their
 * reversals, what they posted (journals and accounting events under the
 * movement's id, or the reversal's), and their Activity. Journals and events
 * an earlier run left for movements already gone are cleared with them;
 * transfers' losses (`<transfer>:lost:<n>`) are not movements' and stay.
 */
async function clearAdjustments(companyId: string, handMade: Prisma.StockMovementWhereInput) {
  const originals = (await prisma.stockMovement.findMany({ where: handMade, select: { id: true } })).map((row) => row.id)
  const reversals = (await prisma.stockMovement.findMany({ where: { reversesId: { in: originals } }, select: { id: true } })).map((row) => row.id)
  await prisma.stockMovement.deleteMany({ where: { id: { in: reversals } } })
  await prisma.stockMovement.deleteMany({ where: { id: { in: originals } } })

  // Posted under a movement's id: every adjustment's source but a transfer's loss.
  const byMovement = { companyId, sourceType: "RETAIL_STOCK_ADJUSTMENT" as const, sourceId: { not: null }, NOT: { sourceId: { contains: ":" } } }
  const [entries, events] = await Promise.all([
    prisma.journalEntry.findMany({ where: byMovement, select: { id: true, sourceId: true } }),
    prisma.accountingIntegrationEvent.findMany({ where: byMovement, select: { id: true, sourceId: true } }),
  ])
  const sourceIds = [...new Set([...entries, ...events].map((row) => row.sourceId!))]
  const live = new Set((await prisma.stockMovement.findMany({ where: { id: { in: sourceIds } }, select: { id: true } })).map((row) => row.id))
  const goneEntries = entries.filter((row) => !live.has(row.sourceId!)).map((row) => row.id)
  const goneEvents = events.filter((row) => !live.has(row.sourceId!)).map((row) => row.id)
  await prisma.journalEntry.deleteMany({ where: { id: { in: goneEntries } } })
  await prisma.accountingIntegrationEvent.deleteMany({ where: { id: { in: goneEvents } } })

  // Their Activity: every adjustment, break and reversal event, since none of their movements is left.
  const activity = await prisma.platformAuditEvent.deleteMany({
    where: {
      companyId,
      eventType: { in: [RETAIL_AUDIT_EVENTS.stockAdjusted, RETAIL_AUDIT_EVENTS.caseBroken, RETAIL_AUDIT_EVENTS.movementsReversed] },
    },
  })
  console.log(
    `  reset: cleared ${originals.length} hand adjustment(s) and case break leg(s), ${reversals.length} reversal(s), ` +
      `${goneEntries.length} journal(s), ${goneEvents.length} accounting event(s) and ${activity.count} Activity line(s)`,
  )
}

/**
 * `--reset`: the buying acceptance runs did goes — every order and delivery
 * (PO-00001 and its GRN-00001 are written again after this), the stock those
 * deliveries brought in, their books and their Activity — and with it any
 * movement a smoke run wrote with no reason. The ledger keeps the shop's own
 * movements and works each line's opening back from them, so one left behind
 * moves where on hand lands: a walk's RGR-0001 of 20 bags made Ice 2kg at
 * Harare Main Branch read 42 on one reseed and 40 on the next.
 */
async function clearPurchasing(companyId: string) {
  const [orders, receipts] = await Promise.all([
    prisma.retailPurchaseOrder.findMany({ where: { companyId }, select: { id: true, lines: { select: { id: true } } } }),
    prisma.retailGoodsReceipt.findMany({ where: { companyId }, select: { id: true } }),
  ])
  const receiptIds = receipts.map((receipt) => receipt.id)
  const movements = await prisma.stockMovement.deleteMany({
    where: { item: { site: { companyId } }, OR: [{ sourceType: "RETAIL_GOODS_RECEIPT" }, { reason: null }] },
  })
  const books = { companyId, sourceType: "RETAIL_GOODS_RECEIPT" as const, sourceId: { in: receiptIds } }
  const entries = await prisma.journalEntry.deleteMany({ where: books })
  await prisma.accountingIntegrationEvent.deleteMany({ where: books })
  const activity = await prisma.platformAuditEvent.deleteMany({
    where: {
      companyId,
      OR: [
        { entityType: "RetailGoodsReceipt", entityId: { in: receiptIds } },
        { entityType: "RetailPurchaseOrder", entityId: { in: orders.map((order) => order.id) } },
        { entityType: "RetailPurchaseOrderLine", entityId: { in: orders.flatMap((order) => order.lines.map((line) => line.id)) } },
      ],
    },
  })
  await prisma.retailGoodsReceipt.deleteMany({ where: { companyId } })
  await prisma.retailPurchaseOrder.deleteMany({ where: { companyId } })
  // The next RPO and RGR numbers are worked out again from what is left.
  await prisma.idSequence.deleteMany({ where: { companyId, entityKey: { in: ["RETAIL_PURCHASE_ORDER", "RETAIL_GOODS_RECEIPT"] } } })
  console.log(
    `  reset: cleared ${orders.length} order(s), ${receipts.length} delivery(ies), ${movements.count} stock movement(s), ` +
      `${entries.count} journal(s) and ${activity.count} Activity line(s)`,
  )
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

/**
 * PRD-03: one product on the shelf, written directly — the product (by its
 * code), its price on the default list, and its stock line claimed by it. VAT
 * comes from its category, as New product does.
 */
async function seedShelfLine(input: {
  companyId: string
  listId: string
  code: string
  name: string
  itemId: string
  price: string
  barcode?: string
  isActive: boolean
  categoryId: string | null
  cost: string
  deposit: string | null
}): Promise<string> {
  const category = input.categoryId
    ? await prisma.retailCategory.findUnique({ where: { id: input.categoryId }, select: { vatRate: true } })
    : null
  const fields = {
    name: input.name,
    kind: "GOODS" as const,
    standardPrice: money(input.price),
    defaultTaxRate: category?.vatRate ?? money(VAT_PERCENT),
    isActive: input.isActive,
    archivedAt: null,
    categoryId: input.categoryId,
    costPrice: money(input.cost),
    returnable: Boolean(input.deposit),
    depositAmount: input.deposit ? money(input.deposit) : null,
    ...(input.barcode ? { barcode: input.barcode } : {}),
  }
  const product = await prisma.product.upsert({
    where: { companyId_code: { companyId: input.companyId, code: input.code } },
    create: { companyId: input.companyId, code: input.code, ...fields },
    update: fields,
    select: { id: true },
  })
  await prisma.productPrice.upsert({
    where: { priceListId_productId_minQuantity: { priceListId: input.listId, productId: product.id, minQuantity: new Prisma.Decimal(1) } },
    create: { companyId: input.companyId, priceListId: input.listId, productId: product.id, minQuantity: new Prisma.Decimal(1), unitPrice: money(input.price) },
    update: { unitPrice: money(input.price) },
  })
  await prisma.inventoryItem.updateMany({
    where: { id: input.itemId, OR: [{ productId: null }, { productId: product.id }] },
    data: { productId: product.id },
  })
  return product.id
}

/** Airtime, a category of its own beside the liquor set: VAT included, no ID check, out of the bin. */
async function seedAirtimeCategory(companyId: string) {
  const fields = { vatRate: money(VAT_PERCENT), vatExempt: false, ageRestricted: false, returnable: false, depositAmount: null, parentId: null, archivedAt: null }
  const row = await prisma.retailCategory.findFirst({
    where: { companyId, name: { equals: "Airtime", mode: "insensitive" } },
    orderBy: [{ archivedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    select: { id: true },
  })
  if (row) await prisma.retailCategory.update({ where: { id: row.id }, data: { name: "Airtime", ...fields } })
  else await prisma.retailCategory.create({ data: { companyId, name: "Airtime", ...fields } })
}

/** Econet airtime at Harare Main Branch, an open price: the till asks what the customer wants. */
async function seedAirtime(input: { companyId: string; siteId: string; locationId: string; listId: string; categoryId: string | null }) {
  const levels = { name: AIRTIME.name, unit: "each", siteId: input.siteId, locationId: input.locationId, currentStock: AIRTIME.stock, minStock: 50, reorderQty: 500, unitCost: 0 }
  const existing = await prisma.inventoryItem.findFirst({ where: { siteId: input.siteId, itemCode: AIRTIME.code }, select: { id: true } })
  const item = existing
    ? await prisma.inventoryItem.update({ where: { id: existing.id }, data: levels, select: { id: true } })
    : await prisma.inventoryItem.create({ data: { itemCode: AIRTIME.code, category: "OTHER", ...levels }, select: { id: true } })
  const productId = await seedShelfLine({
    companyId: input.companyId,
    listId: input.listId,
    code: AIRTIME.code,
    name: AIRTIME.name,
    itemId: item.id,
    price: AIRTIME.price,
    isActive: true,
    categoryId: input.categoryId,
    cost: "0",
    deposit: null,
  })
  await prisma.product.update({ where: { id: productId }, data: { openPrice: true, archivedAt: null } })
  console.log("  Econet airtime on the shelf, at whatever the cashier types")
}

type SeedSupplier = {
  code: string
  supplier: SupplierInput
  /** The WhatsApp number, where it is not the phone. */
  whatsapp?: string
  contacts: Array<{ name: string; role: string; phone?: string; email?: string; sends: SendsWord }>
}

/**
 * BUY-01 (40-buying 3.6): the seven suppliers, SUP-0001 to SUP-0007 in this
 * order. The rep is a Sales rep contact on the supplier's own number, as the
 * migration made one from a supplier's contact name.
 */
const SEED_SUPPLIERS: SeedSupplier[] = [
  {
    code: "SUP-0001",
    supplier: {
      name: "Delta Beverages",
      phone: "+263 24 270 1600",
      email: "orders@delta.co.zw",
      pays: "30 days",
      delivers: "Tuesdays and Fridays",
      leadTime: "2",
      minimumOrder: "500.00",
      vatNumber: "10023881",
      bpNumber: "200118844",
      bank: "CBZ, Kwame Nkrumah, 0112 3344 4471",
    },
    whatsapp: "+263 77 214 9080",
    contacts: [
      { name: "Tinashe Moyo", role: "Sales rep", phone: "+263 77 214 9080", sends: "Orders" },
      { name: "Delta orders desk", role: "Orders desk", email: "orders@delta.co.zw", sends: "Orders" },
    ],
  },
  {
    code: "SUP-0002",
    supplier: { name: "Afdis Distillers", phone: "+263 24 266 8001", email: "orders@afdis.co.zw", pays: "30 days", delivers: "Mondays and Thursdays", leadTime: "2", minimumOrder: "300.00" },
    contacts: [{ name: "Ruvimbo Sithole", role: "Sales rep", phone: "+263 24 266 8001", email: "orders@afdis.co.zw", sends: "Orders" }],
  },
  {
    code: "SUP-0003",
    supplier: { name: "Mutare Wholesalers", phone: "+263 20 206 4411", pays: "On delivery", delivers: "Fridays", leadTime: "3" },
    contacts: [{ name: "Peter Chikore", role: "Sales rep", phone: "+263 20 206 4411", sends: "Orders" }],
  },
  {
    code: "SUP-0004",
    supplier: { name: "Schweppes Zimbabwe", phone: "+263 24 248 7720", email: "sales@schweppes.co.zw", pays: "14 days", delivers: "Wednesdays", leadTime: "2" },
    contacts: [{ name: "Lindiwe Dube", role: "Sales rep", phone: "+263 24 248 7720", email: "sales@schweppes.co.zw", sends: "Orders" }],
  },
  {
    code: "SUP-0005",
    supplier: { name: "Pamela", phone: "+263 77 330 1922", pays: "On delivery", leadTime: "1" },
    contacts: [{ name: "Pamela Ndlovu", role: "Sales rep", phone: "+263 77 330 1922", sends: "Orders" }],
  },
  {
    code: "SUP-0006",
    supplier: { name: "Ice Cold Supplies", phone: "+263 71 909 2210", pays: "On delivery", delivers: "Daily", leadTime: "0" },
    contacts: [{ name: "Joseph Banda", role: "Sales rep", phone: "+263 71 909 2210", sends: "Orders" }],
  },
  {
    code: "SUP-0007",
    supplier: { name: "CoolTech Repairs", phone: "+263 77 410 5566", pays: "On delivery" },
    contacts: [],
  },
]

/** Sprite 500ml (40-buying 3.6): PO-0003 and the Receive board order it from Delta. */
const SPRITE = { code: "SPRITE-500", name: "Sprite 500ml", price: "0.75", cost: "0.52", onHand: "96", reorderAt: "48" }

/** Who a catalogue line is bought from: Delta for beer, ciders, Coke, Fanta, ice and Chibuku; Afdis for spirits and wine; Schweppes for tonic. */
function supplierOf(entry: CatalogueEntry): string | null {
  if (entry.code.startsWith("TONIC")) return "SUP-0004"
  if (entry.code.startsWith("CHARCOAL")) return null
  if (entry.category === "Spirits" || entry.category === "Wine") return "SUP-0002"
  return "SUP-0001"
}

/**
 * BUY-01. The seven suppliers, added as New supplier and Add a contact add
 * them (by Tendai Mhlanga), idempotent by code; then each catalogue line's
 * supplier, and Sprite 500ml added as New product adds one. `--reset` starts
 * the suppliers again from these: what an acceptance run added, stopped,
 * changed or messaged goes (a supplier the books hold a bill against stays).
 */
async function seedSuppliers(input: { companyId: string; mainSiteId: string; softDrinksId: string | null; reset: boolean }) {
  const { companyId } = input
  const owner = await prisma.user.findFirstOrThrow({ where: { companyId, email: "owner@bottlestore.test" }, select: { id: true, name: true, role: true } })
  const actor = { companyId, userId: owner.id, userName: owner.name, userRole: owner.role }

  if (input.reset) {
    // A supplier the books hold a bill against, or the shop holds empties for, stays.
    const gone = await prisma.vendor.findMany({ where: { companyId, bills: { none: {} }, emptiesEntries: { none: {} } }, select: { id: true } })
    const ids = gone.map((vendor) => vendor.id)
    await prisma.retailMessage.deleteMany({ where: { companyId, entityType: "Vendor", entityId: { in: ids } } })
    await prisma.platformAuditEvent.deleteMany({ where: { companyId, entityType: "Vendor", entityId: { in: ids } } })
    await prisma.vendor.deleteMany({ where: { id: { in: ids } } })
  }

  const sequence = { companyId_entityKey_scopeKey: { companyId, entityKey: "RETAIL_SUPPLIER", scopeKey: "GLOBAL" } }
  const ids = new Map<string, string>()
  for (const row of SEED_SUPPLIERS) {
    const found = await prisma.vendor.findFirst({ where: { companyId, code: row.code }, select: { id: true, name: true } })
    if (found) {
      if (found.name !== row.supplier.name) console.log(`  ${row.code} is ${found.name} here, not ${row.supplier.name} (run with --reset)`)
      // A supplier kept for its bills keeps the seed's lead time too: Change reorder levels reads it (STK-02).
      if (input.reset && row.supplier.leadTime !== undefined && row.supplier.leadTime !== null) {
        await prisma.vendor.update({ where: { id: found.id }, data: { leadTimeDays: Number(row.supplier.leadTime) } })
      }
      ids.set(row.code, found.id)
      continue
    }
    // The next number New supplier takes is this one.
    const wanted = Number(row.code.split("-")[1]) - 1
    await prisma.idSequence.upsert({
      where: sequence,
      create: { companyId, entityKey: "RETAIL_SUPPLIER", scopeKey: "GLOBAL", lastNumber: wanted },
      update: { lastNumber: wanted },
    })
    const id = await prisma.$transaction(async (tx) => {
      const created = await createSupplier(tx, actor, row.supplier)
      if (row.whatsapp) await tx.vendor.update({ where: { id: created.id }, data: { whatsapp: row.whatsapp } })
      for (const contact of row.contacts) await addContact(tx, actor, created.id, contact)
      return created.id
    })
    ids.set(row.code, id)
  }
  // The next one added is SUP-0008.
  const last = await prisma.idSequence.findUnique({ where: sequence, select: { lastNumber: true } })
  if (!last || last.lastNumber < SEED_SUPPLIERS.length) {
    await prisma.idSequence.upsert({
      where: sequence,
      create: { companyId, entityKey: "RETAIL_SUPPLIER", scopeKey: "GLOBAL", lastNumber: SEED_SUPPLIERS.length },
      update: { lastNumber: SEED_SUPPLIERS.length },
    })
  }

  for (const entry of CATALOGUE) {
    const code = supplierOf(entry)
    await prisma.product.updateMany({ where: { companyId, code: entry.code }, data: { supplierId: code ? (ids.get(code) ?? null) : null } })
  }

  const sprite = await prisma.product.findFirst({ where: { companyId, code: SPRITE.code }, select: { id: true } })
  if (sprite) {
    await prisma.product.update({ where: { id: sprite.id }, data: { supplierId: ids.get("SUP-0001") ?? null, archivedAt: null, isActive: true } })
  } else {
    await prisma.$transaction(async (tx) => {
      const created = await createProduct(tx, {
        actor,
        input: productInput.parse({
          name: SPRITE.name,
          categoryId: input.softDrinksId,
          price: SPRITE.price,
          cost: SPRITE.cost,
          supplierId: ids.get("SUP-0001") ?? null,
          openingStock: SPRITE.onHand,
          reorderAt: SPRITE.reorderAt,
          siteId: input.mainSiteId,
        }),
        source: "ADDED",
      })
      await tx.product.update({ where: { id: created.productId }, data: { code: SPRITE.code } })
      await tx.inventoryItem.update({ where: { id: created.itemId }, data: { itemCode: SPRITE.code } })
    })
  }
  console.log(`  ${SEED_SUPPLIERS.length} suppliers (SUP-0001 to SUP-0007), their products, and Sprite 500ml from Delta`)
}

/**
 * INS-07. Reports › Every template (70-insights-reports 3.8): the team's saved
 * templates and when each template was last opened in the shop. A saved
 * template is seeded only once its source reads through a report face, so the
 * catalogue never lists a template that cannot run: today "Voids and refunds
 * by cashier" (shifts); "Weekend takings by shop" and "Empties owed by
 * supplier" join when their sources do. Idempotent: by name, and one use row
 * per template.
 */
async function seedReportTemplates(companyId: string) {
  const people = await prisma.user.findMany({
    where: { companyId, email: { in: ["owner@bottlestore.test", "tafara.manager@bottlestore.test", "rufaro.manager@bottlestore.test"] } },
    select: { id: true, email: true },
  })
  const who = (email: string) => people.find((person) => person.email === email)?.id ?? null
  const owner = who("owner@bottlestore.test")
  if (!owner) return

  const now = Date.now()
  /** A time of day `daysBack` days ago, never in the future. */
  const at = (daysBack: number, hour: number, minute: number) =>
    new Date(Math.min(harareTime(daysBack, hour, minute).getTime(), now - 60_000))

  type SavedSeed = {
    name: string
    maker: string
    audience: "JUST_ME" | "MANAGERS" | "EVERYONE"
    description: string
    source: string
    query: TemplateQuery
    createdDaysAgo: number
    opened: { opens: number; at: Date }
  }
  const saved: SavedSeed[] = [
    {
      name: "Weekend takings by shop",
      maker: "owner@bottlestore.test",
      audience: "MANAGERS",
      description: "Friday 17:00 to Sunday close, each shop, by payment",
      source: "retail-sales",
      query: {
        filters: { when: "last-weekend" },
        rows: ["site"],
        cols: ["site", "sales", "cash", "ecocash", "card", "account", "taken"],
        sort: "most-taken",
      },
      createdDaysAgo: 19,
      opened: { opens: 22, at: at(5, 7, 5) },
    },
    {
      name: "Empties owed by supplier",
      maker: "rufaro.manager@bottlestore.test",
      audience: "EVERYONE",
      description: "Bottles and crates out, and the deposit each supplier holds",
      source: "retail-empties",
      query: { filters: { kind: "supplier" }, rows: ["supplier"], cols: ["supplier", "bottles", "crates", "deposit"] },
      createdDaysAgo: 26,
      opened: { opens: 1, at: at(1, 16, 20) },
    },
    {
      name: "Voids and refunds by cashier",
      maker: "tafara.manager@bottlestore.test",
      audience: "JUST_ME",
      description: "Who voided or refunded what, this month",
      source: "retail-shifts",
      query: {
        filters: { opened: "this-month" },
        rows: ["cashier"],
        cols: ["cashier", "shifts", "refunds", "voids", "noSaleOpens"],
      },
      createdDaysAgo: 12,
      opened: { opens: 1, at: at(4, 18, 20) },
    },
  ]

  let made = 0
  for (const seed of saved) {
    const face = getReportDefinition(seed.source)?.report
    const maker = who(seed.maker)
    if (!face || !maker) continue
    const { view, params } = fromTemplateQuery(seed.query, face)
    const data = {
      reportKey: seed.source,
      description: seed.description,
      view: view as unknown as Prisma.InputJsonValue,
      params,
      audience: seed.audience,
      createdById: maker,
    }
    const existing = await prisma.reportTemplate.findFirst({ where: { companyId, name: seed.name }, select: { id: true } })
    const template = existing
      ? await prisma.reportTemplate.update({ where: { id: existing.id }, data, select: { id: true } })
      : await prisma.reportTemplate.create({
          data: { ...data, companyId, name: seed.name, createdAt: at(seed.createdDaysAgo, 10, 0) },
          select: { id: true },
        })
    await prisma.reportTemplateUse.upsert({
      where: { companyId_templateRef: { companyId, templateRef: template.id } },
      create: { companyId, templateRef: template.id, templateId: template.id, opens: seed.opened.opens, lastOpenedAt: seed.opened.at, lastOpenedById: maker },
      update: { opens: seed.opened.opens, lastOpenedAt: seed.opened.at, lastOpenedById: maker },
    })
    made += 1
  }

  // When each built-in was last opened in the shop (the board's Last opened column).
  const builtInsOpened: Array<[slug: string, daysBack: number, hour: number, minute: number]> = [
    ["items-sold", 1, 17, 40],
    ["stock-on-hand", 1, 9, 15],
    ["count-differences", 3, 10, 2],
    ["stock-movements", 2, 15, 30],
    ["takings-by-payment", 0, 8, 2],
    ["till-shifts", 0, 7, 58],
  ]
  for (const [slug, daysBack, hour, minute] of builtInsOpened) {
    if (!builtInTemplate(slug)) continue
    const templateRef = `builtin:${slug}`
    const lastOpenedAt = at(daysBack, hour, minute)
    await prisma.reportTemplateUse.upsert({
      where: { companyId_templateRef: { companyId, templateRef } },
      create: { companyId, templateRef, opens: 1, lastOpenedAt, lastOpenedById: owner },
      update: { opens: 1, lastOpenedAt, lastOpenedById: owner },
    })
  }
  console.log(`  report templates: ${made} saved, ${builtInsOpened.length} built-ins last opened`)
}

/**
 * SET-11. No imports are seeded: an import is made by uploading
 * `public/demo/price-list-oct.xlsx` (`scripts/make-import-demo.ts`). Its row
 * 58, "Coca Cola 2l", looks like Coca-Cola 2l, so the shop sells that one
 * (Delta, 36 on the shelf), added as New product adds it.
 */
const COKE_2L = { code: "COKE-2L", name: "Coca-Cola 2l", price: "2.20", cost: "1.55", onHand: "36", reorderAt: "12" }

async function seedImportDemo(input: { companyId: string; mainSiteId: string; softDrinksId: string | null }) {
  const { companyId } = input
  const existing = await prisma.product.findFirst({ where: { companyId, code: COKE_2L.code }, select: { id: true } })
  if (existing) {
    await prisma.product.update({ where: { id: existing.id }, data: { archivedAt: null, isActive: true } })
  } else {
    const owner = await prisma.user.findFirstOrThrow({ where: { companyId, email: "owner@bottlestore.test" }, select: { id: true, name: true, role: true } })
    const delta = await prisma.vendor.findFirst({ where: { companyId, code: "SUP-0001" }, select: { id: true } })
    await prisma.$transaction(async (tx) => {
      const created = await createProduct(tx, {
        actor: { companyId, userId: owner.id, userName: owner.name, userRole: owner.role },
        input: productInput.parse({
          name: COKE_2L.name,
          categoryId: input.softDrinksId,
          price: COKE_2L.price,
          cost: COKE_2L.cost,
          supplierId: delta?.id ?? null,
          openingStock: COKE_2L.onHand,
          reorderAt: COKE_2L.reorderAt,
          siteId: input.mainSiteId,
        }),
        source: "ADDED",
      })
      await tx.product.update({ where: { id: created.productId }, data: { code: COKE_2L.code } })
      await tx.inventoryItem.update({ where: { id: created.itemId }, data: { itemCode: COKE_2L.code } })
    })
  }
  console.log(`  ${COKE_2L.name} on the shelf for the import demo (public/demo/price-list-oct.xlsx)`)
  await dateRetailAdds(companyId, [SPRITE.code, COKE_2L.code])
}

/**
 * Sprite 500ml and Coca-Cola 2l go on the shelf through New product, which
 * dates their Retail price today. The board's Retail list was last changed on
 * 3 October: their ADDED rows on it are dated that morning, 09:00 Harare,
 * before the 10:00 typed changes.
 */
async function dateRetailAdds(companyId: string, codes: string[]) {
  const at = new Date("2026-10-03T07:00:00Z")
  const retail = await prisma.priceList.findFirstOrThrow({ where: { companyId, isDefault: true }, select: { id: true } })
  await prisma.productPriceChange.updateMany({
    where: { companyId, priceListId: retail.id, source: "ADDED", product: { code: { in: codes } } },
    data: { effectiveAt: at, appliedAt: at, createdAt: at },
  })
}

/**
 * PRD-03: the price history on the default list. Every product put on it 1
 * August at its "was" price; on 3 October at 10:00 Tendai Mhlanga typed ten
 * of them to today's. Amarula went on at 16.90 and rose twice in between,
 * so it has four rows. Charcoal is the one that came down, 4.50 to 3.90, so
 * its shelf label strikes the old price through (PRD-06). Deleted and written
 * again per product.
 */
const WAS: Record<string, string> = {
  "AMARULA-750": "17.50",
  "CASTLE-340": "1.10",
  "CASTLE-CASE": "25.90",
  "COKE-500": "0.70",
  "HUNTERS-330": "1.80",
  "ICE-2KG": "1.40",
  "JAMESON-750": "26.50",
  "NEDERBURG-750": "12.00",
  "TWOKEYS-750": "9.50",
  "CHARCOAL-4KG": "4.50",
}

async function seedPriceHistory(companyId: string) {
  const owner = await prisma.user.findFirst({ where: { companyId, email: "owner@bottlestore.test" }, select: { id: true } })
  const list = await prisma.priceList.findFirstOrThrow({ where: { companyId, isDefault: true }, select: { id: true } })
  // Harare is UTC+2: 09:00 on 1 August, 10:00 on 3 October.
  const added = new Date("2026-08-01T07:00:00Z")
  const typed = new Date("2026-10-03T08:00:00Z")
  let rows = 0
  for (const entry of CATALOGUE) {
    const product = await prisma.product.findFirst({ where: { companyId, code: entry.code }, select: { id: true } })
    if (!product) continue
    await prisma.productPriceChange.deleteMany({ where: { companyId, productId: product.id, priceListId: list.id } })
    const change = (from: string | null, to: string, source: "ADDED" | "TYPED", at: Date) => ({
      companyId,
      priceListId: list.id,
      productId: product.id,
      minQuantity: new Prisma.Decimal(1),
      fromPrice: from === null ? null : money(from),
      toPrice: money(to),
      source,
      effectiveAt: at,
      appliedAt: at,
      createdById: source === "TYPED" ? (owner?.id ?? null) : null,
      createdAt: at,
    })
    const was = WAS[entry.code]
    const history =
      entry.code === "AMARULA-750"
        ? [
            change(null, "16.90", "ADDED", added),
            change("16.90", "17.25", "TYPED", new Date("2026-08-20T09:00:00Z")),
            change("17.25", "17.50", "TYPED", new Date("2026-09-01T09:00:00Z")),
            change("17.50", entry.price, "TYPED", typed),
          ]
        : was
          ? [change(null, was, "ADDED", added), change(was, entry.price, "TYPED", typed)]
          : [change(null, entry.price, "ADDED", added)]
    await prisma.productPriceChange.createMany({ data: history })
    rows += history.length
  }
  console.log(`  price history: ${rows} changes on the default list`)
}

/**
 * PRD-05: the board's five lists (20-products 3.5, `PriceLists.png`). Retail
 * is the default and sets each product's own price; Wholesale follows it less
 * 8% for customers on a wholesale account buying 6 or more, Amarula typed at
 * 16.90; Happy hour is 10% off beer on Fridays 17:00 to 19:00; Staff is cost
 * plus 5%; Avondale branch is a draft for Borrowdale at Retail plus 5%, with
 * Ice and Coca-Cola typed below their cost. Each row carries its ADDED (and
 * TYPED) history on its list's day. "Happy hour (old)" sits in the bin
 * (BinList board). The four are made again on every run; with --reset any
 * other list goes too. Sales seeded before the engine are marked as priced
 * from Retail. Savanna Dry, Hunter's Gold and the Castle case are left off
 * Wholesale, for "Add products to this list" (PRD-07).
 */
const NOT_ON_WHOLESALE = new Set(["SAVANNA-330", "HUNTERS-330", "CASTLE-CASE"]);

async function seedPriceLists(input: { companyId: string; borrowdaleId: string; reset: boolean }) {
  const { companyId } = input
  const owner = await prisma.user.findFirst({ where: { companyId, email: "owner@bottlestore.test" }, select: { id: true, name: true } })
  const retail = await prisma.priceList.findFirstOrThrow({ where: { companyId, isDefault: true }, select: { id: true } })
  const names = ["Wholesale", "Happy hour", "Staff", "Avondale branch", "Happy hour (old)"]
  await prisma.priceList.deleteMany({
    where: { companyId, isDefault: false, ...(input.reset ? {} : { name: { in: names } }) },
  })
  // Harare is UTC+2.
  const day = (iso: string) => new Date(`${iso}T08:00:00Z`)
  await prisma.priceList.update({ where: { id: retail.id }, data: { updatedAt: day("2026-10-03") } })

  const products = await prisma.product.findMany({
    where: { companyId, archivedAt: null },
    select: { id: true, code: true, costPrice: true, categoryId: true },
  })
  const retailRows = await prisma.productPrice.findMany({
    where: { priceListId: retail.id, minQuantity: 1, product: { archivedAt: null } },
    select: { productId: true, unitPrice: true },
  })
  const retailOf = new Map(retailRows.map((row) => [row.productId, row.unitPrice]))
  const codeOf = new Map(products.map((product) => [product.id, product.code]))
  const beer = await prisma.retailCategory.findFirst({ where: { companyId, name: "Beer", archivedAt: null }, select: { id: true } })

  type Row = { productId: string; price: Prisma.Decimal; follows: boolean; typed?: string }
  const make = async (spec: {
    name: string
    data: Omit<Prisma.PriceListUncheckedCreateInput, "companyId" | "name">
    on: string
    rows: Row[]
    minQuantity?: number
    categories?: string[]
  }) => {
    const at = day(spec.on)
    const list = await prisma.priceList.create({
      data: { companyId, name: spec.name, currency: "USD", taxInclusive: true, updatedById: owner?.id ?? null, ...spec.data, updatedAt: at, createdAt: at },
      select: { id: true },
    })
    if (spec.categories?.length) {
      await prisma.priceListCategory.createMany({ data: spec.categories.map((categoryId) => ({ priceListId: list.id, categoryId })) })
    }
    const minQuantity = new Prisma.Decimal(spec.minQuantity ?? 1)
    await prisma.productPrice.createMany({
      data: spec.rows.map((row) => ({
        companyId,
        priceListId: list.id,
        productId: row.productId,
        minQuantity,
        unitPrice: row.typed ? money(row.typed) : row.price,
        followsBase: row.typed ? false : row.follows,
      })),
    })
    const typedAt = new Date(at.getTime() + 60 * 60 * 1000)
    await prisma.productPriceChange.createMany({
      data: spec.rows.flatMap((row) => [
        { companyId, priceListId: list.id, productId: row.productId, minQuantity, fromPrice: null, toPrice: row.price, source: "ADDED" as const, effectiveAt: at, appliedAt: at, createdAt: at, createdById: owner?.id ?? null },
        ...(row.typed
          ? [{ companyId, priceListId: list.id, productId: row.productId, minQuantity, fromPrice: row.price, toPrice: money(row.typed), source: "TYPED" as const, effectiveAt: typedAt, appliedAt: typedAt, createdAt: typedAt, createdById: owner?.id ?? null }]
          : []),
      ]),
    })
    return list.id
  }

  const fromRetail = (adjust: number, only?: (product: (typeof products)[number]) => boolean, typed: Record<string, string> = {}): Row[] =>
    products
      .filter((product) => retailOf.has(product.id) && (!only || only(product)))
      .map((product) => ({ productId: product.id, price: followPrice(retailOf.get(product.id)!, adjust), follows: true, typed: typed[codeOf.get(product.id)!] }))

  await make({
    name: "Wholesale",
    on: "2026-09-28",
    minQuantity: 6,
    data: { kind: "WHOLESALE", state: "ON", audience: "ACCOUNT_CUSTOMERS", whenKind: "ALWAYS", minQuantity: 6, basis: "LIST", basisListId: retail.id, adjustPercent: new Prisma.Decimal(-8) },
    // PRD-07: three products wait to be added (W-16, `AddToList.png`).
    rows: fromRetail(-8, (product) => !NOT_ON_WHOLESALE.has(codeOf.get(product.id)!), { "AMARULA-750": "16.90" }),
  })
  await make({
    name: "Happy hour",
    on: "2026-09-19",
    data: { state: "ON", audience: "EVERYONE", whenKind: "DAYS_AND_HOURS", daysOfWeek: [5], fromTime: "17:00", toTime: "19:00", basis: "LIST", basisListId: retail.id, adjustPercent: new Prisma.Decimal(-10) },
    categories: beer ? [beer.id] : [],
    rows: fromRetail(-10, (product) => Boolean(beer) && product.categoryId === beer!.id),
  })
  await make({
    name: "Staff",
    on: "2026-08-01",
    data: { state: "ON", audience: "STAFF", whenKind: "ALWAYS", basis: "COST", adjustPercent: new Prisma.Decimal(5) },
    rows: products
      .filter((product) => product.costPrice !== null)
      .map((product) => ({ productId: product.id, price: followPrice(product.costPrice!, 5), follows: true })),
  })
  await make({
    name: "Avondale branch",
    on: "2026-10-02",
    data: { state: "DRAFT", audience: "EVERYONE", whenKind: "ALWAYS", siteId: input.borrowdaleId, basis: "LIST", basisListId: retail.id, adjustPercent: new Prisma.Decimal(5) },
    rows: fromRetail(5, undefined, { "ICE-2KG": "0.95", "COKE-500": "0.50" }),
  })
  // The bin's "Happy hour (old)": last year's, moved there by the owner.
  const old = await make({
    name: "Happy hour (old)",
    on: "2026-06-05",
    data: { state: "PAUSED", audience: "EVERYONE", whenKind: "DAYS_AND_HOURS", daysOfWeek: [5], fromTime: "16:00", toTime: "18:00", basis: "LIST", basisListId: retail.id, adjustPercent: new Prisma.Decimal(-15) },
    rows: fromRetail(-15, (product) => Boolean(beer) && product.categoryId === beer!.id),
  })
  if (owner) {
    await moveToBin({ companyId, userId: owner.id, userName: owner.name, userRole: "SUPERADMIN" }, { kind: "price-list", id: old }, new Date(Math.min(harareTime(1, 16, 40).getTime(), Date.now() - 60_000)))
  }

  // Lines rung before the engine came off the default list.
  const marked = await prisma.retailSaleLine.updateMany({ where: { companyId, priceListId: null, productId: { not: null } }, data: { priceListId: retail.id } })
  console.log(`  price lists: Retail and four more, one in the bin; ${marked.count} sale lines marked as priced from Retail`)
}

/** Stable pseudo-barcode from the SKU, so a re-run does not renumber the shelf. */
/**
 * ADM-07: the bin as the BinList board shows it — Nederburg Rosé 750ml, a
 * wine the shop stopped stocking, moved to the bin by Tendai Mhlanga today at
 * 09:02 through the product's own move (one minute before the run when that
 * is earlier); "Happy hour (old)" is `seedPriceLists`'. The board's PO-0029
 * (an order, BUY-02) joins when that kind can go in the bin; T. Marange
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
      // In the bin is off every till: archived as well (PRD-03).
      await prisma.product.update({ where: { id: existing.id }, data: { isActive: false } })
      console.log("  bin: Nederburg Rosé 750ml already in the bin")
    } else {
      await prisma.product.update({ where: { id: existing.id }, data: { archivedAt: null } })
    }
  }
  const current = existing ? await prisma.product.findUniqueOrThrow({ where: { id: existing.id }, select: { archivedAt: true } }) : null
  if (!current?.archivedAt) {
    const list = await prisma.priceList.findFirstOrThrow({ where: { companyId, isDefault: true }, select: { id: true } })
    const productId = await seedShelfLine({
      companyId,
      listId: list.id,
      code,
      name: "Nederburg Rosé 750ml",
      itemId: item.id,
      price: "12.60",
      isActive: true,
      categoryId: input.wineId,
      cost: "9.40",
      deposit: null,
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
    const strays = (await listBinEntries(companyId)).filter(
      (entry) =>
        !(entry.kind === "product" && entry.name === "Nederburg Rosé 750ml") && !(entry.kind === "price-list" && entry.name === "Happy hour (old)"),
    )
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
    select: { id: true, saleNo: true, currency: true, postedAt: true, lines: { select: { id: true, taxAmount: true, lineTotal: true } } },
  })
  let counter = 0
  for (const sale of sales) {
    counter += 1
    globalNo += 1
    // The tax each receipt was signed with, all at 15.5% (taxID 1), as the day's Z-report counts it.
    const cents = (field: "taxAmount" | "lineTotal") =>
      sale.lines.reduce((sum, line) => sum.plus(line[field]), new Prisma.Decimal(0)).times(100).toFixed(0)
    const signedTax = {
      lineRates: Object.fromEntries(sale.lines.map((line) => [line.id, VAT_PERCENT])),
      taxLines: [{ taxId: 1, taxPercent: VAT_PERCENT, taxAmountCents: cents("taxAmount"), salesAmountCents: cents("lineTotal") }],
    }
    await prisma.fiscalReceipt.create({
      data: {
        companyId,
        retailSaleId: sale.id,
        // "FDMS 0441-2209 / 31866": the device and the sale's number, as the SaleRecord board prints it.
        receiptNumber: `FDMS ${provider.deviceId} / ${sale.saleNo.replace(/^\D+-0*/, "")}`,
        fiscalNumber: `${provider.deviceId}/214/${counter}`,
        status: "SUCCESS",
        issuedAt: sale.postedAt,
        providerKey,
        receiptCounter: counter,
        receiptGlobalNo: globalNo,
        fiscalDayId: today.id,
        receiptType: "FISCALINVOICE",
        receiptCurrency: sale.currency,
        signedTax,
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

/**
 * FLR-08. The Overview's "Two receipts not yet fiscalised": Handheld 1's two
 * latest sales today were signed into day 214 but ZIMRA has not taken them,
 * so their receipts wait (PENDING) for the till to come back. Everything
 * else this morning `seedFiscal` has already signed. Purchase orders due,
 * promotions ending and low stock come from their own seeds.
 */
async function seedOverview(companyId: string) {
  const handheld = await prisma.retailRegister.findFirst({ where: { companyId, name: "Handheld 1" }, select: { id: true } })
  if (!handheld) {
    console.log("  overview: no Handheld 1, skipped")
    return
  }
  const sales = await prisma.retailSale.findMany({
    where: { companyId, registerId: handheld.id, saleType: "SALE", status: "POSTED", postedAt: { gte: harareTime(0, 0, 0) }, fiscalReceipt: { isNot: null } },
    orderBy: [{ postedAt: "desc" }, { id: "desc" }],
    take: 2,
    select: { id: true, saleNo: true },
  })
  await prisma.fiscalReceipt.updateMany({
    where: { companyId, retailSaleId: { in: sales.map((sale) => sale.id) } },
    data: { status: "PENDING", issuedAt: null, lastSyncedAt: null, attemptCount: 1, lastError: "ZIMRA did not answer: the till is offline." },
  })
  console.log(`  overview: ${sales.map((sale) => sale.saleNo).join(", ")} wait for ZIMRA`)
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

/**
 * ADM-04. Management › Approvals as the ApprovalSettings board draws it:
 * requisitions over US$500.00 need the owner, owner approvals go to Tendai
 * Mhlanga, managers change prices without approval, below cost needs the
 * owner, adjustments over US$50.00 need a manager PIN, the owner approves
 * count differences over US$100, accounts over US$250.00 need the owner,
 * asked on WhatsApp and the app — last changed by Tendai Mhlanga on the
 * latest 1 September, so the save bar reads "Last changed by Tendai
 * Mhlanga, 1 September." Saves of the page that test runs left are cleared.
 * "Waiting now" fills itself from BUY-04's and STK-06's own seeds.
 */
async function seedApprovals(companyId: string) {
  const owner = await prisma.user.findFirst({
    where: { companyId, email: "owner@bottlestore.test" },
    select: { id: true, name: true },
  })
  if (!owner) {
    console.log("  approvals: no owner, skipped")
    return
  }
  const settings = {
    requisitionOwnerOver: new Prisma.Decimal("500.00"),
    ownerApproverId: owner.id,
    priceChanges: "MANAGERS" as const,
    belowCostNeedsOwner: true,
    adjustmentPinOver: new Prisma.Decimal("50.00"),
    countDifferences: "OWNER_OVER_LIMIT" as const,
    countOwnerOver: new Prisma.Decimal("100.00"),
    accountOwnerOver: new Prisma.Decimal("250.00"),
    askBy: "WHATSAPP_AND_APP" as const,
    updatedById: owner.id,
  }
  await prisma.retailApprovalSettings.upsert({ where: { companyId }, update: settings, create: { companyId, ...settings } })
  const year = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare", year: "numeric" }).format(new Date()))
  const thisYear = new Date(`${year}-09-01T10:15:00+02:00`)
  const changedAt = thisYear.getTime() <= Date.now() ? thisYear : new Date(`${year - 1}-09-01T10:15:00+02:00`)
  await prisma.$executeRaw`UPDATE "RetailApprovalSettings" SET "updatedAt" = ${changedAt} WHERE "companyId" = ${companyId}`
  await prisma.platformAuditEvent.deleteMany({
    where: { companyId, entityType: "RetailSettings", entityId: "approvals", eventType: RETAIL_AUDIT_EVENTS.settingsChanged },
  })
  await writeRetailAuditEvent(prisma, {
    actor: { companyId, userId: owner.id, userName: owner.name, userRole: "SUPERADMIN" },
    eventType: RETAIL_AUDIT_EVENTS.settingsChanged,
    entityType: "RetailSettings",
    entityId: "approvals",
    payload: {
      page: "approvals",
      changes: [
        {
          field: "ownerApproverId",
          label: "Owner approvals go to",
          from: null,
          to: { id: owner.id, label: owner.name, sub: "Owner" },
        },
      ],
    },
  })
  const saved = await prisma.platformAuditEvent.findFirst({
    where: { companyId, eventType: RETAIL_AUDIT_EVENTS.settingsChanged, entityId: "approvals" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (saved) await prisma.platformAuditEvent.update({ where: { id: saved.id }, data: { createdAt: changedAt } })
  console.log("  approvals: the board's limits, owner approvals to Tendai Mhlanga, last changed on 1 September")
}

/**
 * CUS-01: the loyalty scheme with the board's values (1 point for each US$1,
 * a point worth US$0.01, spend from 500, a year to expire, Bronze, Silver
 * and Gold with Gold at 1.5), saved by the owner on 1 August at 09:30 —
 * "Last changed by Tendai Mhlanga, 1 August." Customers and their ledgers
 * come with the Customers units.
 */
async function seedLoyalty(companyId: string) {
  const owner = await prisma.user.findFirst({
    where: { companyId, email: "owner@bottlestore.test" },
    select: { id: true, name: true },
  })
  if (!owner) {
    console.log("  loyalty: no owner, skipped")
    return
  }
  const settings = {
    enabled: true,
    earnPerDollar: new Prisma.Decimal("1"),
    pointValue: new Prisma.Decimal("0.01"),
    spendFrom: 500,
    expiry: "AFTER_12_MONTHS" as const,
    tiers: [
      { name: "Bronze", from: "0.00" },
      { name: "Silver", from: "500.00" },
      { name: "Gold", from: "1500.00" },
    ],
    topTierEarnPerDollar: new Prisma.Decimal("1.5"),
    earnOnPromotions: true,
    birthdayBonus: true,
    birthdayPoints: 200,
    pointsPayForAlcohol: true,
    updatedById: owner.id,
  }
  await prisma.retailLoyaltySettings.upsert({ where: { companyId }, update: settings, create: { companyId, ...settings } })
  const year = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare", year: "numeric" }).format(new Date()))
  const thisYear = new Date(`${year}-08-01T09:30:00+02:00`)
  const changedAt = thisYear.getTime() <= Date.now() ? thisYear : new Date(`${year - 1}-08-01T09:30:00+02:00`)
  await prisma.$executeRaw`UPDATE "RetailLoyaltySettings" SET "updatedAt" = ${changedAt} WHERE "companyId" = ${companyId}`
  await prisma.platformAuditEvent.deleteMany({
    where: { companyId, entityType: "RetailSettings", entityId: "loyalty", eventType: RETAIL_AUDIT_EVENTS.settingsChanged },
  })
  await writeRetailAuditEvent(prisma, {
    actor: { companyId, userId: owner.id, userName: owner.name, userRole: "SUPERADMIN" },
    eventType: RETAIL_AUDIT_EVENTS.settingsChanged,
    entityType: "RetailSettings",
    entityId: "loyalty",
    payload: {
      page: "loyalty",
      changes: [{ field: "exp", label: "Points expire", from: "Never", to: "After 12 months" }],
    },
  })
  const saved = await prisma.platformAuditEvent.findFirst({
    where: { companyId, eventType: RETAIL_AUDIT_EVENTS.settingsChanged, entityId: "loyalty" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (saved) await prisma.platformAuditEvent.update({ where: { id: saved.id }, data: { createdAt: changedAt } })
  console.log("  loyalty: the board's scheme, last changed by Tendai Mhlanga on 1 August")
}

/* ── PRD-08: bundles and buy-more deals ───────────────────────────────── */

type SeededBundle = { id: string; code: string; kind: "FIXED_SET" | "BUY_MORE"; price: string }

/**
 * The four bundles of `BUNDLE_SEEDS`, made by the owner on their day, with
 * their items, and their Changes: "Made it at US$…", and the Braai pack's
 * price brought down from US$11.50 a month later. With --reset any other
 * bundle (one a walk made) goes, and the seeded ones are put back on sale.
 */
async function seedBundles(input: { companyId: string; productIds: Map<string, string>; reset: boolean }): Promise<Map<string, SeededBundle>> {
  const { companyId, productIds, reset } = input
  const owner = await prisma.user.findFirst({ where: { companyId, email: "owner@bottlestore.test" }, select: { id: true, name: true } })
  const categories = new Map(
    (await prisma.retailCategory.findMany({ where: { companyId, archivedAt: null }, select: { id: true, name: true } })).map((row) => [row.name, row.id]),
  )
  const codes = BUNDLE_SEEDS.map((seed) => seed.code)
  if (reset) {
    await prisma.retailBundle.deleteMany({ where: { companyId, code: { notIn: codes } } })
    await prisma.platformAuditEvent.deleteMany({ where: { companyId, entityType: "RetailBundle" } })
  }
  const seeded = new Map<string, SeededBundle>()
  for (const seed of BUNDLE_SEEDS) {
    const made = new Date(seed.made)
    const data = {
      kind: seed.kind,
      name: seed.name,
      barcode: seed.barcode ?? null,
      categoryId: seed.category ? (categories.get(seed.category) ?? null) : null,
      price: money(seed.price),
      buyQuantity: seed.buy ?? null,
      days: "EVERY_DAY" as const,
      daysOfWeek: [],
      endsOn: null,
      siteId: null,
      tillButton: true,
      pausedAt: null,
      stoppedAt: null,
      archivedAt: null,
      createdById: owner?.id ?? null,
      createdAt: made,
    }
    const bundle = await prisma.retailBundle.upsert({
      where: { companyId_code: { companyId, code: seed.code } },
      create: { companyId, code: seed.code, ...data },
      update: data,
      select: { id: true },
    })
    await prisma.retailBundleItem.deleteMany({ where: { bundleId: bundle.id } })
    await prisma.retailBundleItem.createMany({
      data: seed.items.map(([code, quantity], index) => ({ bundleId: bundle.id, productId: productIds.get(code)!, quantity, sortOrder: index })),
    })
    seeded.set(seed.code, { id: bundle.id, code: seed.code, kind: seed.kind, price: seed.price })

    // Its Changes, once: made at its price; the Braai pack's price down a month later.
    const written = await prisma.platformAuditEvent.count({ where: { companyId, entityType: "RetailBundle", entityId: bundle.id } })
    if (owner && written === 0) {
      const actor = { companyId, userId: owner.id, userName: owner.name ?? "Tendai Mhlanga", userRole: "SUPERADMIN" }
      const braai = seed.code === "BND-0004"
      await writeRetailAuditEvent(prisma, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.bundleCreated,
        entityType: "RetailBundle",
        entityId: bundle.id,
        payload: { code: seed.code, name: seed.name, price: braai ? "11.50" : seed.price },
      })
      await prisma.platformAuditEvent.updateMany({ where: { companyId, entityId: bundle.id, eventType: RETAIL_AUDIT_EVENTS.bundleCreated }, data: { createdAt: made } })
      if (braai) {
        await writeRetailAuditEvent(prisma, {
          actor,
          eventType: RETAIL_AUDIT_EVENTS.bundleChanged,
          entityType: "RetailBundle",
          entityId: bundle.id,
          payload: { name: seed.name, changes: [{ field: "price", label: "Price", from: "US$11.50", to: "US$11.00" }] },
        })
        await prisma.platformAuditEvent.updateMany({
          where: { companyId, entityId: bundle.id, eventType: RETAIL_AUDIT_EVENTS.bundleChanged },
          data: { createdAt: new Date(made.getTime() + 30 * DAY_MS) },
        })
      }
    }
  }
  const last = Math.max(...codes.map((code) => Number(code.slice(4))))
  const sequence = { companyId_entityKey_scopeKey: { companyId, entityKey: "RETAIL_BUNDLE", scopeKey: "GLOBAL" } }
  const current = await prisma.idSequence.findUnique({ where: sequence, select: { lastNumber: true } })
  if (reset || (current?.lastNumber ?? 0) < last) {
    await prisma.idSequence.upsert({ where: sequence, create: { companyId, entityKey: "RETAIL_BUNDLE", scopeKey: "GLOBAL", lastNumber: last }, update: { lastNumber: last } })
  }
  console.log(`  bundles: ${seeded.size} (${BUNDLE_SEEDS.map((seed) => seed.name).join(", ")})`)
  return seeded
}

/**
 * A bundle sale's lines at the bundle's price: a fixed set's price shared
 * over its lines pro rata to their own prices in whole cents, the cents left
 * to the dearest (as the till's engine shares it); a buy-more group's line
 * at the deal's price. Each line's VAT comes out of what it took, and its
 * discount is the bundle's saving on it, ex-VAT as the till writes it.
 */
function priceBundleLines(lines: Prisma.RetailSaleLineCreateManyInput[], bundle: SeededBundle) {
  const cents = (value: Prisma.Decimal) => Math.round(value.toNumber() * 100)
  const shelf = lines.map((line) => cents(money(line.unitPrice as Prisma.Decimal).times(line.quantity as Prisma.Decimal)))
  const target = cents(money(bundle.price))
  const shares = bundle.kind === "FIXED_SET" ? shareCents(target, shelf) : [target]
  lines.forEach((line, index) => {
    const gross = money(shares[index]! / 100)
    const net = netOfInclusiveTax(gross, VAT_PERCENT)
    const shelfGross = money(shelf[index]! / 100)
    line.lineTotal = gross
    line.taxAmount = gross.minus(net)
    line.discountAmount = netOfInclusiveTax(shelfGross, VAT_PERCENT).minus(net)
  })
}


/* ── Promotions (PRD-09) ─────────────────────────────────────────────── */

/** A wall-clock moment in Harare on a fixed day: "2026-09-02", "00:00". */
function harareAt(day: string, time = "00:00") {
  return new Date(`${day}T${time}:00+02:00`)
}

/** When the festive promotion starts, and as long again before it as it has run by the seed's day: the days its record compares. */
function festiveDates() {
  const starts = harareAt("2026-09-02")
  return { starts, before: new Date(starts.getTime() - Math.max(0, Date.now() - starts.getTime())) }
}

/** The two-for deals' products and dates, so the history sells them in pairs while they ran. */
function pairDeals() {
  return [
    { code: "COKE-500", from: harareAt("2026-07-01"), to: harareAt("2026-07-31", "23:59") },
    { code: "SAVANNA-330", from: harareAt("2026-06-01"), to: harareAt("2026-06-30", "23:59") },
  ]
}

type PromotionSeed = {
  code: string
  name: string
  type: "PERCENT" | "AMOUNT" | "BUY_X_PAY" | "FIXED_PRICE"
  value: string
  buyQuantity?: number
  scope: "EVERYTHING" | "CATEGORIES" | "PRODUCTS"
  products?: string[]
  categories?: string[]
  minBasket?: string
  audience?: "EVERYONE" | "STAFF"
  startsAt: Date
  endsAt: Date | null
}

/**
 * The nine promotions of `PromotionsList.png` (20-products 3.5), "today" the
 * seed's day: Running 3 (Festive, Staff, the Castle case at US$24.00 ending
 * tomorrow), Scheduled 1 (Christmas), Ended 5. PROMO-CASE and PROMO-FESTIVE
 * are updated in place. Returned as the till's snapshot holds them, so the
 * history is discounted by the engine itself. Staff never matches until the
 * customer units flag staff (D-3), so it gave nothing away.
 */
async function seedPromotions(input: {
  companyId: string
  productIds: Map<string, string>
  categoryIds: Map<string, string>
}): Promise<SnapshotPromotion[]> {
  const { companyId } = input
  const owner = await prisma.user.findFirst({ where: { companyId, email: "owner@bottlestore.test" }, select: { id: true, name: true } })
  const seeds: PromotionSeed[] = [
    { code: "PROMO-FESTIVE", name: "Festive season US$2 off spirits", type: "AMOUNT", value: "2.00", scope: "CATEGORIES", categories: ["Spirits"], startsAt: harareAt("2026-09-02"), endsAt: null },
    { code: "PROMO-STAFF", name: "Staff discount US$2", type: "AMOUNT", value: "2.00", scope: "EVERYTHING", audience: "STAFF", startsAt: harareAt("2026-08-15"), endsAt: null },
    { code: "PROMO-CASE24", name: "Castle case at US$24.00", type: "FIXED_PRICE", value: "24.00", scope: "PRODUCTS", products: ["CASTLE-CASE"], startsAt: harareTime(14, 0, 0), endsAt: harareTime(-1, 23, 59) },
    {
      code: "PROMO-XMAS",
      name: "Christmas hampers 10% off",
      type: "PERCENT",
      value: "10.00",
      scope: "PRODUCTS",
      products: ["AMARULA-750", "GORDONS-750", "JAMESON-750", "TWOKEYS-750"],
      startsAt: harareAt("2026-12-01"),
      endsAt: harareAt("2026-12-26", "23:59"),
    },
    { code: "PROMO-WINTER", name: "Winter basket 5% off", type: "PERCENT", value: "5.00", scope: "EVERYTHING", minBasket: "20.00", startsAt: harareAt("2026-08-05"), endsAt: harareAt("2026-09-02") },
    { code: "PROMO-CASE", name: "Case of Castle 5% off", type: "PERCENT", value: "5.00", scope: "PRODUCTS", products: ["CASTLE-CASE"], startsAt: harareAt("2026-07-14"), endsAt: harareAt("2026-09-12", "23:59") },
    { code: "PROMO-HERITAGE", name: "Heritage ciders 10% off", type: "PERCENT", value: "10.00", scope: "CATEGORIES", categories: ["Ciders and coolers"], startsAt: harareAt("2026-09-20"), endsAt: harareAt("2026-09-25", "23:59") },
    { code: "PROMO-COKE2", name: "Two Cokes for US$1.40", type: "BUY_X_PAY", value: "1.40", buyQuantity: 2, scope: "PRODUCTS", products: ["COKE-500"], startsAt: harareAt("2026-07-01"), endsAt: harareAt("2026-07-31", "23:59") },
    { code: "PROMO-SAVANNA", name: "Two Savanna for US$3.50", type: "BUY_X_PAY", value: "3.50", buyQuantity: 2, scope: "PRODUCTS", products: ["SAVANNA-330"], startsAt: harareAt("2026-06-01"), endsAt: harareAt("2026-06-30", "23:59") },
  ]
  // The boards' nine and no others (a walk's leftovers go), the bin's left as it is.
  await prisma.retailPromotion.deleteMany({ where: { companyId, archivedAt: null, promoCode: { notIn: seeds.map((seed) => seed.code) } } })
  const out: SnapshotPromotion[] = []
  for (const seed of seeds) {
    const productIds = (seed.products ?? []).map((code) => input.productIds.get(code)).filter((id): id is string => Boolean(id))
    const categoryIds = (seed.categories ?? []).map((name) => input.categoryIds.get(name)).filter((id): id is string => Boolean(id))
    const data = {
      name: seed.name,
      type: seed.type,
      value: money(seed.value),
      buyQuantity: seed.buyQuantity ?? null,
      scope: seed.scope,
      minBasket: seed.minBasket ? money(seed.minBasket) : null,
      daysOfWeek: [],
      audience: seed.audience ?? "EVERYONE",
      stacks: false,
      siteId: null,
      startsAt: seed.startsAt,
      endsAt: seed.endsAt,
      pausedAt: null,
      endedAt: null,
      archivedAt: null,
      createdById: owner?.id ?? null,
      createdAt: new Date(Math.min(seed.startsAt.getTime() - 3 * 24 * 60 * 60 * 1000, Date.now())),
    }
    const row = await prisma.retailPromotion.upsert({
      where: { companyId_promoCode: { companyId, promoCode: seed.code } },
      update: data,
      create: { companyId, promoCode: seed.code, ...data },
      select: { id: true },
    })
    await prisma.retailPromotionProduct.deleteMany({ where: { promotionId: row.id } })
    await prisma.retailPromotionCategory.deleteMany({ where: { promotionId: row.id } })
    if (productIds.length) await prisma.retailPromotionProduct.createMany({ data: productIds.map((productId) => ({ promotionId: row.id, productId })) })
    if (categoryIds.length) await prisma.retailPromotionCategory.createMany({ data: categoryIds.map((categoryId) => ({ promotionId: row.id, categoryId })) })
    out.push({
      id: row.id,
      code: seed.code,
      name: seed.name,
      type: seed.type,
      value: Number(seed.value),
      buyQuantity: seed.buyQuantity ?? null,
      scope: seed.scope,
      productIds,
      categoryIds,
      minBasket: seed.minBasket ? Number(seed.minBasket) : null,
      daysOfWeek: [],
      fromTime: null,
      toTime: null,
      audience: seed.audience ?? "EVERYONE",
      stacks: false,
      siteId: null,
      startsAt: seed.startsAt.toISOString(),
      endsAt: seed.endsAt?.toISOString() ?? null,
    })
  }
  // Their Activity, and nothing a walk left on them: made by the owner a few days before each started ("Scheduled it from 2 Sep 00:00").
  await prisma.platformAuditEvent.deleteMany({ where: { companyId, entityType: "RetailPromotion", entityId: { in: out.map((promotion) => promotion.id) } } })
  for (const promotion of owner ? out : []) {
    const startsAt = new Date(promotion.startsAt)
    await writeRetailAuditEvent(prisma, {
      actor: { companyId, userId: owner!.id, userName: owner!.name, userRole: "SUPERADMIN" },
      eventType: "RETAIL_PROMOTION.CREATED",
      entityType: "RetailPromotion",
      entityId: promotion.id,
      payload: { code: promotion.code, name: promotion.name, from: formatWhen(startsAt) },
    })
    const latest = await prisma.platformAuditEvent.findFirst({
      where: { companyId, eventType: "RETAIL_PROMOTION.CREATED", entityId: promotion.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })
    const at = new Date(Math.min(startsAt.getTime() - 3 * 24 * 60 * 60 * 1000, Date.now()))
    if (latest) await prisma.platformAuditEvent.update({ where: { id: latest.id }, data: { createdAt: at } })
  }
  // Festive's two changes before it started (`PromotionRecord.png`: Changes 3): US$1.50 off became US$2.00, weekends became every day.
  const festive = out.find((promotion) => promotion.code === "PROMO-FESTIVE")
  if (owner && festive) {
    const startsAt = new Date(festive.startsAt)
    const changes = [
      { daysBefore: 2, field: "value", label: "Value", from: "US$1.50", to: "US$2.00" },
      { daysBefore: 1, field: "days", label: "Days", from: "Weekends, all day", to: "Every day, all day" },
    ]
    for (const change of changes) {
      await writeRetailAuditEvent(prisma, {
        actor: { companyId, userId: owner.id, userName: owner.name, userRole: "SUPERADMIN" },
        eventType: "RETAIL_PROMOTION.CHANGED",
        entityType: "RetailPromotion",
        entityId: festive.id,
        payload: { name: festive.name, changes: [{ field: change.field, label: change.label, from: change.from, to: change.to }] },
      })
      const latest = await prisma.platformAuditEvent.findFirst({
        where: { companyId, eventType: "RETAIL_PROMOTION.CHANGED", entityId: festive.id },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      })
      if (latest) {
        await prisma.platformAuditEvent.update({ where: { id: latest.id }, data: { createdAt: new Date(startsAt.getTime() - change.daysBefore * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000) } })
      }
    }
  }
  return out
}

/**
 * A seeded sale's lines through the promotions running when it was rung, as
 * the till's engine prices them (`applyPromotions`): each discounted line
 * keeps its promotion and what it took off the shelf price; its total, VAT
 * and ex-VAT discount follow, the shelf price VAT-inclusive.
 */
function promoteLines(
  lines: Prisma.RetailSaleLineCreateManyInput[],
  promotions: SnapshotPromotion[],
  at: Date,
  siteId: string,
  categoryOf: (productId: string) => string | null,
) {
  const promoted = applyPromotions(
    promotions,
    lines.map((line) => ({
      key: line.id as string,
      productId: line.productId as string,
      categoryId: categoryOf(line.productId as string),
      quantity: money(line.quantity as Prisma.Decimal).toNumber(),
      unitPrice: money(line.unitPrice as Prisma.Decimal).toNumber(),
      alreadyOff: 0,
    })),
    { at, siteId },
  )
  for (const entry of promoted) {
    if (!entry.promotionId) continue
    const line = lines.find((row) => row.id === entry.key)!
    const shelfGross = multiplyMoney(line.quantity as Prisma.Decimal, line.unitPrice as Prisma.Decimal)
    const gross = shelfGross.minus(money(entry.discount))
    const net = netOfInclusiveTax(gross, VAT_PERCENT)
    line.lineTotal = gross
    line.taxAmount = gross.minus(net)
    line.discountAmount = netOfInclusiveTax(shelfGross, VAT_PERCENT).minus(net)
    line.promotionId = entry.promotionId
    line.promotionDiscount = money(entry.discount)
  }
}

/* ── Vouchers (PRD-10) ─────────────────────────────────────────────────── */

type VoucherSaleRow = Prisma.RetailSaleCreateManyInput
type VoucherLineRow = Prisma.RetailSaleLineCreateManyInput
type VoucherPaymentRow = Prisma.RetailSalePaymentCreateManyInput

const voucherAt = (iso: string) => new Date(`${iso}+02:00`)

/**
 * The boards' own voucher sales (`VoucherRecord.png`, `VouchersList.png`):
 * GV-0019 bought for US$20.00 cash on 14 August and spent on two Coke
 * six-packs (US$8.40) on 20 August at the Front till and one (US$4.20) on
 * 3 September at the Back till; GV-0021 bought by Tapiwa Marange on
 * 28 September; and the two refunds paid as credit notes, Nyasha Gwenzi's
 * Nederburg (CN-0033, US$12.60) and Kudzai Zhou's Coke six-pack (CN-0031,
 * US$4.20). Numbered with the history; `seedVouchers` finds them by `clientRef`.
 */
const VOUCHER_BOARD_SALES: Array<{
  ref: string
  at: string
  till: "front" | "back"
  customer?: string
  lines?: Array<[code: string, units: number]>
  refundOf?: string
  sold?: string
  pay: Array<[RetailTenderType, string]>
}> = [
  { ref: "voucher:CN-0031:sale", at: "2026-07-08T12:14:00", till: "front", customer: "Kudzai Zhou", lines: [["COKE-6PK", 1]], pay: [["ECOCASH", "4.20"]] },
  { ref: "voucher:CN-0031:refund", at: "2026-07-09T09:40:00", till: "front", customer: "Kudzai Zhou", refundOf: "voucher:CN-0031:sale", pay: [["VOUCHER", "4.20"]] },
  { ref: "voucher:GV-0019:sold", at: "2026-08-14T11:20:00", till: "front", sold: "20.00", pay: [["CASH", "20.00"]] },
  { ref: "voucher:GV-0019:use:1", at: "2026-08-20T13:05:00", till: "front", lines: [["COKE-6PK", 2]], pay: [["VOUCHER", "8.40"]] },
  { ref: "voucher:GV-0019:use:2", at: "2026-09-03T17:40:00", till: "back", lines: [["COKE-6PK", 1]], pay: [["VOUCHER", "4.20"]] },
  { ref: "voucher:GV-0021:sold", at: "2026-09-28T10:10:00", till: "front", customer: "Tapiwa Marange", sold: "50.00", pay: [["CASH", "50.00"]] },
  { ref: "voucher:CN-0033:sale", at: "2026-09-30T16:25:00", till: "front", customer: "Nyasha Gwenzi", lines: [["NEDERBURG-750", 1]], pay: [["CARD", "12.60"]] },
  { ref: "voucher:CN-0033:refund", at: "2026-10-02T10:30:00", till: "front", customer: "Nyasha Gwenzi", refundOf: "voucher:CN-0033:sale", pay: [["VOUCHER", "12.60"]] },
]

function voucherBoardSales(input: {
  companyId: string
  siteId: string
  tills: { front: string; back: string }
  cashier: { id: string; name: string }
  customerNamed: (name: string) => { id: string; name: string }
  line: (code: string) => { inventoryItemId: string; productId: string; name: string; price: string; cost: string }
}): { sales: VoucherSaleRow[]; lines: VoucherLineRow[]; payments: VoucherPaymentRow[] } {
  const sales: VoucherSaleRow[] = []
  const lines: VoucherLineRow[] = []
  const payments: VoucherPaymentRow[] = []
  const idOf = new Map<string, string>()
  VOUCHER_BOARD_SALES.forEach((plan, index) => {
    const at = voucherAt(plan.at)
    const saleId = randomUUID()
    idOf.set(plan.ref, saleId)
    const customer = plan.customer ? input.customerNamed(plan.customer) : null
    const sourceId = plan.refundOf ? idOf.get(plan.refundOf)! : null
    const own: VoucherLineRow[] = sourceId
      ? lines
          .filter((row) => row.saleId === sourceId)
          .map((row) => ({
            ...row,
            id: randomUUID(),
            saleId,
            sourceLineId: row.id as string,
            quantity: money(row.quantity as Prisma.Decimal).negated(),
            taxAmount: money(row.taxAmount as Prisma.Decimal).negated(),
            lineTotal: money(row.lineTotal as Prisma.Decimal).negated(),
            costTotal: money(row.costTotal as Prisma.Decimal).negated(),
            createdAt: at,
          }))
      : (plan.lines ?? []).map(([code, units]) => {
          const product = input.line(code)
          const gross = multiplyMoney(rate(String(units)), product.price)
          const net = netOfInclusiveTax(gross, VAT_PERCENT)
          return {
            id: randomUUID(),
            companyId: input.companyId,
            saleId,
            inventoryItemId: product.inventoryItemId,
            productId: product.productId,
            itemName: product.name,
            quantity: rate(String(units)),
            unitPrice: money(product.price),
            discountAmount: money(0),
            taxAmount: gross.minus(net),
            lineTotal: gross,
            costUnit: money(product.cost),
            costTotal: multiplyMoney(rate(String(units)), product.cost),
            createdAt: at,
          }
        })
    lines.push(...own)
    const total = sumMoney(own.map((row) => row.lineTotal as Prisma.Decimal))
    const tax = sumMoney(own.map((row) => row.taxAmount as Prisma.Decimal))
    const sold = money(plan.sold ?? "0")
    const sign = sourceId ? -1 : 1
    const paid = plan.pay.map(([tender, amount]) => [tender, money(amount).times(sign)] as const)
    sales.push({
      id: saleId,
      companyId: input.companyId,
      clientRef: plan.ref,
      saleNo: `S-V-${index + 1}`,
      siteId: input.siteId,
      registerId: input.tills[plan.till],
      sourceSaleId: sourceId,
      cashierId: input.cashier.id,
      cashierName: input.cashier.name,
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? null,
      saleType: sourceId ? "REFUND" : "SALE",
      status: "POSTED",
      subtotal: total.minus(tax),
      discountAmount: money(0),
      taxAmount: tax,
      totalAmount: total,
      vouchersSoldAmount: sold,
      tenderedAmount: sumMoney(paid.map(([, amount]) => amount)),
      changeAmount: money(0),
      currency: "USD",
      exchangeRate: rate("1"),
      baseAmount: total,
      ...(sourceId ? { overrideReason: "Paid back as a credit note" } : {}),
      postedAt: at,
      createdAt: at,
      updatedAt: at,
    })
    for (const [tender, amount] of paid) {
      payments.push({ id: randomUUID(), companyId: input.companyId, saleId, tenderType: tender, amount, currency: "USD", exchangeRate: rate("1"), baseAmount: amount, reference: null, createdAt: at })
    }
  })
  return { sales, lines, payments }
}

/**
 * What the history's dealing asks of the vouchers: the generated used-up
 * vouchers' one use each, paying part (a gift voucher, in fives up to
 * US$50.00) or all (a credit note) of an older card, EcoCash or transfer
 * sale between 20 April and 30 July; and DV-0007's 10% off eight baskets of
 * US$10.00 or more between 1 and 10 October, after the promotions. Every
 * eleventh and third sale that can take one, so the picks spread out.
 */
const USED_UP_VOUCHERS = 31
const DV_USES = 8

function voucherHistory() {
  const useFrom = voucherAt("2026-04-20T00:00:00").getTime()
  const useTo = voucherAt("2026-07-31T00:00:00").getTime()
  const dvFrom = voucherAt("2026-10-01T09:00:00").getTime()
  const dvTo = voucherAt("2026-10-10T22:00:00").getTime()
  let useSeen = 0
  let used = 0
  let dvSeen = 0
  let dvTaken = 0
  return {
    use(at: Date, tender: RetailTenderType, due: Prisma.Decimal): { ref: string; amount: string } | null {
      const when = at.getTime()
      if (when < useFrom || when >= useTo || used >= USED_UP_VOUCHERS) return null
      if (!["CARD", "ECOCASH", "TRANSFER"].includes(tender) || due.lessThan(8)) return null
      if (useSeen++ % 11 !== 5) return null
      const index = used++
      // Twelve gift vouchers among the thirty-one, spread through them.
      const gift = [0, 2, 5].includes(index % 8)
      const amount = gift ? money(Math.min(50, Math.floor(due.toNumber() / 5) * 5)) : due
      return { ref: `voucher:used:${index + 1}:${gift ? "GIFT" : "CREDIT_NOTE"}`, amount: amount.toFixed(2) }
    },
    discount(at: Date, lines: VoucherLineRow[]): string | null {
      const when = at.getTime()
      if (when < dvFrom || when > dvTo || dvTaken >= DV_USES || lines.length === 0) return null
      const totals = lines.map((line) => Math.round(money(line.lineTotal as Prisma.Decimal).toNumber() * 100))
      const basket = totals.reduce((sum, cents) => sum + cents, 0)
      // The reps' customers spend a little: baskets of US$10.00 or more.
      if (basket < 1000 || dvSeen++ % 3 !== 1) return null
      const off = Math.round(basket / 10)
      let given = 0
      lines.forEach((line, index) => {
        const share = index === lines.length - 1 ? off - given : Math.floor((off * totals[index]!) / Math.max(1, basket))
        given += share
        const shelfGross = multiplyMoney(line.quantity as Prisma.Decimal, line.unitPrice as Prisma.Decimal)
        const gross = money(line.lineTotal as Prisma.Decimal).minus(money(share).dividedBy(100))
        const net = netOfInclusiveTax(gross, VAT_PERCENT)
        line.lineTotal = gross
        line.taxAmount = gross.minus(net)
        line.discountAmount = netOfInclusiveTax(shelfGross, VAT_PERCENT).minus(net)
      })
      dvTaken += 1
      return `voucher:DV-0007:${dvTaken}`
    },
  }
}

const VOUCHER_SOURCES = ["RETAIL_VOUCHER_ISSUE", "RETAIL_VOUCHER_EXPIRY", "RETAIL_VOUCHER_VOID"] as const
const VOUCHER_ENTITIES = ["RETAIL_GIFT_VOUCHER", "RETAIL_CREDIT_NOTE", "RETAIL_DISCOUNT_VOUCHER"] as const

/** The journals of sales that are no longer there (a reset's history, and the vouchers' sales it posted). */
async function clearSaleJournals(companyId: string) {
  const types = ["RETAIL_SALE", "RETAIL_REFUND", "RETAIL_VOID"] as const
  const entries = await prisma.journalEntry.findMany({ where: { companyId, sourceType: { in: [...types] }, sourceId: { not: null } }, select: { sourceId: true } })
  const ids = [...new Set(entries.map((entry) => entry.sourceId!))]
  const kept = new Set((await prisma.retailSale.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((sale) => sale.id))
  const gone = ids.filter((id) => !kept.has(id))
  if (gone.length === 0) return
  const where = { companyId, sourceType: { in: [...types] }, sourceId: { in: gone } }
  await prisma.journalEntry.deleteMany({ where })
  await prisma.accountingIntegrationEvent.deleteMany({ where })
  console.log(`  reset: cleared the journals of ${gone.length} sale(s) no longer there`)
}

/** Every voucher, its uses, journals, messages and Activity: seeded again from nothing. */
async function clearVouchers(companyId: string) {
  await prisma.retailSalePayment.updateMany({ where: { companyId, voucherId: { not: null } }, data: { voucherId: null } })
  await prisma.retailSale.updateMany({ where: { companyId, discountVoucherId: { not: null } }, data: { discountVoucherId: null } })
  await prisma.retailVoucherUse.deleteMany({ where: { companyId } })
  const books = { companyId, sourceType: { in: [...VOUCHER_SOURCES] } }
  await prisma.journalLine.deleteMany({ where: { entry: books } })
  await prisma.journalEntry.deleteMany({ where: books })
  await prisma.accountingIntegrationEvent.deleteMany({ where: books })
  await prisma.retailMessage.deleteMany({ where: { companyId, entityType: "RetailVoucher" } })
  await prisma.platformAuditEvent.deleteMany({ where: { companyId, entityType: "RetailVoucher" } })
  await prisma.retailVoucher.deleteMany({ where: { companyId } })
  await prisma.idSequence.deleteMany({ where: { companyId, entityKey: { in: [...VOUCHER_ENTITIES] } } })
}

/** The next number of a kind is at least `next` (the boards' GV-0019 after fourteen generated gift vouchers). */
async function voucherNumberFrom(companyId: string, entity: (typeof VOUCHER_ENTITIES)[number], next: number) {
  const key = { companyId_entityKey_scopeKey: { companyId, entityKey: entity, scopeKey: "GLOBAL" } }
  const row = await prisma.idSequence.findUnique({ where: key, select: { lastNumber: true } })
  if (row && row.lastNumber >= next - 1) {
    if (row.lastNumber > next - 1) console.warn(`  vouchers: ${entity} is past ${next} already`)
    return
  }
  await prisma.idSequence.upsert({ where: key, update: { lastNumber: next - 1 }, create: { companyId, entityKey: entity, scopeKey: "GLOBAL", lastNumber: next - 1 } })
}

/**
 * PRD-10 `seedVouchers()`: the boards' five (GV-0021, CN-0033, GV-0019,
 * DV-0007, CN-0031) and the generated ones — 31 used up on the history, 10
 * live and 5 lapsed (9 and 6 while CN-0031 has not expired yet), so the tabs
 * read Live 14 · Used up 31 · Expired 6 · All 51 — each made, spent and
 * lapsed through its service, and every journal posted as it happened: the
 * ledger's 2250 Vouchers owed holds what is left on the live ones.
 */
async function seedVouchers(companyId: string) {
  const sales = await prisma.retailSale.findMany({
    where: { companyId, clientRef: { startsWith: "voucher:" } },
    include: { lines: true, payments: true, register: { select: { code: true } } },
  })
  const byRef = new Map(sales.map((sale) => [sale.clientRef!, sale]))
  if (!byRef.has("voucher:GV-0019:sold")) {
    console.log("  vouchers: the history has none of the vouchers' sales (run with --reset)")
    return
  }
  await clearVouchers(companyId)
  // Posted as it happened, whatever the schedule: Setup › Posting puts the shop's own back after.
  await prisma.retailPostingSettings.upsert({ where: { companyId }, update: { schedule: "EVERY_SALE" }, create: { companyId, schedule: "EVERY_SALE" } })

  const ownerRow = await prisma.user.findFirst({ where: { companyId, email: "owner@bottlestore.test" }, select: { id: true, name: true, role: true } })
  const chipoRow = await prisma.user.findFirst({ where: { companyId, name: "Chipo Dube" }, select: { id: true, name: true, role: true } })
  if (!ownerRow || !chipoRow) {
    console.log("  vouchers: no owner or Chipo Dube, skipped")
    return
  }
  const owner = { companyId, userId: ownerRow.id, userName: ownerRow.name, userRole: ownerRow.role }
  const chipo = { companyId, userId: chipoRow.id, userName: chipoRow.name, userRole: chipoRow.role }
  const customers = await prisma.customer.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
  const customerId = (name: string) => customers.find((customer) => customer.name === name)?.id ?? null

  /** The events a service just wrote for a voucher, dated when it happened. */
  const stamp = async (entityId: string, eventType: string, at: Date) => {
    const event = await prisma.platformAuditEvent.findFirst({ where: { companyId, entityType: "RetailVoucher", entityId, eventType }, orderBy: { createdAt: "desc" }, select: { id: true } })
    if (event) await prisma.platformAuditEvent.update({ where: { id: event.id }, data: { createdAt: at } })
  }
  const postSale = async (sale: (typeof sales)[number]) => {
    const row = await prisma.retailSale.findUniqueOrThrow({ where: { id: sale.id }, include: { lines: true, payments: true } })
    await ensureRetailSaleAccountingPosted({ actor: chipo, sale: row, registerCode: sale.register?.code ?? null })
  }
  const given = async (input: { kind: "GIFT" | "CREDIT_NOTE"; value: string; issued: Date; expires: string; customer: string | null }) => {
    const valueCents = Math.round(Number(input.value) * 100)
    const made = await prisma.$transaction((tx) =>
      issueVoucher(tx, { actor: owner, kind: input.kind, funding: "GIVEN", valueCents, customerId: input.customer ? customerId(input.customer) : null, expiresOn: input.expires, sendBy: "PRINT", issuedAt: input.issued }),
    )
    await postVoucherIssue(owner, { firstId: made.id, codes: [made.code], total: valueCents / 100, siteId: null, at: input.issued })
    await stamp(made.id, RETAIL_AUDIT_EVENTS.voucherIssued, input.issued)
    return made
  }
  const spend = async (sale: (typeof sales)[number], voucherId: string, amount: number) => {
    await prisma.$transaction((tx) =>
      redeemInSale(tx, { actor: chipo, sale: { id: sale.id, saleNo: sale.saleNo, siteId: sale.siteId, at: sale.postedAt! }, tenders: [{ voucherId, amount }], discount: null }),
    )
    await prisma.retailSalePayment.updateMany({ where: { saleId: sale.id, tenderType: "VOUCHER" }, data: { voucherId } })
    await stamp(voucherId, RETAIL_AUDIT_EVENTS.voucherRedeemed, sale.postedAt!)
    await postSale(sale)
  }
  const dayOf = (at: Date) => dayKey(at)
  const at10 = (day: string) => voucherAt(`${day}T10:15:00`)

  type Step = { at: Date; run: () => Promise<unknown> }
  const steps: Step[] = []

  // Used up on the history: each issued a few days before its sale, for anyone or one of the customers.
  const usedUp = sales.filter((sale) => sale.clientRef!.startsWith("voucher:used:"))
  for (const sale of usedUp) {
    const [, , number, kind] = sale.clientRef!.split(":") as [string, string, string, "GIFT" | "CREDIT_NOTE"]
    const index = Number(number)
    const amount = toNumberOrZero(sale.payments.find((payment) => payment.tenderType === "VOUCHER")?.amount ?? 0)
    const issued = at10(addDays(dayOf(sale.postedAt!), -(2 + (index % 12))))
    const issuedDay = dayOf(issued)
    steps.push({
      at: issued,
      run: async () => {
        const made = await given({
          kind,
          value: amount.toFixed(2),
          issued,
          expires: addMonths(issuedDay, kind === "GIFT" ? 12 : 3),
          customer: index % 3 === 0 ? null : customers[index % customers.length]?.name ?? null,
        })
        await spend(sale, made.id, amount)
      },
    })
  }

  // CN-0031 still live today: one fewer generated live voucher and one more lapsed, so the tabs read the boards'.
  const today = dayKey(new Date())
  const cn0031Live = "2026-10-09" >= today
  const lapsed: Array<{ kind: "GIFT" | "CREDIT_NOTE"; value: string; issued: string; expires: string; customer: string | null }> = [
    { kind: "GIFT", value: "25.00", issued: "2026-04-22", expires: "2026-07-22", customer: "Rudo Chirwa" },
    { kind: "GIFT", value: "20.00", issued: "2026-05-06", expires: "2026-08-06", customer: null },
    { kind: "CREDIT_NOTE", value: "6.40", issued: "2026-05-15", expires: "2026-08-15", customer: "Simba Mutasa" },
    { kind: "CREDIT_NOTE", value: "9.75", issued: "2026-06-03", expires: "2026-09-03", customer: "Munashe Chari" },
    { kind: "CREDIT_NOTE", value: "14.20", issued: "2026-06-18", expires: "2026-09-18", customer: "Blessing Ncube" },
    ...(cn0031Live ? [{ kind: "GIFT" as const, value: "30.00", issued: "2026-05-28", expires: "2026-08-28", customer: "Rutendo Banda" }] : []),
  ]
  for (const voucher of lapsed) steps.push({ at: at10(voucher.issued), run: () => given({ ...voucher, issued: at10(voucher.issued) }) })

  const live: Array<{ kind: "GIFT" | "CREDIT_NOTE"; value: string; issued: string; customer: string | null }> = [
    { kind: "CREDIT_NOTE", value: "7.80", issued: "2026-08-25", customer: "Farai Chikore" },
    { kind: "GIFT", value: "25.00", issued: "2026-09-05", customer: "Rudo Chirwa" },
    { kind: "GIFT", value: "10.00", issued: "2026-10-03", customer: null },
    { kind: "CREDIT_NOTE", value: "3.90", issued: "2026-10-04", customer: "Simba Mutasa" },
    { kind: "GIFT", value: "15.00", issued: "2026-10-05", customer: "Blessing Ncube" },
    { kind: "CREDIT_NOTE", value: "16.40", issued: "2026-10-06", customer: "Munashe Chari" },
    { kind: "GIFT", value: "20.00", issued: "2026-10-07", customer: null },
    { kind: "CREDIT_NOTE", value: "5.60", issued: "2026-10-08", customer: "Rutendo Banda" },
    { kind: "CREDIT_NOTE", value: "12.50", issued: "2026-10-09", customer: "Tinashe Mavhunga" },
    ...(cn0031Live ? [] : [{ kind: "CREDIT_NOTE" as const, value: "2.20", issued: "2026-10-10", customer: "Farai Chikore" }]),
  ].filter((voucher) => voucher.issued < today)
  for (const voucher of live) {
    steps.push({
      at: at10(voucher.issued),
      run: () => given({ ...voucher, issued: at10(voucher.issued), expires: addMonths(voucher.issued, voucher.kind === "GIFT" ? 12 : 3) }),
    })
  }

  // The boards' five.
  const board = (ref: string) => byRef.get(ref)!
  const creditNote = (code: string, customer: string) => async () => {
    await voucherNumberFrom(companyId, "RETAIL_CREDIT_NOTE", Number(code.slice(3)))
    const sale = board(`voucher:${code}:sale`)
    const refund = board(`voucher:${code}:refund`)
    const value = toNumberOrZero(refund.payments[0]!.amount)
    const made = await prisma.$transaction((tx) =>
      issueCreditNote(tx, { actor: chipo, sourceSaleId: sale.id, value: Math.abs(value).toFixed(2), customerId: customerId(customer), now: refund.postedAt! }),
    )
    await prisma.retailSalePayment.updateMany({ where: { saleId: refund.id, tenderType: "VOUCHER" }, data: { voucherId: made.id } })
    await stamp(made.id, RETAIL_AUDIT_EVENTS.voucherIssued, refund.postedAt!)
    await postSale(sale)
    await postSale(refund)
  }
  const soldVoucher = (code: string, customer: string | null) => async () => {
    await voucherNumberFrom(companyId, "RETAIL_GIFT_VOUCHER", Number(code.slice(3)))
    const sale = board(`voucher:${code}:sold`)
    const [made] = await prisma.$transaction((tx) =>
      sellGiftVouchers(tx, {
        actor: chipo,
        saleId: sale.id,
        vouchers: [{ valueCents: Math.round(toNumberOrZero(sale.vouchersSoldAmount) * 100), customerId: customer ? customerId(customer) : null }],
        now: sale.postedAt!,
      }),
    )
    await stamp(made!.id, RETAIL_AUDIT_EVENTS.voucherIssued, sale.postedAt!)
    await postSale(sale)
    return made!
  }
  steps.push({ at: board("voucher:CN-0031:refund").postedAt!, run: creditNote("CN-0031", "Kudzai Zhou") })
  steps.push({
    at: board("voucher:GV-0019:sold").postedAt!,
    run: async () => {
      const made = await soldVoucher("GV-0019", null)()
      for (const ref of ["voucher:GV-0019:use:1", "voucher:GV-0019:use:2"]) {
        const sale = board(ref)
        await spend(sale, made.id, toNumberOrZero(sale.payments[0]!.amount))
      }
    },
  })
  steps.push({ at: board("voucher:GV-0021:sold").postedAt!, run: soldVoucher("GV-0021", "Tapiwa Marange") })
  steps.push({ at: board("voucher:CN-0033:refund").postedAt!, run: creditNote("CN-0033", "Nyasha Gwenzi") })
  steps.push({
    at: voucherAt("2026-10-01T09:00:00"),
    run: async () => {
      await voucherNumberFrom(companyId, "RETAIL_DISCOUNT_VOUCHER", 7)
      const issued = voucherAt("2026-10-01T09:00:00")
      const made = await prisma.$transaction((tx) =>
        issueVoucher(tx, { actor: owner, kind: "DISCOUNT", funding: "GIVEN", percentOff: 10, copies: 20, holderNote: "Delta reps", expiresOn: "2026-10-31", sendBy: "PRINT", issuedAt: issued }),
      )
      await stamp(made.id, RETAIL_AUDIT_EVENTS.voucherIssued, issued)
      const dvSales = sales.filter((sale) => sale.clientRef!.startsWith("voucher:DV-0007:")).sort((a, b) => a.postedAt!.getTime() - b.postedAt!.getTime())
      for (const sale of dvSales) {
        // What the voucher took off: the shelf less what the lines came to and what the promotions gave.
        const off = sale.lines.reduce(
          (sum, line) => sum + toNumberOrZero(line.quantity) * toNumberOrZero(line.unitPrice) - toNumberOrZero(line.lineTotal) - toNumberOrZero(line.promotionDiscount),
          0,
        )
        await prisma.$transaction((tx) =>
          redeemInSale(tx, {
            actor: chipo,
            sale: { id: sale.id, saleNo: sale.saleNo, siteId: sale.siteId, at: sale.postedAt! },
            tenders: [],
            discount: { voucherId: made.id, discount: Math.round(off * 100) / 100 },
          }),
        )
        await prisma.retailSale.update({ where: { id: sale.id }, data: { discountVoucherId: made.id } })
        await stamp(made.id, RETAIL_AUDIT_EVENTS.voucherRedeemed, sale.postedAt!)
      }
    },
  })

  steps.sort((a, b) => a.at.getTime() - b.at.getTime())
  for (const step of steps) await step.run()

  // The lapsed ones expired by the worker on their next day; CN-0031 is left for the worker (W-18, acceptance).
  const lapseAt = new Date(Math.min(Date.now(), voucherAt("2026-10-01T00:10:00").getTime()))
  const expired = await expireVouchers(lapseAt, companyId)
  for (const voucher of await prisma.retailVoucher.findMany({ where: { companyId, expiredAt: { not: null } }, select: { id: true, expiresOn: true } })) {
    const at = voucherAt(`${addDays(voucher.expiresOn.toISOString().slice(0, 10), 1)}T00:10:00`)
    await prisma.retailVoucher.update({ where: { id: voucher.id }, data: { expiredAt: at } })
    await stamp(voucher.id, RETAIL_AUDIT_EVENTS.voucherExpired, at)
  }

  // What the ledger owes against what is left on the live money vouchers.
  const owedAccount = await prisma.chartOfAccount.findFirst({ where: { companyId, code: "2250" }, select: { id: true } })
  const owed = owedAccount
    ? await prisma.journalLine.aggregate({ where: { accountId: owedAccount.id }, _sum: { credit: true, debit: true } })
    : null
  const ledger = owed ? toNumberOrZero(owed._sum.credit ?? 0) - toNumberOrZero(owed._sum.debit ?? 0) : 0
  const left = await prisma.retailVoucher.aggregate({ where: { companyId, voidedAt: null, expiredAt: null, kind: { not: "DISCOUNT" } }, _sum: { balance: true } })
  const count = await prisma.retailVoucher.count({ where: { companyId } })
  console.log(
    `  vouchers: ${count} (${usedUp.length} used up on the history, ${expired} lapsed), 2250 owes US$${ledger.toFixed(2)} against US$${toNumberOrZero(left._sum.balance ?? 0).toFixed(2)} left on them`,
  )
}

/* ── CUS-02: the shop's customers, their visits and their points ──────── */

/**
 * The CustomersList board's eight regulars, in its order: every one Gold by
 * spend and agreeing to messages, with the board's visits, last visit, spend
 * in 12 months and points exactly (`seedCustomers`). `last` is the month and
 * day of the last visit, the most recent one before today.
 */
const REGULARS: Array<{
  name: string
  visits: number
  last: string
  spend: string
  points: number
  since: string
  code?: number
  area?: string
  email?: string
  dob?: string
}> = [
  {
    name: "Tapiwa Marange",
    visits: 141,
    last: "08-15",
    spend: "3021.80",
    points: 3021,
    since: "2024-03-12",
    code: 141,
    area: "Mbare, Harare",
    email: "tapiwa.marange@gmail.com",
    dob: "1988-03-14",
  },
  { name: "Nyasha Gwenzi", visits: 149, last: "08-16", spend: "2975.55", points: 2975, since: "2023-11-04" },
  { name: "Rutendo Banda", visits: 121, last: "08-15", spend: "2768.00", points: 2768, since: "2024-01-20" },
  { name: "Munashe Chari", visits: 139, last: "08-16", spend: "2515.10", points: 2515, since: "2023-12-02" },
  { name: "Blessing Ncube", visits: 127, last: "08-17", spend: "2414.10", points: 2414, since: "2024-02-15" },
  { name: "Kudzai Zhou", visits: 138, last: "08-17", spend: "2345.90", points: 2345, since: "2024-04-08" },
  { name: "Simba Mutasa", visits: 122, last: "08-16", spend: "2146.50", points: 2146, since: "2024-05-19" },
  { name: "Rudo Chirwa", visits: 124, last: "08-14", spend: "2051.30", points: 2051, since: "2024-06-30" },
]

/** C-44: Tapiwa's second card, one digit off his number, never merged. */
const DUPLICATE_TAPIWA = { name: "T. Marange", phone: "+263774123380", visits: 9, last: "09-02", spend: "412.60", points: 412, since: "2025-09-20" }

const MEMBER_COUNT = 420
const ACTIVE_MEMBERS = 412
const MEMBER_FIRST = [
  "Tendai", "Tatenda", "Rumbidzai", "Chiedza", "Farai", "Nyasha", "Tafadzwa", "Kudakwashe", "Ropafadzo", "Tinotenda",
  "Vimbai", "Shingai", "Takudzwa", "Anesu", "Panashe", "Fadzai", "Tsitsi", "Rutendo", "Munyaradzi", "Tonderai",
  "Thandeka", "Sipho", "Nkosana", "Lindiwe", "Sibusiso", "Nomvula", "Themba", "Zodwa", "Mandla", "Sihle",
  "Bongani", "Nqobile", "Lungile", "Busisiwe", "Thulani", "Nokuthula", "Mthokozisi", "Siphiwe", "Dumisani", "Zanele",
]
const MEMBER_LAST = [
  "Moyo", "Ncube", "Sibanda", "Dube", "Ndlovu", "Mpofu", "Nyoni", "Khumalo", "Mlilo", "Tshuma",
  "Chikwanha", "Mutasa", "Mapfumo", "Chigumba", "Makoni", "Gumbo", "Mhlanga", "Zvobgo", "Marufu", "Chinamasa",
  "Machingura", "Nyathi", "Mupfumira", "Chiweshe", "Mushonga", "Mudzingwa", "Hove", "Shumba", "Matanda", "Mavhima",
  "Chitepo", "Mangwende", "Murwira", "Chirwa", "Zhou", "Kanengoni", "Mabhena", "Gwenzi", "Chari", "Mukandatsama",
]
const MEMBER_AREAS = ["Mbare, Harare", "Highfield, Harare", "Avondale, Harare", "Glen View, Harare", "Kuwadzana, Harare", "Mabvuku, Harare"]

/** A small seeded generator, so the members come out the same each run. */
function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The most recent `MM-DD` on or before today in Harare, at noon there. */
function lastDayOn(monthDay: string): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare" }).format(new Date())
  const year = Number(today.slice(0, 4))
  const day = `${year}-${monthDay}`
  return day <= today ? day : `${year - 1}-${monthDay}`
}

const harareDay = (day: string, time: string) => new Date(`${day}T${time}:00+02:00`)

/**
 * CUS-02 `seedCustomers()`: the shop's customers on its history.
 *
 * - The board's eight regulars and C-44's duplicate, at the exact figures of
 *   `REGULARS`: their visits inside the floor's history are its own sales
 *   (on the day of the last visit, then spread back), and the visits before
 *   it are rung by `seedCustomerHistory` on a closed Front till shift of their
 *   own day, so the 12-month spend lands to the cent (the last of them tops
 *   up with airtime) and the shift counts stay true.
 * - 420 members (Shona and Ndebele names, their own +263 71/73/77/78 numbers,
 *   85% agreeing to messages, members since across 18 months, three with a
 *   birthday next week), put on the history's own sales, larger baskets first:
 *   412 shopped in the last 30 days, and none spent US$1,500 in 12 months.
 * - Every attached sale earns its points (EARNED, the floor of what it came
 *   to); a regular's last row lands the board's balance.
 * - Codes and cards in the order they joined, Tapiwa Marange CUS-00141.
 *   Simba Nkomo is not seeded: he is added in the acceptance walk.
 *
 * Not seeded yet: the members' planned sales spending points (21,400 points)
 * need the till's points discount on a history sale.
 */
async function seedCustomers(companyId: string) {
  const random = seededRandom(53)
  const chance = (p: number) => random() < p
  const within = (low: number, high: number) => low + Math.floor(random() * (high - low + 1))
  const now = new Date()
  const yearStart = new Date(now.getTime() - 365 * DAY_MS + 2 * DAY_MS)

  // ── Who they are ──
  const regularNames = new Set([...REGULARS.map((regular) => regular.name), DUPLICATE_TAPIWA.name])
  const keep = new Set([...CUSTOMERS, DUPLICATE_TAPIWA.name])
  const taken = new Set([...Object.values(CUSTOMER_PHONES), DUPLICATE_TAPIWA.phone])
  for (const user of await prisma.user.findMany({ where: { companyId, phone: { not: null } }, select: { phone: true } })) {
    if (user.phone) taken.add(user.phone.replace(/[^\d+]/g, ""))
  }
  type Plan = {
    name: string
    phone: string
    since: Date
    consent: boolean
    area: string | null
    email: string | null
    dob: string | null
  }
  const plans: Plan[] = []
  for (const regular of REGULARS) {
    plans.push({
      name: regular.name,
      phone: CUSTOMER_PHONES[regular.name]!,
      since: harareDay(regular.since, "10:00"),
      consent: true,
      area: regular.area ?? null,
      email: regular.email ?? null,
      dob: regular.dob ?? null,
    })
  }
  plans.push({ name: DUPLICATE_TAPIWA.name, phone: DUPLICATE_TAPIWA.phone, since: harareDay(DUPLICATE_TAPIWA.since, "11:20"), consent: false, area: null, email: null, dob: null })
  for (const name of ["Farai Chikore", "Tinashe Mavhunga"]) {
    plans.push({ name, phone: CUSTOMER_PHONES[name]!, since: new Date(now.getTime() - within(200, 500) * DAY_MS), consent: true, area: null, email: null, dob: null })
  }
  const names = new Set(plans.map((plan) => plan.name))
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare" }).format(now)
  while (plans.length < REGULARS.length + 3 + MEMBER_COUNT) {
    const name = `${MEMBER_FIRST[within(0, MEMBER_FIRST.length - 1)]} ${MEMBER_LAST[within(0, MEMBER_LAST.length - 1)]}`
    if (names.has(name)) continue
    let phone = ""
    do phone = `+2637${["1", "3", "7", "8"][within(0, 3)]}${String(within(0, 9_999_999)).padStart(7, "0")}`
    while (taken.has(phone))
    names.add(name)
    taken.add(phone)
    const index = plans.length - (REGULARS.length + 3)
    // Three birthdays next week; a few others known, for the bonus.
    const dob =
      index < 3
        ? `${1980 + within(0, 20)}-${addDays(today, 2 + index * 2).slice(5)}`
        : chance(0.06)
          ? `${1970 + within(0, 35)}-${String(within(1, 12)).padStart(2, "0")}-${String(within(1, 28)).padStart(2, "0")}`
          : null
    plans.push({
      name,
      phone,
      since: new Date(now.getTime() - within(31, 540) * DAY_MS - within(0, 600) * 60_000),
      consent: chance(0.85),
      area: chance(0.08) ? MEMBER_AREAS[within(0, MEMBER_AREAS.length - 1)]! : null,
      email: null,
      dob,
    })
  }

  // Nobody else: customers a run or a walk added go, with whatever points they had.
  const others = await prisma.customer.findMany({ where: { companyId, name: { notIn: [...names] } }, select: { id: true } })
  const otherIds = others.map((row) => row.id)
  await prisma.retailSale.updateMany({ where: { companyId, customerId: { in: otherIds } }, data: { customerId: null, customerName: null } })
  await prisma.retailVoucher.updateMany({ where: { companyId, customerId: { in: otherIds } }, data: { customerId: null } })
  await prisma.retailEmptiesEntry.updateMany({ where: { companyId, customerId: { in: otherIds } }, data: { customerId: null } })
  await prisma.customer.updateMany({ where: { companyId, mergedIntoId: { in: otherIds } }, data: { mergedIntoId: null } })
  await prisma.customer.deleteMany({
    where: { id: { in: otherIds }, invoices: { none: {} }, quotations: { none: {} }, crmClients: { none: {} } },
  })
  await prisma.customer.updateMany({ where: { id: { in: otherIds } }, data: { archivedAt: now, isActive: false } })
  await prisma.retailPointsEntry.deleteMany({ where: { companyId } })

  // Codes and cards in the order they joined; Tapiwa keeps CUS-00141. Moved aside first, as codes are unique.
  plans.sort((a, b) => a.since.getTime() - b.since.getTime())
  const existing = new Map((await prisma.customer.findMany({ where: { companyId, name: { in: [...names] } }, select: { id: true, name: true } })).map((row) => [row.name, row.id]))
  await prisma.customer.updateMany({ where: { companyId }, data: { code: null, cardNo: null } })
  const ids = new Map<string, string>()
  let number = 0
  const rows: Prisma.CustomerCreateManyInput[] = []
  for (const plan of plans) {
    const fixed = REGULARS.find((regular) => regular.name === plan.name)?.code
    if (!fixed) {
      number += 1
      if (number === 141) number += 1
    }
    const n = fixed ?? number
    const id = existing.get(plan.name) ?? randomUUID()
    ids.set(plan.name, id)
    const data = {
      name: plan.name,
      phone: plan.phone,
      code: `CUS-${String(n).padStart(5, "0")}`,
      cardNo: `600914${String(n).padStart(6, "0")}`,
      marketingConsent: plan.consent,
      consentChangedAt: plan.consent ? plan.since : null,
      area: plan.area,
      email: plan.email,
      dateOfBirth: plan.dob ? new Date(`${plan.dob}T00:00:00Z`) : null,
      isActive: true,
      archivedAt: null,
      mergedIntoId: null,
      tierHeld: null,
      tierHeldUntil: null,
      createdAt: plan.since,
    }
    if (existing.has(plan.name)) await prisma.customer.update({ where: { id }, data })
    else rows.push({ id, companyId, ...data })
  }
  if (rows.length) await prisma.customer.createMany({ data: rows })
  await prisma.idSequence.deleteMany({ where: { companyId, entityKey: "RETAIL_CUSTOMER" } })

  // ── Their visits ──
  // The floor's own sales stay as rung: the boards' morning and the vouchers' sales keep their customers.
  await prisma.retailSale.updateMany({
    where: {
      companyId,
      customerId: { not: null },
      NOT: { saleNo: { gte: "SALE-31858", lte: "SALE-31870" } },
      OR: [{ clientRef: null }, { NOT: { clientRef: { startsWith: "voucher:" } } }],
    },
    data: { customerId: null, customerName: null },
  })
  const history = await prisma.retailSale.findMany({
    where: { companyId, saleType: "SALE", status: "POSTED", postedAt: { not: null } },
    select: { id: true, saleNo: true, postedAt: true, baseAmount: true, customerId: true, siteId: true, reversals: { select: { id: true } } },
    orderBy: { postedAt: "asc" },
  })
  const floorStart = history[0]?.postedAt ?? now
  const free = history.filter(
    (sale) => !sale.customerId && sale.reversals.length === 0 && !(sale.saleNo >= "SALE-31858" && sale.saleNo <= "SALE-31870") && Number(sale.baseAmount) > 0,
  )
  const used = new Set<string>()
  const attach = new Map<string, string[]>()
  const give = (customerId: string, saleId: string) => {
    used.add(saleId)
    attach.set(customerId, [...(attach.get(customerId) ?? []), saleId])
  }

  // The regulars: their days in the history, the last visit's day first.
  type Visit = { customerId: string; name: string; at: Date; amount: number | null }
  const planned: Visit[] = []
  const exact: Array<{ customerId: string; points: number }> = []
  for (const regular of [...REGULARS, DUPLICATE_TAPIWA]) {
    const customerId = ids.get(regular.name)!
    const last = lastDayOn(regular.last)
    const lastAt = harareDay(last, "23:59")
    // Their sales the boards already ring after the last visit are walk-ins now.
    await prisma.retailSale.updateMany({ where: { companyId, customerId, postedAt: { gt: lastAt } }, data: { customerId: null, customerName: null } })
    const own = await prisma.retailSale.findMany({
      where: { companyId, customerId, postedAt: { gte: yearStart } },
      select: { saleType: true, status: true, baseAmount: true },
    })
    const ownSpend = own.reduce((sum, row) => sum + Number(row.baseAmount), 0)
    const ownVisits = own.filter((row) => row.saleType === "SALE" && row.status !== "VOIDED").length
    const target = Number(regular.spend) - ownSpend
    const visits = regular.visits - ownVisits
    const average = target / visits
    const span = lastAt.getTime() - yearStart.getTime()
    const inside = Math.max(1, Math.round((visits * (lastAt.getTime() - floorStart.getTime())) / span))
    const fits = (sale: (typeof free)[number]) => !used.has(sale.id) && Number(sale.baseAmount) >= average * 0.5 && Number(sale.baseAmount) <= average * 1.8
    const onLast = free.filter((sale) => dayKey(sale.postedAt!) === last && fits(sale))
    const chosen: typeof free = []
    if (onLast.length) chosen.push(onLast[within(0, onLast.length - 1)]!)
    const days = new Set(chosen.map((sale) => dayKey(sale.postedAt!)))
    const pool = free.filter((sale) => sale.postedAt! < harareDay(last, "00:00") && fits(sale))
    for (let tries = 0; chosen.length < inside && tries < pool.length * 2; tries += 1) {
      const sale = pool[within(0, pool.length - 1)]!
      const day = dayKey(sale.postedAt!)
      if (days.has(day) || used.has(sale.id)) continue
      days.add(day)
      chosen.push(sale)
      used.add(sale.id)
    }
    for (const sale of chosen) give(customerId, sale.id)
    let left = target - chosen.reduce((sum, sale) => sum + Number(sale.baseAmount), 0)
    const before = visits - chosen.length
    // The days before the history: one visit a day, spread over the year.
    const firstDay = dayKey(yearStart)
    const lastBefore = addDays(dayKey(floorStart), -1)
    const span2 = Math.max(1, Math.round((Date.parse(lastBefore) - Date.parse(firstDay)) / DAY_MS))
    const picked = new Set<number>()
    while (picked.size < Math.min(before, span2)) picked.add(within(0, span2 - 1))
    const dates = [...picked].sort((a, b) => a - b).map((offset) => addDays(firstDay, offset))
    dates.forEach((day, index) => {
      // Each at least US$2.00, and enough left for the rest to be too; the last lands the spend.
      const rest = dates.length - index - 1
      const share = (left / (dates.length - index)) * (0.6 + random() * 0.8)
      const amount = rest === 0 ? Math.round(left * 100) / 100 : Math.round(Math.min(Math.max(share, 2), left - rest * 2) * 100) / 100
      left -= amount
      planned.push({ customerId, name: regular.name, at: harareDay(day, `${String(within(9, 18)).padStart(2, "0")}:${String(within(0, 59)).padStart(2, "0")}`), amount })
    })
    exact.push({ customerId, points: regular.points })
  }

  // The members: one sale each in the last 30 days for 412 of them, larger baskets first, then a few older ones.
  const monthAgo = now.getTime() - 30 * DAY_MS
  const bigFirst = (sales: typeof free) => [...sales].sort((a, b) => Number(b.baseAmount) * (0.5 + random()) - Number(a.baseAmount) * (0.5 + random()))
  const recent = bigFirst(free.filter((sale) => !used.has(sale.id) && sale.postedAt!.getTime() >= monthAgo))
  const older = bigFirst(free.filter((sale) => !used.has(sale.id) && sale.postedAt!.getTime() < monthAgo))
  const members = plans.filter((plan) => !regularNames.has(plan.name)).map((plan) => ({ id: ids.get(plan.name)!, spend: 0 }))
  let recentAt = 0
  let olderAt = 0
  members.forEach((member, index) => {
    const active = index < ACTIVE_MEMBERS || keep.has(plans.find((plan) => ids.get(plan.name) === member.id)!.name)
    if (active) {
      while (recentAt < recent.length && used.has(recent[recentAt]!.id)) recentAt += 1
      const sale = recent[recentAt]
      if (sale) {
        give(member.id, sale.id)
        member.spend += Number(sale.baseAmount)
      }
    }
    for (let extra = within(active ? 0 : 1, 8); extra > 0 && olderAt < older.length; extra -= 1) {
      const sale = older[olderAt++]!
      if (member.spend + Number(sale.baseAmount) >= 1_450) break
      give(member.id, sale.id)
      member.spend += Number(sale.baseAmount)
    }
  })
  const nameOf = new Map([...ids].map(([name, id]) => [id, name]))
  for (const [customerId, saleIds] of attach) {
    await prisma.retailSale.updateMany({ where: { id: { in: saleIds } }, data: { customerId, customerName: nameOf.get(customerId) ?? null } })
  }

  // ── The visits before the history, on shifts of their own ──
  await seedCustomerHistory(companyId, planned)

  // ── Points: EARNED on every sale with a customer, the regulars' last row landing the board's balance ──
  const earning = await prisma.retailSale.findMany({
    where: { companyId, customerId: { not: null }, saleType: "SALE", status: "POSTED", baseAmount: { gt: 0 } },
    select: { id: true, customerId: true, baseAmount: true, postedAt: true, cashierName: true },
    orderBy: { postedAt: "asc" },
  })
  const entries: Prisma.RetailPointsEntryCreateManyInput[] = earning.map((sale) => {
    const points = Math.floor(Number(sale.baseAmount))
    return {
      companyId,
      customerId: sale.customerId!,
      kind: "EARNED",
      points,
      value: money(points * 0.01).toDecimalPlaces(2),
      saleId: sale.id,
      actorName: sale.cashierName,
      createdAt: sale.postedAt!,
    }
  })
  for (const { customerId, points } of exact) {
    const own = entries.filter((entry) => entry.customerId === customerId)
    const lastRow = own[own.length - 1]
    if (!lastRow) continue
    const sum = own.reduce((total, entry) => total + entry.points, 0)
    lastRow.points += points - sum
    lastRow.value = money(lastRow.points * 0.01).toDecimalPlaces(2)
  }
  for (let index = 0; index < entries.length; index += 1000) {
    await prisma.retailPointsEntry.createMany({ data: entries.slice(index, index + 1000) })
  }

  const live = await prisma.customer.count({ where: { companyId, archivedAt: null } })
  const shopped = await prisma.retailSale.groupBy({ by: ["customerId"], where: { companyId, customerId: { not: null }, saleType: "SALE", postedAt: { gte: new Date(monthAgo) } } })
  console.log(
    `  customers: ${live} live (the board's 8 regulars, T. Marange, ${members.length} members, ${shopped.length} shopped in 30 days), ` +
      `${planned.length} visits before the history, ${entries.length} sales earning points`,
  )
}

/**
 * The regulars' visits before the floor's history: one closed Front till shift
 * a day with a visit (Chipo Dube Monday to Wednesday, Farai Moyo Thursday to
 * Saturday, Tafara Nyathi on Sunday; a US$100.00 float, counted as expected),
 * ringing only those visits, each a basket off the shelf's own prices and the
 * last of a customer's topped up with airtime to their exact spend. Numbered
 * below the history's lowest SALE number; then every shift is numbered again
 * in the order it opened, the Front till's open shift last.
 */
async function seedCustomerHistory(companyId: string, visits: Array<{ customerId: string; name: string; at: Date; amount: number | null }>) {
  if (visits.length === 0) return
  const random = seededRandom(5301)
  const site = await prisma.site.findFirst({ where: { companyId, code: "HRE" }, select: { id: true } })
  const front = await prisma.retailRegister.findFirst({ where: { companyId, code: "TILL-1" }, select: { id: true, code: true, name: true, siteId: true } })
  const people = await prisma.user.findMany({
    where: { companyId, email: { in: ["chipo.till@bottlestore.test", "farai.till@bottlestore.test", "tafara.manager@bottlestore.test"] } },
    select: { id: true, name: true, email: true },
  })
  const byEmail = (email: string) => people.find((person) => person.email === email)
  if (!site || !front || people.length < 3) {
    console.log("  customer history: no Front till or cashiers, skipped")
    return
  }
  const siteId = front.siteId ?? site.id
  // The shelf as the history rang it: one price per product.
  const shelf = await prisma.$queryRaw<Array<{ productId: string; inventoryItemId: string; itemName: string; unitPrice: Prisma.Decimal; costUnit: Prisma.Decimal }>>`
    SELECT DISTINCT ON (l."productId") l."productId", l."inventoryItemId", l."itemName", l."unitPrice", l."costUnit"
    FROM "RetailSaleLine" l JOIN "RetailSale" s ON s.id = l."saleId"
    WHERE s."companyId" = ${companyId} AND s."siteId" = ${siteId} AND s."saleType" = 'SALE' AND l."productId" IS NOT NULL
      AND l."discountAmount" = 0 AND l."promotionId" IS NULL AND l."bundleId" IS NULL AND l."unitPrice" BETWEEN 0.5 AND 30
    ORDER BY l."productId", s."postedAt" DESC`
  const airtime = await prisma.inventoryItem.findFirst({
    where: { siteId, product: { companyId, code: AIRTIME.code } },
    select: { id: true, productId: true, product: { select: { name: true } } },
  })
  if (shelf.length === 0) return

  const lowest = await prisma.$queryRaw<Array<{ n: number | null }>>`
    SELECT min(substring("saleNo" from 6)::int) AS n FROM "RetailSale" WHERE "companyId" = ${companyId} AND "saleNo" ~ '^SALE-[0-9]+$'`
  let saleNumber = (lowest[0]?.n ?? 100_000) - visits.length

  const shiftRows: Prisma.RetailShiftCreateManyInput[] = []
  const saleRows: Prisma.RetailSaleCreateManyInput[] = []
  const lineRows: Prisma.RetailSaleLineCreateManyInput[] = []
  const paymentRows: Prisma.RetailSalePaymentCreateManyInput[] = []
  const byDay = new Map<string, typeof visits>()
  for (const visit of [...visits].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const day = dayKey(visit.at)
    byDay.set(day, [...(byDay.get(day) ?? []), visit])
  }
  for (const [day, dayVisits] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
    const cashier = weekday >= 1 && weekday <= 3 ? byEmail("chipo.till@bottlestore.test")! : weekday === 0 ? byEmail("tafara.manager@bottlestore.test")! : byEmail("farai.till@bottlestore.test")!
    const shiftId = randomUUID()
    const openedAt = harareDay(day, "07:55")
    const closedAt = harareDay(day, "19:05")
    let cash = money(0)
    for (const visit of dayVisits) {
      const saleId = randomUUID()
      const target = Math.round((visit.amount ?? 10) * 100)
      const lines: Prisma.RetailSaleLineCreateManyInput[] = []
      let cents = 0
      for (let guard = 0; guard < 40; guard += 1) {
        const item = shelf[Math.floor(random() * shelf.length)]!
        const price = Math.round(Number(item.unitPrice) * 100)
        if (cents + price > target) {
          if (target - cents < 50) break
          continue
        }
        const units = Math.max(1, Math.min(Math.floor((target - cents) / price), 1 + Math.floor(random() * 3)))
        cents += units * price
        const gross = money((units * price) / 100)
        const tax = gross.minus(netOfInclusiveTax(gross, VAT_PERCENT))
        lines.push({
          id: randomUUID(),
          companyId,
          saleId,
          inventoryItemId: item.inventoryItemId,
          productId: item.productId,
          itemName: item.itemName,
          quantity: quantity(String(units)),
          unitPrice: money(item.unitPrice),
          discountAmount: money(0),
          taxAmount: tax,
          lineTotal: gross,
          costUnit: money(item.costUnit),
          costTotal: multiplyMoney(quantity(String(units)), money(item.costUnit)),
          depositAmount: money(0),
          createdAt: visit.at,
        })
        if (target - cents < 50) break
      }
      // What the shelf cannot make in whole bottles is airtime, at whatever was typed.
      if (cents < target && airtime?.productId) {
        const gross = money((target - cents) / 100)
        lines.push({
          id: randomUUID(),
          companyId,
          saleId,
          inventoryItemId: airtime.id,
          productId: airtime.productId,
          itemName: airtime.product?.name ?? "Econet airtime",
          quantity: quantity("1"),
          unitPrice: gross,
          discountAmount: money(0),
          taxAmount: gross.minus(netOfInclusiveTax(gross, VAT_PERCENT)),
          lineTotal: gross,
          costUnit: gross,
          costTotal: gross,
          depositAmount: money(0),
          createdAt: visit.at,
        })
        cents = target
      }
      if (lines.length === 0) continue
      const total = sumMoney(lines.map((line) => money(line.lineTotal as Prisma.Decimal)))
      const tax = sumMoney(lines.map((line) => money(line.taxAmount as Prisma.Decimal)))
      const roll = random()
      const tender: RetailTenderType = roll < 0.5 ? "CASH" : roll < 0.78 ? "ECOCASH" : "CARD"
      if (tender === "CASH") cash = cash.plus(total)
      saleRows.push({
        id: saleId,
        companyId,
        saleNo: `SALE-${String(saleNumber++).padStart(5, "0")}`,
        shiftId,
        registerId: front.id,
        siteId,
        cashierId: cashier.id,
        cashierName: cashier.name,
        customerId: visit.customerId,
        customerName: visit.name,
        saleType: "SALE",
        status: "POSTED",
        subtotal: total.minus(tax),
        discountAmount: money(0),
        taxAmount: tax,
        totalAmount: total,
        depositAmount: money(0),
        tenderedAmount: total,
        changeAmount: money(0),
        currency: "USD",
        exchangeRate: rate("1"),
        baseAmount: total,
        postedAt: visit.at,
        createdAt: visit.at,
        updatedAt: visit.at,
      })
      lineRows.push(...lines)
      paymentRows.push({
        id: randomUUID(),
        companyId,
        saleId,
        tenderType: tender,
        amount: total,
        currency: "USD",
        exchangeRate: rate("1"),
        baseAmount: total,
        reference: tender === "ECOCASH" ? `EC${100000 + Math.floor(random() * 900000)}` : null,
        createdAt: visit.at,
      })
    }
    const expected = money("100.00").plus(cash)
    shiftRows.push({
      id: shiftId,
      companyId,
      shiftNo: `SH-H${day}`,
      registerCode: front.code,
      registerName: front.name,
      registerId: front.id,
      siteId,
      cashierId: cashier.id,
      cashierName: cashier.name,
      openingFloat: money("100.00"),
      expectedCash: expected,
      countedCash: expected,
      variance: money(0),
      status: "CLOSED",
      floatLeft: money("100.00"),
      openedAt,
      closedAt,
      createdAt: openedAt,
      updatedAt: closedAt,
    })
  }
  await prisma.retailShift.createMany({ data: shiftRows })
  for (let index = 0; index < saleRows.length; index += 500) await prisma.retailSale.createMany({ data: saleRows.slice(index, index + 500) })
  for (let index = 0; index < lineRows.length; index += 500) await prisma.retailSaleLine.createMany({ data: lineRows.slice(index, index + 500) })
  for (let index = 0; index < paymentRows.length; index += 500) await prisma.retailSalePayment.createMany({ data: paymentRows.slice(index, index + 500) })

  // Every shift numbered again in the order it opened, the Front till's open shift last (FLR-03).
  await prisma.$executeRaw`UPDATE "RetailShift" SET "shiftNo" = 'TMP-' || id WHERE "companyId" = ${companyId}`
  await prisma.$executeRaw`
    UPDATE "RetailShift" s SET "shiftNo" = 'SH-' || lpad(o.n::text, 5, '0')
    FROM (
      SELECT id, row_number() OVER (
        ORDER BY (status = 'OPEN' AND "registerId" = ${front.id}), "openedAt", id
      ) AS n
      FROM "RetailShift" WHERE "companyId" = ${companyId}
    ) o
    WHERE s.id = o.id`
  await prisma.idSequence.deleteMany({ where: { companyId, entityKey: "RETAIL_SHIFT" } })
  console.log(`  customer history: ${saleRows.length} visits on ${shiftRows.length} Front till shifts before the floor's history`)
}

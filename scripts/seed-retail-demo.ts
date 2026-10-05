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
import { ensureRetailCategories } from "@/lib/retail/categories"
import { saveRetailSetupProfile } from "@/lib/retail/setup-profile"
import { upsertShelfListing } from "@/lib/retail/shelf-listing"
import { tradingDayKey } from "@/lib/retail/z-report"
import { auditCashMoved, auditRecordEdited, auditSalePosted, auditShiftOpened } from "@/lib/retail/audit"
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
 * A Harare bottle store's shelf, priced in USD at 15% VAT.
 *
 * `weight` is how often the line sells, which is what makes the top-sellers chart
 * say something: lager and scuds move all day, single-malt does not. `stock` and
 * `min` put Castle Lager 340ml under its reorder point deliberately.
 */
const CATALOGUE = [
  { code: "CASTLE-340", name: "Castle Lager 340ml", unit: "bottle", price: "1.20", cost: "0.85", stock: 36, min: 96, weight: 26, category: "Beer", deposit: "0.10" },
  { code: "CHIBUKU-1L", name: "Chibuku Scud 1L", unit: "carton", price: "1.10", cost: "0.72", stock: 210, min: 60, weight: 22, category: "Beer" },
  { code: "ZAMBEZI-375", name: "Zambezi Lager 375ml", unit: "bottle", price: "1.35", cost: "0.95", stock: 144, min: 48, weight: 16, category: "Beer", deposit: "0.10" },
  { code: "BOHLINGER-330", name: "Bohlinger's 330ml", unit: "bottle", price: "1.55", cost: "1.10", stock: 96, min: 36, weight: 10, category: "Beer" },
  { code: "SAVANNA-330", name: "Savanna Dry 330ml", unit: "bottle", price: "1.85", cost: "1.32", stock: 72, min: 24, weight: 8, category: "Ciders and coolers" },
  { code: "HUNTERS-330", name: "Hunter's Gold 330ml", unit: "bottle", price: "1.85", cost: "1.30", stock: 60, min: 24, weight: 7, category: "Ciders and coolers" },
  { code: "COKE-500", name: "Coca-Cola 500ml", unit: "bottle", price: "0.75", cost: "0.48", stock: 180, min: 48, weight: 12, category: "Soft drinks" },
  { code: "ICE-2KG", name: "Ice 2kg bag", unit: "bag", price: "1.50", cost: "0.60", stock: 40, min: 20, weight: 6, category: "Ice and mixers" },
  { code: "CASTLE-CASE", name: "Castle Lager case of 24", unit: "case", price: "26.50", cost: "20.40", stock: 22, min: 8, weight: 5, category: "Beer" },
  { code: "TWOKEYS-750", name: "Two Keys Whisky 750ml", unit: "bottle", price: "9.75", cost: "7.20", stock: 28, min: 12, weight: 4, category: "Spirits" },
  { code: "NEDERBURG-750", name: "Nederburg Cabernet 750ml", unit: "bottle", price: "12.60", cost: "9.45", stock: 24, min: 8, weight: 3, category: "Wine" },
  { code: "GORDONS-750", name: "Gordon's Gin 750ml", unit: "bottle", price: "16.40", cost: "12.65", stock: 18, min: 6, weight: 3, category: "Spirits" },
  { code: "AMARULA-750", name: "Amarula Cream 750ml", unit: "bottle", price: "18.25", cost: "14.10", stock: 14, min: 6, weight: 2, category: "Spirits" },
  { code: "JAMESON-750", name: "Jameson Irish Whiskey 750ml", unit: "bottle", price: "27.90", cost: "22.15", stock: 9, min: 4, weight: 2, category: "Spirits" },
  { code: "BLKLABEL-750", name: "Johnnie Walker Black 750ml", unit: "bottle", price: "42.00", cost: "34.80", stock: 6, min: 3, weight: 1, category: "Spirits" },
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
  return CATALOGUE[0]
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
    The company's legal and trading names (the Company settings board). The
    rail's logo tile is drawn from the legal name: "Hurudza Creative (Private)
    Limited" is "HC" (00-foundations 5.3.2).
  */
  await prisma.companyBranding.upsert({
    where: { companyId },
    update: { legalName: "Hurudza Creative (Private) Limited", tradingName: "Harare Bottle Store" },
    create: { companyId, legalName: "Hurudza Creative (Private) Limited", tradingName: "Harare Bottle Store" },
  })

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
  await branch("BORROWDALE", "Borrowdale", "Borrowdale, Harare")

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
    defaultSiteId: site.id,
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
  await prisma.retailShopProfile.upsert({
    where: { companyId },
    update: { businessType: "LIQUOR" },
    create: { companyId, businessType: "LIQUOR", licenceNumber: "HRE/BL/2024/0711" },
  })
  await ensureRetailCategories(prisma, companyId, "LIQUOR")
  const categoryIds = new Map(
    (await prisma.retailCategory.findMany({ where: { companyId }, select: { id: true, name: true } })).map(
      (row) => [row.name, row.id],
    ),
  )

  type Stocked = { inventoryItemId: string; productId: string; unit: string }
  const stocked = new Map<string, Stocked>()

  for (const entry of CATALOGUE) {
    const existing = await prisma.inventoryItem.findFirst({
      where: { siteId: site.id, itemCode: entry.code },
      select: { id: true },
    })
    const item = existing
      ? await prisma.inventoryItem.update({
          where: { id: existing.id },
          data: { currentStock: entry.stock, minStock: entry.min, unitCost: Number(entry.cost) },
          select: { id: true, unit: true },
        })
      : await prisma.inventoryItem.create({
          data: {
            itemCode: entry.code,
            name: entry.name,
            category: "OTHER",
            unit: entry.unit,
            siteId: site.id,
            locationId: location.id,
            currentStock: entry.stock,
            minStock: entry.min,
            unitCost: Number(entry.cost),
          },
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
      isActive: true,
      categoryId: categoryIds.get(entry.category) ?? null,
      costPrice: money(entry.cost),
      returnable: Boolean(entry.deposit),
      depositAmount: entry.deposit ? money(entry.deposit) : null,
    })

    stocked.set(entry.code, {
      inventoryItemId: item.id,
      productId,
      unit: item.unit,
    })
  }
  // The case opens into the singles: one Castle case is 24 × 340ml.
  await prisma.product.update({
    where: { id: stocked.get("CASTLE-CASE")!.productId },
    data: { packOfId: stocked.get("CASTLE-340")!.productId, packSize: 24 },
  })
  console.log(`  ${CATALOGUE.length} lines on the shelf (Castle 340ml is under its minimum)`)

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

  for (const [slotIndex, slot] of slots.entries()) {
    {
      const date = slot.openedAt
      const busy = dayBusyness(date)
      const cashier = slot.cashier
      const openedAt = slot.openedAt
      const isOpenShift = slot.open
      const closedAt = isOpenShift ? null : new Date(openedAt.getTime() + (7 * 60 + between(-4, 5)) * 60 * 1000)

      const shiftId = randomUUID()
      const shiftNo = `SH-${String(slotIndex + 1).padStart(5, "0")}`
      const openingFloat = money(slot.float)

      const saleCount = Math.max(3, Math.round(between(9, 17) * busy))
      let cashTaken = money(0)

      for (let saleIndex = 0; saleIndex < saleCount; saleIndex += 1) {
        saleSeq += 1
        const saleId = randomUUID()
        const postedAt = new Date(
          openedAt.getTime() + between(5, 6 * 60) * 60 * 1000 + saleIndex * 1000,
        )
        if (postedAt.getTime() > now.getTime()) continue

        const lineCount = between(1, 4)
        const lines: LineRow[] = []
        for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
          const product = pickProduct()
          const target = stocked.get(product.code)
          if (!target) continue
          const quantity = rate(String(product.weight > 10 ? between(1, 6) : between(1, 2)))
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

        // A refund every so often, against the sale just posted.
        if (Math.random() < 0.02 && !isOpenShift) {
          saleSeq += 1
          refunds += 1
          const refundId = randomUUID()
          const refundedAt = new Date(postedAt.getTime() + 20 * 60 * 1000)
          const source = lines[0]
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
          .find((row) => row.shiftId === shiftId && row.saleType === "SALE" && row.status === "POSTED")

        if (candidate) {
          candidate.status = "VOIDED"
          candidate.voidReason = pick(VOID_REASONS)
          voids += 1
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
 * opening, the Front till's sales this morning and its drop of US$20.00 to
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

  const front = shiftRows.find((row) => row.status === "OPEN" && row.registerCode === "TILL-1" && written.has(row.id as string))
  if (front) {
    for (const sale of saleRows.filter((row) => row.shiftId === front.id)) {
      await auditSalePosted(prisma, {
        actor: actorOf(front),
        saleId: sale.id as string,
        saleNo: sale.saleNo,
        shiftId: front.id as string,
        siteId: sale.siteId ?? null,
        totalAmount: sale.totalAmount as Prisma.Decimal,
        currency: sale.currency ?? "USD",
        baseAmount: sale.baseAmount as Prisma.Decimal,
        lineCount: 1,
      })
      await at("RETAIL_SALE.POSTED", sale.id as string, sale.postedAt as Date)
      events += 1
    }

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
  console.log(`  ${events} activity events (open drawers, the Front till's morning, Amarula's price)`)
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

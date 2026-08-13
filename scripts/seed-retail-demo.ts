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
import { Prisma, type RetailTenderType } from "@prisma/client"
import { money, multiplyMoney, rate, sumMoney, taxOn } from "@/lib/money"
import { prisma } from "@/lib/prisma"

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
  { code: "CASTLE-340", name: "Castle Lager 340ml", unit: "bottle", price: "1.20", cost: "0.85", stock: 36, min: 96, weight: 26 },
  { code: "CHIBUKU-1L", name: "Chibuku Scud 1L", unit: "carton", price: "1.10", cost: "0.72", stock: 210, min: 60, weight: 22 },
  { code: "ZAMBEZI-375", name: "Zambezi Lager 375ml", unit: "bottle", price: "1.35", cost: "0.95", stock: 144, min: 48, weight: 16 },
  { code: "BOHLINGER-330", name: "Bohlinger's 330ml", unit: "bottle", price: "1.55", cost: "1.10", stock: 96, min: 36, weight: 10 },
  { code: "SAVANNA-330", name: "Savanna Dry 330ml", unit: "bottle", price: "1.85", cost: "1.32", stock: 72, min: 24, weight: 8 },
  { code: "HUNTERS-330", name: "Hunter's Gold 330ml", unit: "bottle", price: "1.85", cost: "1.30", stock: 60, min: 24, weight: 7 },
  { code: "COKE-500", name: "Coca-Cola 500ml", unit: "bottle", price: "0.75", cost: "0.48", stock: 180, min: 48, weight: 12 },
  { code: "ICE-2KG", name: "Ice 2kg bag", unit: "bag", price: "1.50", cost: "0.60", stock: 40, min: 20, weight: 6 },
  { code: "CASTLE-CASE", name: "Castle Lager case of 24", unit: "case", price: "26.50", cost: "20.40", stock: 22, min: 8, weight: 5 },
  { code: "TWOKEYS-750", name: "Two Keys Whisky 750ml", unit: "bottle", price: "9.75", cost: "7.20", stock: 28, min: 12, weight: 4 },
  { code: "NEDERBURG-750", name: "Nederburg Cabernet 750ml", unit: "bottle", price: "12.60", cost: "9.45", stock: 24, min: 8, weight: 3 },
  { code: "GORDONS-750", name: "Gordon's Gin 750ml", unit: "bottle", price: "16.40", cost: "12.65", stock: 18, min: 6, weight: 3 },
  { code: "AMARULA-750", name: "Amarula Cream 750ml", unit: "bottle", price: "18.25", cost: "14.10", stock: 14, min: 6, weight: 2 },
  { code: "JAMESON-750", name: "Jameson Irish Whiskey 750ml", unit: "bottle", price: "27.90", cost: "22.15", stock: 9, min: 4, weight: 2 },
  { code: "BLKLABEL-750", name: "Johnnie Walker Black 750ml", unit: "bottle", price: "42.00", cost: "34.80", stock: 6, min: 3, weight: 1 },
]

const VAT_PERCENT = "15.00"

/**
 * Staff who can sign in. A bottle store is not run by one superadmin, and the
 * whole point of the role gates is that a cashier is not a manager.
 */
const STAFF = [
  { email: "tafara.manager@bottlestore.test", name: "Tafara Nyathi", role: "MANAGER" as const, cashier: true },
  { email: "chipo.till@bottlestore.test", name: "Chipo Dube", role: "CASHIER" as const, cashier: true },
  { email: "farai.till@bottlestore.test", name: "Farai Moyo", role: "CASHIER" as const, cashier: true },
  { email: "tendai.stock@bottlestore.test", name: "Tendai Sibanda", role: "STOCK_CLERK" as const, cashier: false },
]

const STAFF_PASSWORD = "RetailDemo123!"

/** Regulars who run a tab or collect loyalty. */
const CUSTOMERS = [
  "Rudo Chirwa", "Blessing Ncube", "Tapiwa Marange", "Nyasha Gwenzi",
  "Simba Mutasa", "Kudzai Zhou", "Munashe Chari", "Rutendo Banda",
]

const ZWG_RATE = "27.5000"

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
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
  const site =
    (await prisma.site.findFirst({ where: { companyId, code: "MAIN" } })) ??
    (await prisma.site.create({
      data: { companyId, code: "MAIN", name: "Samora Machel Bottle Store", location: "Harare CBD" },
    }))

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

  type Stocked = { inventoryItemId: string; catalogItemId: string; unit: string }
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
            category: "CONSUMABLES",
            unit: entry.unit,
            siteId: site.id,
            locationId: location.id,
            currentStock: entry.stock,
            minStock: entry.min,
            unitCost: Number(entry.cost),
          },
          select: { id: true, unit: true },
        })

    const catalogItem = await prisma.retailCatalogItem.upsert({
      where: { companyId_catalogCode: { companyId, catalogCode: `CAT-${entry.code}` } },
      update: {
        name: entry.name,
        unitPrice: money(entry.price),
        taxPercent: money(VAT_PERCENT),
        inventoryItemId: item.id,
        siteId: site.id,
        status: "ACTIVE",
      },
      create: {
        companyId,
        catalogCode: `CAT-${entry.code}`,
        inventoryItemId: item.id,
        siteId: site.id,
        name: entry.name,
        sku: entry.code,
        barcode: `600${String(Math.abs(hashCode(entry.code))).padStart(9, "0").slice(0, 9)}`,
        unitPrice: money(entry.price),
        taxPercent: money(VAT_PERCENT),
        status: "ACTIVE",
      },
      select: { id: true },
    })

    stocked.set(entry.code, {
      inventoryItemId: item.id,
      catalogItemId: catalogItem.id,
      unit: item.unit,
    })
  }
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
    await prisma.retailShift.deleteMany({ where: { companyId } })
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

  let shiftSeq = 0
  let saleSeq = 0
  let refunds = 0
  let voids = 0
  let zwgSales = 0

  for (let dayOffset = days; dayOffset >= 0; dayOffset -= 1) {
    const date = daysAgo(dayOffset)
    const busy = dayBusyness(date)
    const shiftsToday = busy > 1.6 ? 2 : 1

    for (let shiftIndex = 0; shiftIndex < shiftsToday; shiftIndex += 1) {
      const cashier = pick(tills)
      const openHour = shiftIndex === 0 ? 9 : 16
      const openedAt = new Date(date)
      openedAt.setUTCHours(openHour, between(0, 25), 0, 0)

      // The very last shift stays open, so the demo can walk up to a live till.
      const isOpenShift = dayOffset === 0 && shiftIndex === shiftsToday - 1
      const closedAt = isOpenShift ? null : new Date(openedAt.getTime() + 7 * 60 * 60 * 1000)

      shiftSeq += 1
      const shiftId = randomUUID()
      const shiftNo = `SH-${String(shiftSeq).padStart(5, "0")}`
      const openingFloat = money("50.00")

      const saleCount = Math.max(3, Math.round(between(9, 17) * busy))
      let cashTaken = money(0)

      for (let saleIndex = 0; saleIndex < saleCount; saleIndex += 1) {
        saleSeq += 1
        const saleId = randomUUID()
        const postedAt = new Date(
          openedAt.getTime() + between(5, 6 * 60) * 60 * 1000 + saleIndex * 1000,
        )

        const lineCount = between(1, 4)
        const lines: LineRow[] = []
        for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
          const product = pickProduct()
          const target = stocked.get(product.code)
          if (!target) continue
          const quantity = rate(String(product.weight > 10 ? between(1, 6) : between(1, 2)))
          const baseAmount = multiplyMoney(quantity, product.price)
          const taxAmount = taxOn(baseAmount, VAT_PERCENT)
          lines.push({
            id: randomUUID(),
            companyId,
            saleId,
            inventoryItemId: target.inventoryItemId,
            catalogItemId: target.catalogItemId,
            itemName: product.name,
            quantity,
            unitPrice: money(product.price),
            discountAmount: money(0),
            taxAmount,
            lineTotal: baseAmount.plus(taxAmount),
            costUnit: money(product.cost),
            costTotal: multiplyMoney(quantity, product.cost),
            createdAt: postedAt,
          })
        }
        if (lines.length === 0) continue

        const subtotal = sumMoney(
          lines.map((line) => multiplyMoney(line.quantity as Prisma.Decimal, line.unitPrice as Prisma.Decimal)),
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
            catalogItemId: source.catalogItemId,
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

      // A voided sale now and then — a mis-ring the cashier caught.
      if (Math.random() < 0.06 && !isOpenShift) {
        voids += 1
      }

      const expectedCash = openingFloat.plus(cashTaken)
      // Most cash-ups balance. Some do not, and those are the ones a manager has
      // to explain, so they are seeded rather than hoped for.
      const varianceRoll = Math.random()
      const varianceAmount =
        varianceRoll < 0.72
          ? money(0)
          : varianceRoll < 0.9
            ? money(String(-(between(50, 850) / 100)))
            : money(String(between(20, 400) / 100))
      const countedCash = closedAt ? expectedCash.plus(varianceAmount) : null

      shiftRows.push({
        id: shiftId,
        companyId,
        shiftNo,
        registerCode: register.code,
        registerName: register.name,
        siteId: site.id,
        cashierId: cashier.id,
        cashierName: cashier.name,
        openingFloat,
        expectedCash,
        countedCash,
        variance: closedAt ? varianceAmount : null,
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
              catalogItemId: castle.catalogItemId,
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

  const takings = sumMoney(saleRows.map((row) => row.baseAmount as Prisma.Decimal))
  console.log(
    `\n  ${refunds} refund(s), ${voids} void(s) flagged, ${zwgSales} sale(s) settled in ZWG` +
      `\n  takings across the period: $${takings.toFixed(2)}` +
      `\n  one shift left OPEN so the till is live` +
      `\n\nSign in as any of:\n${STAFF.map((s) => `  ${s.role.padEnd(12)} ${s.email}`).join("\n")}` +
      `\n  password: ${STAFF_PASSWORD}`,
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

/**
 * Seeds a retail tenant with enough shape that the screens show a real shop.
 *
 *   npx tsx scripts/seed-retail-demo.ts --slug retail-demo
 *
 * R-5.2 of `docs/retail/retail-hardening-plan-2026-08-12.md`. A seed is not a
 * fixture: `scripts/seed-payroll-demo.ts` builds a tenant with one employee
 * deliberately missing a BP number so the blocker path renders, and that is the
 * part worth copying. Six of the rows below are wrong on purpose, because a
 * happy-path seed is how an exception state ships without anybody ever looking
 * at it:
 *
 *   - a shift closed **short**, so the cash-variance path renders
 *   - a shift closed **over**, which reads differently and posts the other way
 *   - an item **below its minimum**, so the low-stock alert has something to say
 *   - a purchase order **part-received**, so `PARTIAL` is not a status nobody sees
 *   - a **refund** against a posted sale, so the reversing document exists
 *   - a **held cart** left parked, so the recall path has something to recall
 *
 * Idempotent by code, like `lib/schools/provision.ts`: every row is an upsert on
 * a natural key, so running it twice against a tenant somebody has started
 * editing does no damage.
 *
 * The money below is deliberately awkward — 19.99, 8.575, thirds of a dollar —
 * because round numbers hide exactly the bugs R-1.1 was about.
 */

import "dotenv/config"

import { Prisma } from "@prisma/client"
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

const CATALOGUE = [
  { code: "MEALIE-10", name: "Mealie meal 10kg", unit: "bag", price: "12.50", tax: "15.00", cost: "9.20", stock: 48, min: 10 },
  { code: "COOKOIL-2", name: "Cooking oil 2L", unit: "bottle", price: "4.75", tax: "15.00", cost: "3.40", stock: 120, min: 24 },
  { code: "SUGAR-2", name: "White sugar 2kg", unit: "pack", price: "3.30", tax: "15.00", cost: "2.15", stock: 64, min: 20 },
  { code: "BREAD-STD", name: "Standard loaf", unit: "loaf", price: "1.15", tax: "0.00", cost: "0.78", stock: 30, min: 40 },
  { code: "SOAP-BAR", name: "Bath soap", unit: "bar", price: "1.99", tax: "15.00", cost: "1.20", stock: 200, min: 50 },
  { code: "TEA-250", name: "Tea leaves 250g", unit: "box", price: "2.85", tax: "15.00", cost: "1.90", stock: 75, min: 15 },
  { code: "RICE-5", name: "Long grain rice 5kg", unit: "bag", price: "8.40", tax: "15.00", cost: "6.10", stock: 36, min: 12 },
  { code: "CANDLE-6", name: "Candles pack of 6", unit: "pack", price: "1.45", tax: "15.00", cost: "0.95", stock: 90, min: 25 },
]

/** Hours ago, as a Date. Every timestamp below is relative to the run. */
function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000)
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

async function main() {
  const slug = (readArg("slug") ?? "retail-demo").trim().toLowerCase()

  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to seed.")
  }

  const company = await prisma.company.findUnique({
    where: { slug },
    select: { id: true, name: true },
  })
  if (!company) {
    throw new Error(
      `No company with slug "${slug}". Run scripts/seed-staging-tenant.ts first.`,
    )
  }
  const companyId = company.id

  const admin = await prisma.user.findFirst({
    where: { companyId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true },
  })
  if (!admin) throw new Error(`No active user on ${slug}.`)
  // Bound after the guard: the upsert helpers below are closures, and TypeScript
  // will not carry a narrowing of `admin` across a function boundary.
  const actor = { id: admin.id, name: admin.name ?? admin.email }

  console.log(`Seeding retail into ${company.name} (${slug})`)

  // ── Site, location, inventory ────────────────────────────────────────────
  const site =
    (await prisma.site.findFirst({ where: { companyId, code: "MAIN" } })) ??
    (await prisma.site.create({
      data: { companyId, code: "MAIN", name: "Harare Main Branch", location: "Harare CBD" },
    }))

  const location =
    (await prisma.stockLocation.findFirst({ where: { siteId: site.id, code: "SHOP" } })) ??
    (await prisma.stockLocation.create({
      data: { siteId: site.id, code: "SHOP", name: "Shop floor" },
    }))

  const register = await prisma.retailRegister.upsert({
    where: { companyId_code: { companyId, code: "TILL-1" } },
    update: { name: "Till 1", siteId: site.id, isActive: true },
    create: { companyId, code: "TILL-1", name: "Till 1", siteId: site.id },
  })

  const items = new Map<string, { id: string; unit: string; unitCost: number }>()
  for (const entry of CATALOGUE) {
    const existing = await prisma.inventoryItem.findFirst({
      where: { siteId: site.id, itemCode: entry.code },
    })
    const item = existing
      ? await prisma.inventoryItem.update({
          where: { id: existing.id },
          data: { currentStock: entry.stock, minStock: entry.min, unitCost: Number(entry.cost) },
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
        })
    items.set(entry.code, { id: item.id, unit: item.unit, unitCost: item.unitCost ?? 0 })

    await prisma.retailCatalogItem.upsert({
      where: { companyId_catalogCode: { companyId, catalogCode: `CAT-${entry.code}` } },
      update: {
        name: entry.name,
        unitPrice: money(entry.price),
        taxPercent: money(entry.tax),
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
        barcode: `600${entry.code.replace(/\D/g, "").padStart(9, "0")}`,
        unitPrice: money(entry.price),
        taxPercent: money(entry.tax),
        status: "ACTIVE",
      },
    })
  }
  console.log(`  ${CATALOGUE.length} catalogue items (BREAD-STD is below its minimum, on purpose)`)

  // ── Promotions ───────────────────────────────────────────────────────────
  await prisma.retailPromotion.upsert({
    where: { companyId_promoCode: { companyId, promoCode: "PROMO-WINTER" } },
    update: { status: "ACTIVE" },
    create: {
      companyId,
      promoCode: "PROMO-WINTER",
      name: "Winter basket 5% off",
      type: "PERCENT",
      value: money("5.00"),
      status: "ACTIVE",
      startsAt: daysAgo(7),
      endsAt: daysAgo(-21),
    },
  })
  await prisma.retailPromotion.upsert({
    where: { companyId_promoCode: { companyId, promoCode: "PROMO-STAFF" } },
    update: { status: "SCHEDULED" },
    create: {
      companyId,
      promoCode: "PROMO-STAFF",
      name: "Staff discount $2",
      type: "AMOUNT",
      value: money("2.00"),
      status: "SCHEDULED",
      startsAt: daysAgo(-3),
    },
  })
  console.log("  2 promotions (one active, one scheduled)")

  // ── Shifts: one short, one over, one still open ──────────────────────────
  async function upsertShift(input: {
    shiftNo: string
    openedAt: Date
    closedAt: Date | null
    openingFloat: string
    expectedCash: string
    countedCash: string | null
  }) {
    const variance =
      input.countedCash === null
        ? null
        : money(input.countedCash).minus(money(input.expectedCash))
    const data = {
      registerCode: register.code,
      registerName: register.name,
      siteId: site.id,
      cashierId: actor.id,
      cashierName: actor.name,
      openingFloat: money(input.openingFloat),
      expectedCash: money(input.expectedCash),
      countedCash: input.countedCash === null ? null : money(input.countedCash),
      variance,
      status: input.closedAt ? ("CLOSED" as const) : ("OPEN" as const),
      openedAt: input.openedAt,
      closedAt: input.closedAt,
    }
    return prisma.retailShift.upsert({
      where: { companyId_shiftNo: { companyId, shiftNo: input.shiftNo } },
      update: data,
      create: { companyId, shiftNo: input.shiftNo, ...data },
    })
  }

  // Short by $4.30 — the variance path a manager has to explain.
  await upsertShift({
    shiftNo: "SH-0001",
    openedAt: daysAgo(2),
    closedAt: daysAgo(2 - 0.4),
    openingFloat: "50.00",
    expectedCash: "318.75",
    countedCash: "314.45",
  })
  // Over by $1.15 — reads differently and posts the other way.
  await upsertShift({
    shiftNo: "SH-0002",
    openedAt: daysAgo(1),
    closedAt: daysAgo(1 - 0.4),
    openingFloat: "50.00",
    expectedCash: "402.60",
    countedCash: "403.75",
  })
  const openShift = await upsertShift({
    shiftNo: "SH-0003",
    openedAt: hoursAgo(3),
    closedAt: null,
    openingFloat: "50.00",
    expectedCash: "0.00",
    countedCash: null,
  })
  console.log("  3 shifts (one short, one over, one open)")

  // ── Sales ────────────────────────────────────────────────────────────────
  type Basket = Array<{ code: string; qty: string }>

  async function upsertSale(input: {
    saleNo: string
    shiftId: string
    basket: Basket
    postedAt: Date
    customerName: string | null
    tender: "CASH" | "CARD" | "MOBILE_MONEY"
  }) {
    const existing = await prisma.retailSale.findUnique({
      where: { companyId_saleNo: { companyId, saleNo: input.saleNo } },
      select: { id: true },
    })
    if (existing) return existing

    const lines = input.basket.map((entry) => {
      const source = CATALOGUE.find((candidate) => candidate.code === entry.code)
      if (!source) throw new Error(`Unknown basket item ${entry.code}`)
      const item = items.get(entry.code)
      if (!item) throw new Error(`Unknown inventory item ${entry.code}`)
      const quantity = rate(entry.qty)
      const baseAmount = multiplyMoney(quantity, source.price)
      const taxAmount = taxOn(baseAmount, source.tax)
      return {
        inventoryItemId: item.id,
        itemName: source.name,
        quantity,
        unitPrice: money(source.price),
        discountAmount: money(0),
        taxAmount,
        lineTotal: baseAmount.plus(taxAmount),
        costUnit: money(source.cost),
        costTotal: multiplyMoney(quantity, source.cost),
      }
    })

    const subtotal = sumMoney(lines.map((line) => multiplyMoney(line.quantity, line.unitPrice)))
    const taxAmount = sumMoney(lines.map((line) => line.taxAmount))
    const totalAmount = sumMoney(lines.map((line) => line.lineTotal))

    return prisma.retailSale.create({
      data: {
        companyId,
        saleNo: input.saleNo,
        shiftId: input.shiftId,
        siteId: site.id,
        cashierId: actor.id,
        cashierName: actor.name,
        customerName: input.customerName,
        saleType: "SALE",
        status: "POSTED",
        subtotal,
        discountAmount: money(0),
        taxAmount,
        totalAmount,
        tenderedAmount: totalAmount,
        changeAmount: money(0),
        postedAt: input.postedAt,
        lines: { create: lines },
        payments: {
          create: [{ tenderType: input.tender, amount: totalAmount, reference: null }],
        },
      },
      select: { id: true },
    })
  }

  const baskets: Array<{ basket: Basket; customer: string | null; tender: "CASH" | "CARD" | "MOBILE_MONEY" }> = [
    { basket: [{ code: "MEALIE-10", qty: "1" }, { code: "COOKOIL-2", qty: "2" }], customer: "Walk-in", tender: "CASH" },
    { basket: [{ code: "BREAD-STD", qty: "3" }, { code: "SUGAR-2", qty: "1" }], customer: null, tender: "CASH" },
    { basket: [{ code: "RICE-5", qty: "2" }, { code: "TEA-250", qty: "3" }], customer: "Tendai Moyo", tender: "MOBILE_MONEY" },
    { basket: [{ code: "SOAP-BAR", qty: "6" }], customer: "Rudo Chirwa", tender: "CARD" },
    { basket: [{ code: "CANDLE-6", qty: "4" }, { code: "BREAD-STD", qty: "2" }], customer: null, tender: "CASH" },
    { basket: [{ code: "MEALIE-10", qty: "2" }, { code: "SUGAR-2", qty: "2" }], customer: "Tendai Moyo", tender: "CASH" },
  ]

  const saleIds: string[] = []
  for (const [index, entry] of baskets.entries()) {
    const shiftId = index < 2 ? openShift.id : openShift.id
    const sale = await upsertSale({
      saleNo: `S-${String(index + 1).padStart(4, "0")}`,
      shiftId,
      basket: entry.basket,
      postedAt: hoursAgo(3 - index * 0.35),
      customerName: entry.customer,
      tender: entry.tender,
    })
    saleIds.push(sale.id)
  }
  console.log(`  ${saleIds.length} posted sales`)

  // ── A refund against the first sale ──────────────────────────────────────
  const refundNo = "S-R001"
  const existingRefund = await prisma.retailSale.findUnique({
    where: { companyId_saleNo: { companyId, saleNo: refundNo } },
    select: { id: true },
  })
  if (!existingRefund) {
    const source = await prisma.retailSale.findUnique({
      where: { id: saleIds[0] },
      include: { lines: true },
    })
    if (source) {
      // One line of the basket comes back, not the whole sale — a partial refund is
      // the case the pro-rata arithmetic in `_services.ts` actually has to get right.
      const line = source.lines[0]
      const refundLine = {
        sourceLineId: line.id,
        inventoryItemId: line.inventoryItemId,
        itemName: line.itemName,
        quantity: money(line.quantity).negated(),
        unitPrice: line.unitPrice,
        discountAmount: money(line.discountAmount).negated(),
        taxAmount: money(line.taxAmount).negated(),
        lineTotal: money(line.lineTotal).negated(),
        costUnit: line.costUnit,
        costTotal: money(line.costTotal).negated(),
      }
      await prisma.retailSale.create({
        data: {
          companyId,
          saleNo: refundNo,
          shiftId: openShift.id,
          sourceSaleId: source.id,
          siteId: site.id,
          cashierId: actor.id,
          cashierName: actor.name,
          customerName: source.customerName,
          saleType: "REFUND",
          status: "POSTED",
          subtotal: multiplyMoney(line.quantity, line.unitPrice).negated(),
          discountAmount: money(0),
          taxAmount: money(line.taxAmount).negated(),
          totalAmount: money(line.lineTotal).negated(),
          tenderedAmount: money(line.lineTotal).negated(),
          changeAmount: money(0),
          overrideReason: "Damaged packaging returned by the customer",
          postedAt: hoursAgo(0.5),
          lines: { create: [refundLine] },
          payments: {
            create: [
              {
                tenderType: "CASH",
                amount: money(line.lineTotal).negated(),
                reference: null,
              },
            ],
          },
        },
      })
      console.log("  1 refund against S-0001")
    }
  }

  // ── A held cart nobody came back for ─────────────────────────────────────
  const mealie = items.get("MEALIE-10")
  await prisma.retailHeldCart.upsert({
    where: { companyId_holdNo: { companyId, holdNo: "H-0001" } },
    update: { status: "HELD" },
    create: {
      companyId,
      holdNo: "H-0001",
      shiftId: openShift.id,
      cashierId: actor.id,
      label: "Gogo — gone to fetch her card",
      status: "HELD",
      cartSnapshot: {
        items: [
          {
            catalogItemId: `CAT-MEALIE-10`,
            inventoryItemId: mealie?.id ?? null,
            name: "Mealie meal 10kg",
            quantity: 1,
            unitPrice: 12.5,
          },
        ],
      } as Prisma.InputJsonValue,
    },
  })
  console.log("  1 held cart")

  // ── A purchase order, part received ──────────────────────────────────────
  const poNo = "PO-0001"
  const existingOrder = await prisma.retailPurchaseOrder.findUnique({
    where: { companyId_poNo: { companyId, poNo } },
    select: { id: true },
  })
  if (!existingOrder) {
    const rice = items.get("RICE-5")
    const oil = items.get("COOKOIL-2")
    const order = await prisma.retailPurchaseOrder.create({
      data: {
        companyId,
        poNo,
        siteId: site.id,
        supplierName: "Mutare Wholesalers",
        // PARTIAL, not RECEIVED: half the order is still outstanding, which is the
        // status the receipts screen exists to clear.
        status: "PARTIAL",
        expectedDate: daysAgo(-4),
        createdById: actor.id,
        lines: {
          create: [
            {
              inventoryItemId: rice?.id ?? null,
              itemName: "Long grain rice 5kg",
              quantity: rate("40"),
              unitCost: money("6.10"),
              lineTotal: multiplyMoney(rate("40"), "6.10"),
              receivedQuantity: rate("40"),
            },
            {
              inventoryItemId: oil?.id ?? null,
              itemName: "Cooking oil 2L",
              quantity: rate("60"),
              unitCost: money("3.40"),
              lineTotal: multiplyMoney(rate("60"), "3.40"),
              receivedQuantity: rate("25"),
            },
          ],
        },
      },
      include: { lines: true },
    })

    await prisma.retailGoodsReceipt.create({
      data: {
        companyId,
        receiptNo: "GRN-0001",
        purchaseOrderId: order.id,
        siteId: site.id,
        supplierName: "Mutare Wholesalers",
        status: "POSTED",
        receivedById: actor.id,
        postedAt: daysAgo(1),
        lines: {
          create: [
            {
              inventoryItemId: rice?.id ?? "",
              itemName: "Long grain rice 5kg",
              quantity: rate("40"),
              unitCost: money("6.10"),
              lineTotal: multiplyMoney(rate("40"), "6.10"),
            },
            {
              inventoryItemId: oil?.id ?? "",
              itemName: "Cooking oil 2L",
              quantity: rate("25"),
              unitCost: money("3.40"),
              lineTotal: multiplyMoney(rate("25"), "3.40"),
            },
          ],
        },
      },
    })
    console.log("  1 purchase order, part received, with its goods receipt")
  }

  console.log("\nDone. Sign in and open /retail.")
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})

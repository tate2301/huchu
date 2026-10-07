/**
 * SET-11. Writes `public/demo/price-list-oct.xlsx`, the spreadsheet the Import
 * board (`Import.png`) is checked against, from the seeded shop:
 *
 *   npx tsx scripts/make-import-demo.ts --slug hurudza-creative
 *
 * 214 rows under a header: 196 new products, 12 that update products the shop
 * already sells (six by barcode under the supplier's own name for them, six by
 * name with no barcode), and the six the board flags, at their rows:
 *
 *   14 Savanna Dry 330ml — Category "Ciders" is new
 *   31 Hunters Gold — no price
 *   58 Coca Cola 2l — looks like Coca-Cola 2l (the seed adds that product)
 *   77 Nederburg Cabernet — price "12,60"
 *  102 Ice 5kg bag — Category "Ice" is new
 *  166 Mazoe Orange 2l — barcode 600169 is too short
 *
 * New rows carry cost, some a supplier (Delta, Afdis), some opening stock, and
 * two are cases of a single the shop sells.
 */
import "dotenv/config"
import { mkdirSync } from "node:fs"
import { join } from "node:path"

import ExcelJS from "exceljs"

import { prisma } from "@/lib/prisma"
import { IMPORT_COLUMNS } from "@/lib/retail/import/words"

type Row = { name: string; price: string | number | null; category: string | null; barcode: string | null; cost?: number | null; supplier?: string | null; pack?: number | null; opening?: number | null }

const FLAGGED: Record<number, Row> = {
  14: { name: "Savanna Dry 330ml", price: 2.1, category: "Ciders", barcode: "6001496000140", cost: 1.38 },
  31: { name: "Hunters Gold", price: null, category: "Ciders and coolers", barcode: "6001495000317" },
  58: { name: "Coca Cola 2l", price: 2.5, category: "Soft drinks", barcode: "5449000000439", cost: 1.6 },
  77: { name: "Nederburg Cabernet", price: "12,60", category: "Wine", barcode: "6001452000774", cost: 9.4 },
  102: { name: "Ice 5kg bag", price: 3, category: "Ice", barcode: null, cost: 2.1 },
  166: { name: "Mazoe Orange 2l", price: 4.2, category: "Soft drinks", barcode: "600169" },
}

/** The products the file updates: by barcode under another name, or by their own name. */
const BY_BARCODE: Array<[name: string, typed: string]> = [
  ["Amarula Cream 750ml", "Amarula Cream Liqueur 750ml"],
  ["Castle Lager 340ml", "Castle Lager 340ml NRB"],
  ["Fanta Orange 500ml", "Fanta Orange PET 500ml"],
  ["Gordon’s Gin 750ml", "Gordons London Dry Gin 750ml"],
  ["Jameson Irish Whiskey 750ml", "Jameson Whiskey 750ml"],
  ["Schweppes Tonic 200ml", "Schweppes Indian Tonic 200ml can"],
]
const BY_NAME = ["Bernini Blush 275ml", "Bohlinger’s 330ml", "Chibuku Scud 1L", "Charcoal 4kg", "Two Keys Whisky 750ml", "Coca-Cola 500ml"]
const UPDATE_ROWS = [9, 22, 40, 51, 66, 88, 115, 129, 140, 152, 178, 199]

/** New products: brand × size per category, with a price per size. */
const RANGES: Array<{ category: string; supplier: string | null; brands: string[]; sizes: Array<[size: string, price: number]> }> = [
  {
    category: "Beer",
    supplier: "Delta Beverages",
    brands: ["Black Label", "Lion Lager", "Golden Pilsener", "Eagle Lager", "Hansa Pilsener", "Windhoek Lager", "Heineken", "Corona Extra", "Stella Artois", "Amstel", "Peroni", "Budweiser", "Carling Blue", "Castle Lite", "Castle Milk Stout", "Miller Genuine Draft"],
    sizes: [["330ml", 1.3], ["440ml can", 1.5], ["500ml", 1.6], ["750ml", 2.2]],
  },
  {
    category: "Ciders and coolers",
    supplier: "Delta Beverages",
    brands: ["Savanna Light", "Hunter’s Dry", "Bernini Classic", "Brutal Fruit Ruby", "Flying Fish Lemon", "Redd’s Original", "Smirnoff Spin", "Esprit Passion"],
    sizes: [["275ml", 1.6], ["330ml", 1.85], ["440ml can", 2.1]],
  },
  {
    category: "Wine",
    supplier: "Afdis Distillers",
    brands: ["Four Cousins Sweet Red", "Robertson Chapel Red", "Drostdy-Hof Merlot", "Nederburg Baronne", "KWV Classic Pinotage", "Cellar Cask Johannisberger", "Two Oceans Sauvignon Blanc", "Leopard’s Leap Shiraz"],
    sizes: [["750ml", 8.5], ["1.5l", 14.9], ["3l box", 24.5]],
  },
  {
    category: "Spirits",
    supplier: "Afdis Distillers",
    brands: ["Smirnoff Vodka", "Mainstay Cane", "Captain Morgan Spiced", "Bell’s Whisky", "Klipdrift Brandy", "Richelieu Brandy", "Viceroy Brandy", "Olmeca Tequila", "Jack Daniel’s", "Southern Comfort", "Absolut Vodka", "Hennessy VS"],
    sizes: [["200ml", 4.8], ["375ml", 8.6], ["750ml", 15.9], ["1l", 19.5]],
  },
  {
    category: "Soft drinks",
    supplier: "Delta Beverages",
    brands: ["Sprite", "Fanta Grape", "Pepsi", "Mirinda Orange", "Schweppes Lemonade", "Mazoe Raspberry", "Minute Maid Apple", "Bonaqua Still Water"],
    sizes: [["330ml can", 0.8], ["1l", 1.4], ["2l", 2.3]],
  },
  {
    category: "Snacks",
    supplier: null,
    brands: ["Willards Chips Salt and Vinegar", "Simba Chips Chutney", "Lay’s Chips Cheese"],
    sizes: [["30g", 0.5], ["125g", 1.6]],
  },
  {
    category: "Ice and mixers",
    supplier: "Schweppes Zimbabwe",
    brands: ["Schweppes Soda Water", "Schweppes Ginger Ale", "Schweppes Bitter Lemon"],
    sizes: [["200ml", 0.6], ["1l", 1.5]],
  },
]

const round = (value: number) => Math.round(value * 100) / 100

function newRows(): Row[] {
  const rows: Row[] = [
    { name: "Castle Lager 340ml case of 24", price: 27.5, category: "Beer", barcode: "6009100000017", cost: 20.1, supplier: "Delta Beverages", pack: 24 },
    { name: "Black Label 330ml case of 24", price: 29.9, category: "Beer", barcode: "6009100000024", cost: 21.6, supplier: "Delta Beverages", pack: 24 },
  ]
  let n = 3
  for (const range of RANGES) {
    for (const brand of range.brands) {
      for (const [size, price] of range.sizes) {
        const i = n++
        rows.push({
          name: `${brand} ${size}`,
          price: round(price + (i % 5) * 0.05),
          category: range.category,
          // Every seventh row comes without a barcode, as price lists do.
          barcode: i % 7 === 0 ? null : `6009${String(i).padStart(9, "0")}`,
          cost: round((price + (i % 5) * 0.05) * 0.72),
          supplier: range.supplier && i % 3 === 0 ? range.supplier : null,
          opening: i % 4 === 0 ? [12, 24, 48][i % 3] : null,
        })
      }
    }
  }
  return rows.slice(0, 196)
}

function argument(name: string): string | null {
  const at = process.argv.indexOf(`--${name}`)
  return at >= 0 ? (process.argv[at + 1] ?? null) : null
}

async function main() {
  const slug = argument("slug") ?? "hurudza-creative"
  const company = await prisma.company.findFirstOrThrow({ where: { slug }, select: { id: true, name: true } })
  const products = await prisma.product.findMany({
    where: { companyId: company.id, archivedAt: null, name: { in: [...BY_BARCODE.map(([name]) => name), ...BY_NAME] } },
    select: { name: true, barcode: true, standardPrice: true, costPrice: true },
  })
  const byName = new Map(products.map((product) => [product.name, product]))
  const nudge = (name: string) => {
    const product = byName.get(name)
    if (!product?.standardPrice) throw new Error(`${name} is not on sale in ${company.name}. Seed the shop first.`)
    // Up about 5%, to the next 5 cents.
    return Math.ceil(product.standardPrice.toNumber() * 1.05 * 20) / 20
  }
  const updates: Row[] = [
    ...BY_BARCODE.map(([name, typed]) => {
      const barcode = byName.get(name)?.barcode
      if (!barcode) throw new Error(`${name} has no barcode in ${company.name}.`)
      return { name: typed, price: nudge(name), category: null, barcode }
    }),
    ...BY_NAME.map((name) => ({ name, price: nudge(name), category: null, barcode: null })),
  ]

  const fresh = newRows()
  if (fresh.length !== 196) throw new Error(`Only ${fresh.length} new rows; add brands.`)
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Price list October")
  sheet.addRow([...IMPORT_COLUMNS])
  sheet.getRow(1).font = { bold: true }
  for (let rowNo = 2; rowNo <= 215; rowNo += 1) {
    const row = FLAGGED[rowNo] ?? (UPDATE_ROWS.includes(rowNo) ? updates.shift()! : fresh.shift()!)
    sheet.addRow([row.name, row.price, row.category, row.barcode, row.cost ?? null, row.supplier ?? null, row.pack ?? null, row.opening ?? null])
  }
  sheet.getColumn(2).numFmt = "0.00"
  sheet.getColumn(5).numFmt = "0.00"
  sheet.getColumn(1).width = 34
  sheet.getColumn(3).width = 20
  sheet.getColumn(4).width = 16
  sheet.getColumn(6).width = 20

  const dir = join(process.cwd(), "public", "demo")
  mkdirSync(dir, { recursive: true })
  await workbook.xlsx.writeFile(join(dir, "price-list-oct.xlsx"))
  console.log(`public/demo/price-list-oct.xlsx: 214 rows against ${company.name} (196 new, 12 updates, 6 to fix)`)
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

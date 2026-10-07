import { Prisma, type RetailTenderType } from "@prisma/client";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

/**
 * Test setup only: a shop with two sites, two tills, two cashiers, two
 * customers and two products, and sales written straight to the tables
 * (no till, no stock, no journal), so the floor's reads can be checked
 * against figures chosen by hand.
 */

export type SalesShop = TestShop & {
  frontTill: string;
  backTill: string;
  chipo: string;
  farai: string;
  tapiwa: string;
  tinashe: string;
  johnnie: { productId: string; itemId: string };
  ice: { productId: string; itemId: string };
};

export async function makeSalesShop(label: string): Promise<SalesShop> {
  const shop = await makeTestShop(label, { twoSites: true });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const till = async (code: string, name: string, siteId: string) =>
    (await prisma.retailRegister.create({ data: { companyId: shop.companyId, code: `${code}-${stamp}`, name, siteId }, select: { id: true } })).id;
  const cashier = async (name: string, email: string) =>
    (
      await prisma.user.create({
        data: { email: `${email}-${stamp}@shop.test`, name, role: "CASHIER", companyId: shop.companyId },
        select: { id: true },
      })
    ).id;
  const customer = async (name: string, phone: string | null) =>
    (await prisma.customer.create({ data: { companyId: shop.companyId, name, phone }, select: { id: true } })).id;
  return {
    ...shop,
    frontTill: await till("FRONT", "Front till", shop.mainId),
    backTill: await till("BACK", "Back till", shop.secondId!),
    chipo: await cashier("Chipo Dube", "chipo"),
    farai: await cashier("Farai Moyo", "farai"),
    tapiwa: await customer("Tapiwa Marange", "+263774123388"),
    tinashe: await customer("Tinashe Mavhunga", null),
    johnnie: await addTestProduct(shop.companyId, { name: "Johnnie Walker Black 750ml", price: "42.00", cost: "31.00" }, { onHand: 20 }),
    ice: await addTestProduct(shop.companyId, { name: "Ice 2kg bag", price: "2.20", cost: "1.10" }, { onHand: 50 }),
  };
}

export type TestLine = { item: { productId: string; itemId: string }; name: string; quantity: number; price: string; cost: string; tax?: string; deposit?: string; sourceLineId?: string };

/** One sale document as the till would leave it, at a chosen time; amounts in US dollars. */
export async function addTestSale(
  shop: SalesShop,
  sale: {
    saleNo: string;
    at: Date;
    till?: "front" | "back";
    cashierId?: string;
    customerId?: string | null;
    customerName?: string | null;
    saleType?: "SALE" | "REFUND" | "VOID";
    status?: "POSTED" | "VOIDED";
    sourceSaleId?: string;
    lines: TestLine[];
    payments?: Array<{ tender: RetailTenderType; amount: string; currency?: string; reference?: string }>;
    deposit?: string;
    change?: string;
    reviewReason?: string;
    shiftId?: string;
  },
): Promise<{ id: string; lineIds: string[] }> {
  const total = sale.lines.reduce((sum, line) => sum.plus(new Prisma.Decimal(line.price).times(line.quantity)), new Prisma.Decimal(0));
  const tax = sale.lines.reduce((sum, line) => sum.plus(line.tax ?? "0"), new Prisma.Decimal(0));
  const back = sale.till === "back";
  const created = await prisma.retailSale.create({
    data: {
      companyId: shop.companyId,
      saleNo: sale.saleNo,
      siteId: back ? shop.secondId! : shop.mainId,
      registerId: back ? shop.backTill : shop.frontTill,
      cashierId: sale.cashierId ?? shop.chipo,
      cashierName: null,
      customerId: sale.customerId ?? null,
      customerName: sale.customerName ?? null,
      saleType: sale.saleType ?? "SALE",
      status: sale.status ?? "POSTED",
      sourceSaleId: sale.sourceSaleId ?? null,
      shiftId: sale.shiftId ?? null,
      subtotal: total,
      taxAmount: tax,
      totalAmount: total,
      baseAmount: total,
      depositAmount: new Prisma.Decimal(sale.deposit ?? "0"),
      changeAmount: sale.change ? new Prisma.Decimal(sale.change) : null,
      reviewReason: sale.reviewReason ?? null,
      postedAt: sale.at,
      lines: {
        create: sale.lines.map((line) => ({
          companyId: shop.companyId,
          inventoryItemId: line.item.itemId,
          productId: line.item.productId,
          itemName: line.name,
          quantity: new Prisma.Decimal(line.quantity),
          unitPrice: new Prisma.Decimal(line.price),
          taxAmount: new Prisma.Decimal(line.tax ?? "0"),
          lineTotal: new Prisma.Decimal(line.price).times(line.quantity),
          costUnit: new Prisma.Decimal(line.cost),
          costTotal: new Prisma.Decimal(line.cost).times(Math.abs(line.quantity)),
          depositAmount: new Prisma.Decimal(line.deposit ?? "0"),
          sourceLineId: line.sourceLineId ?? null,
        })),
      },
      payments: {
        create: (sale.payments ?? [{ tender: "CASH" as const, amount: total.toFixed(2) }]).map((payment) => ({
          companyId: shop.companyId,
          tenderType: payment.tender,
          amount: new Prisma.Decimal(payment.amount),
          baseAmount: new Prisma.Decimal(payment.amount),
          currency: payment.currency ?? "USD",
          reference: payment.reference ?? null,
        })),
      },
    },
    select: { id: true, lines: { select: { id: true }, orderBy: { createdAt: "asc" } } },
  });
  return { id: created.id, lineIds: created.lines.map((line) => line.id) };
}

/** The shop and everything written to it: sales first, since their lines hold the stock lines. */
export async function destroySalesShop(shop: SalesShop | undefined) {
  if (!shop) return;
  await prisma.retailMessage.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.retailSale.updateMany({ where: { companyId: shop.companyId }, data: { sourceSaleId: null } });
  await prisma.retailSale.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
}

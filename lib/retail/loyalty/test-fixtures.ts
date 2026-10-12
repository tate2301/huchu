import { prisma } from "@/lib/prisma";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

/**
 * Test setup only (CUS-01): a shop with a customer, sales to hang points on,
 * and ledger rows written directly, dated as the test needs.
 */

export async function loyaltyShop(label: string): Promise<TestShop & { customerId: string }> {
  const shop = await makeTestShop(label);
  const customerId = (await prisma.customer.create({ data: { companyId: shop.companyId, name: "Tapiwa Marange" }, select: { id: true } })).id;
  return { ...shop, customerId };
}

let saleCount = 0;

export async function testSale(
  shop: { companyId: string; mainId: string },
  input: { total: string; customerId?: string | null; saleType?: "SALE" | "REFUND" | "VOID"; sourceSaleId?: string; postedAt?: Date },
): Promise<string> {
  saleCount += 1;
  const sale = await prisma.retailSale.create({
    data: {
      companyId: shop.companyId,
      saleNo: `T-${Date.now()}-${saleCount}`,
      siteId: shop.mainId,
      customerId: input.customerId ?? null,
      saleType: input.saleType ?? "SALE",
      sourceSaleId: input.sourceSaleId ?? null,
      totalAmount: input.total,
      baseAmount: input.total,
      postedAt: input.postedAt ?? new Date(),
    },
    select: { id: true },
  });
  return sale.id;
}

export async function ledgerRow(
  shop: { companyId: string },
  input: { customerId: string; kind: "EARNED" | "SPENT" | "EXPIRED" | "BIRTHDAY" | "REVERSED"; points: number; at?: Date; saleId?: string; value?: string },
) {
  await prisma.retailPointsEntry.create({
    data: {
      companyId: shop.companyId,
      customerId: input.customerId,
      kind: input.kind,
      points: input.points,
      value: input.value ?? "0",
      saleId: input.saleId ?? null,
      createdAt: input.at ?? new Date(),
    },
  });
}

export async function dropLoyaltyShops(companyIds: string[]) {
  for (const companyId of companyIds) {
    await prisma.retailPointsEntry.deleteMany({ where: { companyId } });
    await prisma.retailSale.deleteMany({ where: { companyId, sourceSaleId: { not: null } } });
    await prisma.retailSale.deleteMany({ where: { companyId } });
    await prisma.retailLoyaltySettings.deleteMany({ where: { companyId } });
    await destroyProvisionedTenant(companyId);
  }
}

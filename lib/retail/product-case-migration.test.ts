/**
 * Migration witness for `20261003180000_product_case_of_singles`.
 *
 * A case names its single and how many it holds. The database refuses a case
 * of one bottle and a case of itself, and a case outlives its single being
 * deleted by forgetting it rather than taking the case with it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;

beforeAll(async () => {
  companyId = (
    await prisma.company.create({ data: { name: `Case witness ${stamp}`, slug: `case-witness-${stamp}` }, select: { id: true } })
  ).id;
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.product.updateMany({ where: { companyId }, data: { packOfId: null } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("Product.packOfId and packSize, as stored", () => {
  it("refuses a case of one, and a case of itself", async () => {
    const single = await prisma.product.create({ data: { companyId, code: `S-${stamp}`, name: "Single" } });
    await expect(
      prisma.product.create({ data: { companyId, code: `ONE-${stamp}`, name: "Case of one", packOfId: single.id, packSize: 1 } }),
    ).rejects.toThrow(/Product_packSize_more_than_one/);
    await expect(
      prisma.$executeRaw`UPDATE "Product" SET "packOfId" = "id", "packSize" = 6 WHERE "id" = ${single.id}`,
    ).rejects.toThrow(/Product_pack_not_itself/);
  });

  it("keeps the case when its single is deleted, forgetting the single", async () => {
    const single = await prisma.product.create({ data: { companyId, code: `GONE-${stamp}`, name: "Going" } });
    const pack = await prisma.product.create({
      data: { companyId, code: `CASE-${stamp}`, name: "Case", packOfId: single.id, packSize: 24 },
    });
    await prisma.product.delete({ where: { id: single.id } });
    const kept = await prisma.product.findUniqueOrThrow({ where: { id: pack.id } });
    expect(kept.packOfId).toBeNull();
  });
});

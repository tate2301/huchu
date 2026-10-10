/**
 * Retail sale numbering (FLR-01): sales are `SALE-#####`, refunds `RFD-####`
 * and voids `VOID-####`, each one line of numbers for the whole company
 * whichever site rang them, and each continuing from the highest number the
 * company already has under its own prefix.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let mainId: string;
let borrowdaleId: string;

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Numbers ${stamp}`, slug: `numbers-${stamp}` }, select: { id: true } })).id;
  mainId = (await prisma.site.create({ data: { companyId, code: `H-${stamp}`, name: "Harare Main Branch" }, select: { id: true } })).id;
  borrowdaleId = (await prisma.site.create({ data: { companyId, code: `B-${stamp}`, name: "Borrowdale" }, select: { id: true } })).id;
  // History: the old per-site numbers stay as they are; the new prefixes start past their own highest.
  await prisma.retailSale.createMany({
    data: [
      { companyId, siteId: mainId, saleNo: "RSL-0042" },
      { companyId, siteId: mainId, saleNo: "SALE-31870" },
      { companyId, siteId: borrowdaleId, saleNo: "SALE-00012" },
      { companyId, siteId: borrowdaleId, saleNo: "RFD-0044", saleType: "REFUND" },
    ],
  });
});

afterAll(async () => {
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await prisma.idSequence.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
}, 60_000);

describe("retail sale numbers", () => {
  it("number sales once for the company, across sites, from the highest SALE number", async () => {
    expect(await reserveIdentifier(prisma, { companyId, entity: "RETAIL_SALE", siteId: borrowdaleId })).toBe("SALE-31871");
    expect(await reserveIdentifier(prisma, { companyId, entity: "RETAIL_SALE", siteId: mainId })).toBe("SALE-31872");
    expect(await reserveIdentifier(prisma, { companyId, entity: "RETAIL_SALE" })).toBe("SALE-31873");
  });

  it("number refunds and voids on their own lines, four digits", async () => {
    expect(await reserveIdentifier(prisma, { companyId, entity: "RETAIL_REFUND" })).toBe("RFD-0045");
    expect(await reserveIdentifier(prisma, { companyId, entity: "RETAIL_REFUND", siteId: mainId })).toBe("RFD-0046");
    expect(await reserveIdentifier(prisma, { companyId, entity: "RETAIL_VOID", siteId: borrowdaleId })).toBe("VOID-0001");
    expect(await reserveIdentifier(prisma, { companyId, entity: "RETAIL_VOID", siteId: mainId })).toBe("VOID-0002");
  });

  it("never renumber what is already there", async () => {
    const kept = await prisma.retailSale.findMany({ where: { companyId }, select: { saleNo: true }, orderBy: { saleNo: "asc" } });
    expect(kept.map((sale) => sale.saleNo)).toEqual(["RFD-0044", "RSL-0042", "SALE-00012", "SALE-31870"]);
  });
});

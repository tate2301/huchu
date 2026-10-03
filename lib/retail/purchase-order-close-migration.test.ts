/**
 * Migration witness for `20261003190000_retail_purchase_order_close`.
 *
 * An order can be closed short, and the database insists a closed order says
 * when and an open one does not. A delivered line remembers the order line it
 * filled, and forgets it — rather than vanishing — if that order line goes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let siteId: string;

beforeAll(async () => {
  companyId = (
    await prisma.company.create({ data: { name: `PO witness ${stamp}`, slug: `po-witness-${stamp}` }, select: { id: true } })
  ).id;
  siteId = (await prisma.site.create({ data: { companyId, code: `W-${stamp}`, name: "Borrowdale" }, select: { id: true } })).id;
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.retailPurchaseOrder.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("closing a purchase order, as stored", () => {
  it("has CLOSED among the order's states", async () => {
    const labels = await prisma.$queryRaw<Array<{ label: string }>>`
      SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'RetailPurchaseOrderStatus' ORDER BY e.enumsortorder`;
    expect(labels.map((row) => row.label)).toEqual(["DRAFT", "PARTIAL", "RECEIVED", "CLOSED"]);
  });

  it("refuses a closed order with no date, and an open one with a date", async () => {
    await expect(
      prisma.retailPurchaseOrder.create({ data: { companyId, siteId, poNo: `C1-${stamp}`, supplierName: "Delta", status: "CLOSED" } }),
    ).rejects.toThrow(/RetailPurchaseOrder_closed_when/);
    await expect(
      prisma.retailPurchaseOrder.create({
        data: { companyId, siteId, poNo: `C2-${stamp}`, supplierName: "Delta", status: "PARTIAL", closedAt: new Date() },
      }),
    ).rejects.toThrow(/RetailPurchaseOrder_closed_when/);
    const closed = await prisma.retailPurchaseOrder.create({
      data: { companyId, siteId, poNo: `C3-${stamp}`, supplierName: "Delta", status: "CLOSED", closedAt: new Date() },
    });
    expect(closed.status).toBe("CLOSED");
  });

  it("lets a delivered line forget an order line that is deleted", async () => {
    const [fk] = await prisma.$queryRaw<Array<{ delete_rule: string }>>`
      SELECT rc.delete_rule FROM information_schema.referential_constraints rc
      WHERE rc.constraint_name = 'RetailGoodsReceiptLine_purchaseOrderLineId_fkey'`;
    expect(fk.delete_rule).toBe("SET NULL");
  });
});

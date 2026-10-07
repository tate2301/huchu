import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.fn();
const findLines = vi.fn();
const groupSold = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    retailShift: { count: (...args: unknown[]) => count(...args) },
    inventoryItem: { findMany: (...args: unknown[]) => findLines(...args) },
    stockMovement: { groupBy: (...args: unknown[]) => groupSold(...args) },
  },
}));

import { computeNavBadges, NAV_BADGE_PROVIDERS, type NavBadgeProvider } from "./index";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";

import { SHIFTS_NAV_BADGE } from "./floor";
import { ON_HAND_NAV_BADGE } from "./stock";

const ctx = { companyId: "co-1", userId: "user-1", role: "SUPERADMIN" };

describe("computeNavBadges", () => {
  it("keys each figure by its nav href and leaves zero counts out", async () => {
    const providers: NavBadgeProvider[] = [
      { href: "/a", requires: [["retail.sell", "view"]], count: async () => 2, label: (n) => `${n} open` },
      { href: "/b", requires: [["retail.sell", "view"]], count: async () => 0, label: (n) => `${n} on` },
    ];
    await expect(computeNavBadges(ctx, providers)).resolves.toEqual({ "/a": "2 open" });
  });

  it("registers the Shifts and On hand providers", () => {
    expect(NAV_BADGE_PROVIDERS.map((provider) => provider.href)).toEqual(expect.arrayContaining(["/retail/shifts", "/retail/stock"]));
  });
});

describe("the Shifts badge", () => {
  beforeEach(() => count.mockReset());

  it("counts every open shift for whoever cashes up", async () => {
    count.mockResolvedValue(2);
    await expect(computeNavBadges(ctx, [SHIFTS_NAV_BADGE])).resolves.toEqual({ "/retail/shifts": "2 open" });
    expect(count).toHaveBeenCalledWith({ where: { companyId: "co-1", status: "OPEN" } });
  });

  it("counts only a cashier's own open shift", async () => {
    count.mockResolvedValue(1);
    await computeNavBadges({ ...ctx, role: "CASHIER" }, [SHIFTS_NAV_BADGE]);
    expect(count).toHaveBeenCalledWith({ where: { companyId: "co-1", status: "OPEN", cashierId: "user-1" } });
  });

  it("is offered to the till and to cash control, not to the stock clerk", () => {
    const sees = (role: string) =>
      SHIFTS_NAV_BADGE.requires.some(([resource, action]) => canRetailRoleDo(role, resource, action));
    expect(["SUPERADMIN", "MANAGER", "CASHIER"].every(sees)).toBe(true);
    expect(sees("STOCK_CLERK")).toBe(false);
  });
});

describe("the On hand badge", () => {
  /** A stock line as `loadOnHand` reads it. */
  const line = (id: string, onHand: number, reorderAt: number | null, isActive = true) => ({
    id,
    unit: "bottle",
    currentStock: new Prisma.Decimal(onHand),
    minStock: reorderAt === null ? null : new Prisma.Decimal(reorderAt),
    unitCost: new Prisma.Decimal("1.00"),
    site: { id: "site-1", name: "Harare Main Branch" },
    location: { id: "place-1", name: "Shop floor" },
    product: { id: `product-${id}`, name: id, code: id.toUpperCase(), barcode: null, isActive, categoryId: null },
  });

  it("counts the lines running low or out: \"5 low\"", async () => {
    findLines.mockResolvedValue([
      line("jager", 0, 6), // Out
      line("johnnie", 6, 12), // at its reorder level
      line("jameson", 9, 12),
      line("amarula", 13, 12), // above it, but 6 days of cover
      line("castle", 26, 96),
      line("gordons", 18, 6), // Fine
      line("bols", 6, 6, false), // archived: never Low
    ]);
    groupSold.mockResolvedValue([
      { itemId: "johnnie", _sum: { change: new Prisma.Decimal(-60) } },
      { itemId: "jameson", _sum: { change: new Prisma.Decimal(-90) } },
      { itemId: "amarula", _sum: { change: new Prisma.Decimal(-63) } },
      { itemId: "castle", _sum: { change: new Prisma.Decimal(-90) } },
      { itemId: "gordons", _sum: { change: new Prisma.Decimal(-68) } },
    ]);
    await expect(computeNavBadges(ctx, [ON_HAND_NAV_BADGE])).resolves.toEqual({ "/retail/stock": "5 low" });
  });

  it("is offered to whoever may view stock, not to the till", () => {
    const sees = (role: string) => ON_HAND_NAV_BADGE.requires.some(([resource, action]) => canRetailRoleDo(role, resource, action));
    expect(["SUPERADMIN", "MANAGER", "STOCK_CLERK", "FINANCE_OFFICER"].every(sees)).toBe(true);
    expect(sees("CASHIER")).toBe(false);
  });
});

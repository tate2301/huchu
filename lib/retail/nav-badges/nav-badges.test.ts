import { beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { retailShift: { count: (...args: unknown[]) => count(...args) } } }));

import { computeNavBadges, NAV_BADGE_PROVIDERS, type NavBadgeProvider } from "./index";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";

import { SHIFTS_NAV_BADGE } from "./floor";

const ctx = { companyId: "co-1", userId: "user-1", role: "SUPERADMIN" };

describe("computeNavBadges", () => {
  it("keys each figure by its nav href and leaves zero counts out", async () => {
    const providers: NavBadgeProvider[] = [
      { href: "/a", requires: [["retail.sell", "view"]], count: async () => 2, label: (n) => `${n} open` },
      { href: "/b", requires: [["retail.sell", "view"]], count: async () => 0, label: (n) => `${n} on` },
    ];
    await expect(computeNavBadges(ctx, providers)).resolves.toEqual({ "/a": "2 open" });
  });

  it("registers the Shifts provider", () => {
    expect(NAV_BADGE_PROVIDERS.map((provider) => provider.href)).toContain("/retail/shifts");
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

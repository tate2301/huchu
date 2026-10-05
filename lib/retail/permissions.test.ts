/**
 * Who may do what in retail: the grant table behind the Roles board.
 *
 * `roles-matrix.test.ts` holds every letter on the board. This file holds what
 * the board cannot draw: actions under its letters (`view-cost`, `refund`,
 * `receive`, `view-own`), the three resources without a row (`retail.stock`,
 * `retail.money`, `retail.reports`), the session form, and the refusals.
 */

import { describe, it, expect } from "vitest";

import { ROLES } from "@/lib/roles";

import {
  canRetailRoleDo,
  canRetailSessionDo,
  canSeeRetailCostPrice,
  retailPermissionDenial,
  retailRoleKey,
  RETAIL_ACTIONS,
  RETAIL_RESOURCES,
  RETAIL_ROLE_KEYS,
  type RetailAction,
  type RetailResource,
} from "./permissions";

const session = (role: string | null | undefined, supportSessionId?: string | null) => ({
  user: { role, supportSessionId },
});

const EVERY_ROLE = [...ROLES, "CORELITH_SUPPORT", "POS_CASHIER", "NOT_A_ROLE", "", " ", "cashier "] as const;

describe("the owner", () => {
  it("holds every resource, but the activity, insights and money pages read only", () => {
    for (const resource of RETAIL_RESOURCES) expect(canRetailRoleDo("SUPERADMIN", resource, "view")).toBe(true);
    expect(canRetailRoleDo("SUPERADMIN", "retail.activity", "update")).toBe(false);
    expect(canRetailRoleDo("SUPERADMIN", "retail.money", "view")).toBe(true);
  });

  it("does not create or delete the company, and ends the day without deleting it", () => {
    expect(canRetailRoleDo("SUPERADMIN", "retail.company", "update")).toBe(true);
    expect(canRetailRoleDo("SUPERADMIN", "retail.company", "create")).toBe(false);
    expect(canRetailRoleDo("SUPERADMIN", "retail.company", "delete")).toBe(false);
    expect(canRetailRoleDo("SUPERADMIN", "retail.end-of-day", "delete")).toBe(false);
  });

  it("restores from and deletes for good in the bin", () => {
    expect(canRetailRoleDo("SUPERADMIN", "retail.bin", "update")).toBe(true);
    expect(canRetailRoleDo("SUPERADMIN", "retail.bin", "delete")).toBe(true);
  });
});

describe.each(["MANAGER", "SHOP_MANAGER"])("the manager (%s)", (role) => {
  it("runs the shop", () => {
    expect(canRetailRoleDo(role, "retail.tills", "create")).toBe(true);
    expect(canRetailRoleDo(role, "retail.till-rules", "update")).toBe(true);
    expect(canRetailRoleDo(role, "retail.sell", "refund")).toBe(true);
    expect(canRetailRoleDo(role, "retail.sell", "approve")).toBe(true);
    expect(canRetailRoleDo(role, "retail.cash-control", "close-shift")).toBe(true);
    expect(canRetailRoleDo(role, "retail.catalog", "view-cost")).toBe(true);
    expect(canRetailRoleDo(role, "retail.requisitions", "approve")).toBe(true);
    expect(canRetailRoleDo(role, "retail.reports", "view")).toBe(true);
  });

  it("does not keep the books, the plan or the money page", () => {
    for (const resource of ["retail.posting", "retail.billing", "retail.money"] as const) {
      for (const action of RETAIL_ACTIONS) expect(canRetailRoleDo(role, resource, action)).toBe(false);
    }
    expect(retailPermissionDenial(session(role), "retail.money", "view")).toBe("Your role cannot view the money page");
  });

  it("changes the ZiG rate but not the payment settings, and reads the company", () => {
    expect(canRetailRoleDo(role, "retail.zig-rate", "update")).toBe(true);
    expect(canRetailRoleDo(role, "retail.payments", "update")).toBe(false);
    expect(retailPermissionDenial(session(role), "retail.company", "update")).toBe(
      "Your role cannot change company settings",
    );
  });

  it("restores from the bin but does not delete for good, and does not approve prices", () => {
    expect(canRetailRoleDo(role, "retail.bin", "update")).toBe(true);
    expect(canRetailRoleDo(role, "retail.bin", "delete")).toBe(false);
    expect(canRetailRoleDo(role, "retail.prices", "approve")).toBe(false);
    expect(canRetailRoleDo(role, "retail.people", "delete")).toBe(false);
  });
});

describe("the cashier", () => {
  it("sells, refunds and voids within the till rules, and runs their own drawer", () => {
    for (const action of ["view", "create", "refund", "void", "open-shift", "close-shift"] as const) {
      expect(canRetailRoleDo("CASHIER", "retail.sell", action)).toBe(true);
    }
    // Approving a reversal without a manager is not theirs: the till rules ask one.
    expect(canRetailRoleDo("CASHIER", "retail.sell", "approve")).toBe(false);
    expect(canRetailRoleDo("CASHIER", "retail.sell", "update")).toBe(false);
  });

  it("reads the shelf price but never the cost", () => {
    expect(canRetailRoleDo("CASHIER", "retail.catalog", "view")).toBe(true);
    expect(canSeeRetailCostPrice("CASHIER")).toBe(false);
    expect(canRetailRoleDo("CASHIER", "retail.catalog", "update")).toBe(false);
  });

  it("adds customers and lay-bys, takes empties back and asks for money", () => {
    expect(canRetailRoleDo("CASHIER", "retail.customers", "create")).toBe(true);
    expect(canRetailRoleDo("CASHIER", "retail.laybys", "update")).toBe(true);
    expect(canRetailRoleDo("CASHIER", "retail.empties", "create")).toBe(true);
    expect(canRetailRoleDo("CASHIER", "retail.requisitions", "create")).toBe(true);
    expect(canRetailRoleDo("CASHIER", "retail.requisitions", "view-own")).toBe(true);
    expect(canRetailRoleDo("CASHIER", "retail.requisitions", "view")).toBe(false);
  });

  it("reaches none of the back office", () => {
    const backOffice: RetailResource[] = [
      "retail.purchasing",
      "retail.cash-control",
      "retail.reports",
      "retail.insights",
      "retail.stock",
      "retail.counts",
      "retail.company",
      "retail.till-rules",
      "retail.people",
      "retail.bin",
    ];
    for (const resource of backOffice) {
      for (const action of RETAIL_ACTIONS) expect(canRetailRoleDo("CASHIER", resource, action)).toBe(false);
    }
  });
});

describe("the stock clerk", () => {
  it("counts, transfers and receives, and books breakage in", () => {
    for (const action of ["view", "create", "update"] as const) {
      expect(canRetailRoleDo("STOCK_CLERK", "retail.counts", action)).toBe(true);
      expect(canRetailRoleDo("STOCK_CLERK", "retail.transfers", action)).toBe(true);
    }
    expect(canRetailRoleDo("STOCK_CLERK", "retail.adjustments", "create")).toBe(true);
    expect(canRetailRoleDo("STOCK_CLERK", "retail.purchasing", "receive")).toBe(true);
    expect(canRetailRoleDo("STOCK_CLERK", "retail.stock", "view")).toBe(true);
  });

  it("does not order, approve a count, or change the on-hand figures directly", () => {
    expect(canRetailRoleDo("STOCK_CLERK", "retail.purchasing", "create")).toBe(false);
    expect(canRetailRoleDo("STOCK_CLERK", "retail.counts", "approve")).toBe(false);
    expect(canRetailRoleDo("STOCK_CLERK", "retail.adjustments", "view")).toBe(false);
    expect(canRetailRoleDo("STOCK_CLERK", "retail.stock", "update")).toBe(false);
  });

  it("cannot sell, cash up or read reports", () => {
    for (const resource of ["retail.sell", "retail.cash-control", "retail.reports", "retail.customers"] as const) {
      for (const action of RETAIL_ACTIONS) expect(canRetailRoleDo("STOCK_CLERK", resource, action)).toBe(false);
    }
    expect(canSeeRetailCostPrice("STOCK_CLERK")).toBe(false);
  });
});

describe("the bookkeeper (FINANCE_OFFICER)", () => {
  it("reads sales, shifts, reports, insights and money, and sees cost", () => {
    expect(canRetailRoleDo("FINANCE_OFFICER", "retail.sell", "view")).toBe(true);
    expect(canRetailRoleDo("FINANCE_OFFICER", "retail.cash-control", "view")).toBe(true);
    expect(canRetailRoleDo("FINANCE_OFFICER", "retail.reports", "view")).toBe(true);
    expect(canRetailRoleDo("FINANCE_OFFICER", "retail.money", "view")).toBe(true);
    expect(canSeeRetailCostPrice("FINANCE_OFFICER")).toBe(true);
  });

  it("keeps the books and the bills", () => {
    expect(canRetailRoleDo("FINANCE_OFFICER", "retail.posting", "update")).toBe(true);
    expect(canRetailRoleDo("FINANCE_OFFICER", "retail.bills", "delete")).toBe(true);
    expect(canRetailRoleDo("FINANCE_OFFICER", "retail.accounts", "update")).toBe(true);
  });

  it("never touches the till", () => {
    expect(retailPermissionDenial(session("FINANCE_OFFICER"), "retail.sell", "open-shift")).toBe(
      "Your role cannot open a till shift in sales",
    );
    expect(canRetailRoleDo("FINANCE_OFFICER", "retail.sell", "create")).toBe(false);
    expect(canRetailRoleDo("FINANCE_OFFICER", "retail.tills", "view")).toBe(false);
  });
});

describe("Corelith support", () => {
  it("is measured as CORELITH_SUPPORT only while a support session is on", () => {
    expect(retailRoleKey(session("SUPERADMIN"))).toBe("SUPERADMIN");
    expect(retailRoleKey(session("SUPERADMIN", "support-1"))).toBe("CORELITH_SUPPORT");
    expect(canRetailSessionDo(session("CASHIER", "support-1"), "retail.company", "delete")).toBe(true);
    expect(canRetailSessionDo(session("CASHIER"), "retail.company", "delete")).toBe(false);
  });

  it("reads activity, insights and money but changes none of them", () => {
    const support = session("SUPERADMIN", "support-1");
    for (const resource of ["retail.activity", "retail.insights", "retail.money"] as const) {
      expect(canRetailSessionDo(support, resource, "view")).toBe(true);
      expect(retailPermissionDenial(support, resource, "delete")).toMatch(/^Your role cannot delete /);
    }
  });
});

describe("default deny", () => {
  it.each(ROLES.filter((role) => !(RETAIL_ROLE_KEYS as readonly string[]).includes(role)))(
    "gives a %s nothing in retail",
    (role) => {
      for (const resource of RETAIL_RESOURCES) {
        for (const action of RETAIL_ACTIONS) expect(canRetailRoleDo(role, resource, action)).toBe(false);
      }
    },
  );

  it("denies an absent, empty or unrecognised role everything", () => {
    for (const role of [null, undefined, "", "   ", "NOT_A_ROLE", "POS_CASHIER", "ADMIN", "constructor"]) {
      for (const resource of RETAIL_RESOURCES) {
        for (const action of RETAIL_ACTIONS) expect(canRetailRoleDo(role, resource, action)).toBe(false);
      }
    }
  });

  it("normalises case and whitespace", () => {
    expect(canRetailRoleDo("  cashier ", "retail.sell", "create")).toBe(true);
    expect(canRetailRoleDo("Cashier", "retail.reports", "view")).toBe(false);
  });

  it("refuses an unknown resource or action rather than failing open", () => {
    expect(canRetailRoleDo("SUPERADMIN", "retail.setup" as RetailResource, "view")).toBe(false);
    expect(canRetailRoleDo("SUPERADMIN", "retail.sell", "obliterate" as RetailAction)).toBe(false);
  });

  it("gives view-own to nobody who already reads every row", () => {
    for (const role of RETAIL_ROLE_KEYS) {
      for (const resource of RETAIL_RESOURCES) {
        if (canRetailRoleDo(role, resource, "view")) expect(canRetailRoleDo(role, resource, "view-own")).toBe(false);
      }
    }
  });
});

describe("the matrix itself", () => {
  it("grants somebody every action it defines", () => {
    for (const action of RETAIL_ACTIONS) {
      const holders = RETAIL_ROLE_KEYS.flatMap((role) =>
        RETAIL_RESOURCES.filter((resource) => canRetailRoleDo(role, resource, action)),
      );
      expect(holders.length, `no role holds ${action}`).toBeGreaterThan(0);
    }
  });

  it("refuses with a whole sentence for every role × resource × action", () => {
    for (const role of EVERY_ROLE) {
      for (const resource of RETAIL_RESOURCES) {
        for (const action of RETAIL_ACTIONS) {
          const denial = retailPermissionDenial(session(role), resource, action);
          if (canRetailRoleDo(role, resource, action)) {
            expect(denial).toBeNull();
          } else {
            expect(denial).toMatch(/^Your role cannot \S.*\S$/);
            expect(denial).not.toContain("undefined");
          }
        }
      }
    }
  });

  it("refuses in the words of the board's labels", () => {
    expect(retailPermissionDenial(session("CASHIER"), "retail.catalog", "view-cost")).toBe(
      "Your role cannot see cost price on products",
    );
    expect(retailPermissionDenial(session("STOCK_CLERK"), "retail.purchasing", "create")).toBe(
      "Your role cannot create orders and deliveries",
    );
    expect(retailPermissionDenial(session("MANAGER"), "retail.bin", "delete")).toBe("Your role cannot delete the bin");
    expect(retailPermissionDenial(session("STOCK_CLERK"), "retail.requisitions", "view-own")).toBeNull();
    expect(retailPermissionDenial(session("STOCK_CLERK"), "retail.requisitions", "view")).toBe(
      "Your role cannot view requisitions",
    );
  });
});

/**
 * Who may do what in retail.
 *
 * These are cheap assertions about a lookup table, and they earn their place
 * because the table is a policy decision somebody will one day change casually —
 * most likely by adding a role to a set to unblock a support ticket.
 *
 * The ones that matter are the negatives. A bottle store is being run for a full
 * trading day by its own staff, and the failure this table exists to prevent is
 * not an outage: it is a cashier who can read what the shop paid for a case of
 * Castle, pull the day's margin, or sign off their own cash-up.
 */

import { describe, it, expect } from "vitest";

import { ROLES } from "@/lib/roles";

import {
  canRetailRoleDo,
  canSeeRetailCostPrice,
  retailPermissionDenial,
  RETAIL_ACTIONS,
  RETAIL_RESOURCES,
  type RetailAction,
  type RetailResource,
} from "./permissions";

const session = (role: string | null | undefined) => ({ user: { role } });

/**
 * Every role that can appear in a session, plus the ones that cannot.
 *
 * `ROLES` is the `UserRole` enum, so this sweep grows on its own when a vertical
 * adds a role — which is the point: a new role must be denied retail until
 * somebody writes it into the matrix.
 *
 * `POS_CASHIER` is in the list because `lib/retail/pos-host.ts` admits it to the
 * POS portal, and it is not a `UserRole` — no row can hold it. It is here to pin
 * that the matrix denies it rather than half-recognising it.
 */
const EVERY_ROLE = [...ROLES, "POS_CASHIER", "NOT_A_ROLE", "", " ", "cashier "] as const;

describe("the shop's own", () => {
  it.each(["SUPERADMIN", "MANAGER", "SHOP_MANAGER"])("%s may do everything", (role) => {
    for (const resource of RETAIL_RESOURCES) {
      for (const action of RETAIL_ACTIONS) {
        expect(canRetailRoleDo(role, resource, action)).toBe(true);
      }
    }
  });
});

describe("the cashier", () => {
  it("runs a till", () => {
    expect(canRetailRoleDo("CASHIER", "retail.sell", "view")).toBe(true);
    expect(canRetailRoleDo("CASHIER", "retail.sell", "create")).toBe(true);
    expect(canRetailRoleDo("CASHIER", "retail.sell", "open-shift")).toBe(true);
    expect(canRetailRoleDo("CASHIER", "retail.sell", "close-shift")).toBe(true);
  });

  it("reads the shelf price but not the buying price", () => {
    // The reason this module is a matrix and not three role sets. `pos/catalog`
    // has to stay open to a cashier — a till that cannot list its stock cannot
    // sell — and the cost and margin columns it carries must not.
    expect(canRetailRoleDo("CASHIER", "retail.catalog", "view")).toBe(true);
    expect(canRetailRoleDo("CASHIER", "retail.catalog", "view-cost")).toBe(false);
    expect(canSeeRetailCostPrice("CASHIER")).toBe(false);
  });

  it("cannot change the shelf", () => {
    expect(canRetailRoleDo("CASHIER", "retail.catalog", "create")).toBe(false);
    expect(canRetailRoleDo("CASHIER", "retail.catalog", "update")).toBe(false);
    expect(canRetailRoleDo("CASHIER", "retail.catalog", "delete")).toBe(false);
  });

  it("cannot reverse a posted sale", () => {
    // Reversal is how a till is stolen from: ring the sale, take the cash, void
    // it. Today `requireRetailPos` lets a cashier do both; this is the change.
    expect(canRetailRoleDo("CASHIER", "retail.sell", "refund")).toBe(false);
    expect(canRetailRoleDo("CASHIER", "retail.sell", "void")).toBe(false);
  });

  it("cannot reach purchasing", () => {
    for (const action of RETAIL_ACTIONS) {
      expect(canRetailRoleDo("CASHIER", "retail.purchasing", action)).toBe(false);
    }
  });

  it("cannot reach cash control", () => {
    // Closing their own drawer is `retail.sell`. Cash control is every cashier's
    // shift, its variance, and the sign-off — the count that catches the person
    // doing the counting.
    for (const action of RETAIL_ACTIONS) {
      expect(canRetailRoleDo("CASHIER", "retail.cash-control", action)).toBe(false);
    }
  });

  it("cannot reach the trading dashboard", () => {
    for (const action of RETAIL_ACTIONS) {
      expect(canRetailRoleDo("CASHIER", "retail.reports", action)).toBe(false);
    }
  });

  it("cannot reach setup", () => {
    for (const action of RETAIL_ACTIONS) {
      expect(canRetailRoleDo("CASHIER", "retail.setup", action)).toBe(false);
    }
  });

  it("cannot touch the stock ledger", () => {
    for (const action of RETAIL_ACTIONS) {
      expect(canRetailRoleDo("CASHIER", "retail.stock", action)).toBe(false);
    }
  });
});

describe("the stock clerk", () => {
  it("counts, moves and corrects stock", () => {
    expect(canRetailRoleDo("STOCK_CLERK", "retail.stock", "view")).toBe(true);
    expect(canRetailRoleDo("STOCK_CLERK", "retail.stock", "create")).toBe(true);
    expect(canRetailRoleDo("STOCK_CLERK", "retail.stock", "update")).toBe(true);
  });

  it("cannot delete a stock movement or approve a write-off", () => {
    expect(canRetailRoleDo("STOCK_CLERK", "retail.stock", "delete")).toBe(false);
    expect(canRetailRoleDo("STOCK_CLERK", "retail.stock", "approve")).toBe(false);
  });

  it("books a delivery in against an order it cannot raise", () => {
    expect(canRetailRoleDo("STOCK_CLERK", "retail.purchasing", "view")).toBe(true);
    expect(canRetailRoleDo("STOCK_CLERK", "retail.purchasing", "receive")).toBe(true);
    // `purchasing/orders` POST is gated on `requireRetailStock` today, so this is
    // a narrowing: deciding what the shop buys, and at what price, is not theirs.
    expect(canRetailRoleDo("STOCK_CLERK", "retail.purchasing", "create")).toBe(false);
    expect(canRetailRoleDo("STOCK_CLERK", "retail.purchasing", "update")).toBe(false);
    expect(canRetailRoleDo("STOCK_CLERK", "retail.purchasing", "approve")).toBe(false);
  });

  it("cannot sell", () => {
    // A shop that lets the person who counts the stock also sell it has removed
    // its own separation of duties.
    for (const action of RETAIL_ACTIONS) {
      expect(canRetailRoleDo("STOCK_CLERK", "retail.sell", action)).toBe(false);
    }
  });

  it("cannot reach cash control", () => {
    for (const action of RETAIL_ACTIONS) {
      expect(canRetailRoleDo("STOCK_CLERK", "retail.cash-control", action)).toBe(false);
    }
  });

  it("cannot reach reports or setup", () => {
    for (const action of RETAIL_ACTIONS) {
      expect(canRetailRoleDo("STOCK_CLERK", "retail.reports", action)).toBe(false);
      expect(canRetailRoleDo("STOCK_CLERK", "retail.setup", action)).toBe(false);
    }
  });

  it("reads the shelf without the buying price", () => {
    expect(canRetailRoleDo("STOCK_CLERK", "retail.catalog", "view")).toBe(true);
    expect(canRetailRoleDo("STOCK_CLERK", "retail.catalog", "view-cost")).toBe(false);
  });
});

describe("default deny", () => {
  it("denies an absent, empty or unrecognised role everything", () => {
    const strangers = [null, undefined, "", "   ", "NOT_A_ROLE", "POS_CASHIER", "ADMIN"];
    for (const role of strangers) {
      for (const resource of RETAIL_RESOURCES) {
        for (const action of RETAIL_ACTIONS) {
          expect(canRetailRoleDo(role, resource, action)).toBe(false);
        }
      }
    }
  });

  it.each(
    ROLES.filter(
      (role) => !["SUPERADMIN", "MANAGER", "SHOP_MANAGER", "CASHIER", "STOCK_CLERK"].includes(role),
    ),
  )("gives a %s nothing in retail", (role) => {
    // These share one `UserRole` enum with the retail roles. A tenant running a
    // school and a bottle store would otherwise put a teacher on the till.
    // CLERK and FINANCE_OFFICER are in `VERTICAL_ROLE_REGISTRY.RETAIL` and still
    // get nothing: no retail gate admits them today, and this ticket is not the
    // place to widen access.
    for (const resource of RETAIL_RESOURCES) {
      for (const action of RETAIL_ACTIONS) {
        expect(canRetailRoleDo(role, resource, action)).toBe(false);
      }
    }
  });

  it("normalises case and whitespace rather than failing open or closed on it", () => {
    expect(canRetailRoleDo("  cashier ", "retail.sell", "create")).toBe(true);
    expect(canRetailRoleDo("Cashier", "retail.reports", "view")).toBe(false);
  });
});

describe("the matrix itself", () => {
  it("is not vacuously all-deny — every resource has a role that can view it", () => {
    for (const resource of RETAIL_RESOURCES) {
      const viewers = EVERY_ROLE.filter((role) => canRetailRoleDo(role, resource, "view"));
      expect(viewers.length, `no role can view ${resource}`).toBeGreaterThan(0);
    }
  });

  it("grants somebody every action it defines", () => {
    // An action nobody holds is either dead vocabulary or a grant that was meant
    // to be written and was not.
    for (const action of RETAIL_ACTIONS) {
      const holders = EVERY_ROLE.flatMap((role) =>
        RETAIL_RESOURCES.filter((resource) => canRetailRoleDo(role, resource, action)),
      );
      expect(holders.length, `no role holds ${action}`).toBeGreaterThan(0);
    }
  });

  it("decides every role × resource × action without throwing", () => {
    // The gap-catcher. A missing verb or label in the message tables, or a role
    // whose grants are the wrong shape, surfaces here rather than as a 500 at the
    // till on a Saturday.
    let decisions = 0;
    for (const role of EVERY_ROLE) {
      for (const resource of RETAIL_RESOURCES) {
        for (const action of RETAIL_ACTIONS) {
          const allowed = canRetailRoleDo(role, resource, action);
          expect(typeof allowed).toBe("boolean");

          const denial = retailPermissionDenial(session(role), resource, action);
          if (allowed) {
            expect(denial).toBeNull();
          } else {
            expect(typeof denial).toBe("string");
            // Not a half-built sentence: no `undefined` from a missing table entry.
            expect(denial).toMatch(/^Your role cannot \S.*\S$/);
            expect(denial).not.toContain("undefined");
          }
          decisions += 1;
        }
      }
    }
    expect(decisions).toBe(EVERY_ROLE.length * RETAIL_RESOURCES.length * RETAIL_ACTIONS.length);
  });

  it("refuses an unknown resource or action rather than failing open", () => {
    // The matrix is indexed, not searched, so a typo in a call site must land on
    // deny. Cast because the whole point is a value the type system forbids.
    const bogusResource = "retail.nonsense" as RetailResource;
    const bogusAction = "obliterate" as RetailAction;
    expect(canRetailRoleDo("CASHIER", bogusResource, "view")).toBe(false);
    expect(canRetailRoleDo("CASHIER", "retail.sell", bogusAction)).toBe(false);
    expect(canRetailRoleDo("MANAGER", bogusResource, "view")).toBe(false);
  });
});

describe("retailPermissionDenial", () => {
  it("returns null when allowed", () => {
    expect(retailPermissionDenial(session("CASHIER"), "retail.sell", "create")).toBeNull();
    expect(retailPermissionDenial(session("MANAGER"), "retail.reports", "view")).toBeNull();
  });

  it("returns a message a person behind a counter can act on", () => {
    // A message rather than a throw, because a throw is caught by the generic
    // handler and reported as a 500 — telling a cashier the shop's system is
    // broken when in fact they simply may not.
    expect(retailPermissionDenial(session("CASHIER"), "retail.catalog", "view-cost")).toBe(
      "Your role cannot see cost price on catalogue items",
    );
    expect(retailPermissionDenial(session("CASHIER"), "retail.reports", "view")).toBe(
      "Your role cannot view retail reports",
    );
    expect(retailPermissionDenial(session("CASHIER"), "retail.cash-control", "approve")).toBe(
      "Your role cannot approve cash control",
    );
    expect(retailPermissionDenial(session("STOCK_CLERK"), "retail.sell", "create")).toBe(
      "Your role cannot create sales",
    );
    expect(retailPermissionDenial(session("STOCK_CLERK"), "retail.purchasing", "create")).toBe(
      "Your role cannot create purchase orders",
    );
  });
});

describe("canSeeRetailCostPrice", () => {
  it("is the question the row serialisers ask", () => {
    expect(canSeeRetailCostPrice("MANAGER")).toBe(true);
    expect(canSeeRetailCostPrice("SHOP_MANAGER")).toBe(true);
    // The cashier reads the same `pos/catalog` rows with the cost stripped out.
    expect(canSeeRetailCostPrice("CASHIER")).toBe(false);
    expect(canSeeRetailCostPrice("STOCK_CLERK")).toBe(false);
    expect(canSeeRetailCostPrice(null)).toBe(false);
  });
});

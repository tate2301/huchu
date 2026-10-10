/**
 * The Roles board holds, cell by cell (80-admin 3.1).
 *
 * For every row, role column and letter: the board shows the letter if and
 * only if the role holds at least one of the grants that realise it. The
 * Superuser column is measured as `CORELITH_SUPPORT`, the Manager column as
 * both MANAGER and SHOP_MANAGER.
 */

import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { ROLES } from "@/lib/roles";

import {
  canRetailRoleDo,
  RESOURCE_LABELS,
  RETAIL_ACTIONS,
  RETAIL_RESOURCES,
  RETAIL_ROLE_KEYS,
} from "./permission-matrix";
import {
  formatLimitMoney,
  lettersFor,
  MATRIX_LETTERS,
  ROLE_COLUMNS,
  ROLE_SECTIONS,
  rolesView,
  type RoleLimits,
} from "./roles-matrix";

const BOARD_LIMITS: RoleLimits = {
  priceChanges: "MANAGERS",
  belowCostNeedsOwner: true,
  adjustmentPinOver: new Prisma.Decimal("50.00"),
  countDifferences: "OWNER_OVER_LIMIT",
  countOwnerOver: new Prisma.Decimal("100.00"),
  requisitionOwnerOver: new Prisma.Decimal("500.00"),
  accountOwnerOver: new Prisma.Decimal("250.00"),
};

const ROWS = ROLE_SECTIONS.flatMap((section) => section.rows);

/** The role keys each board column is measured with. */
const KEYS_FOR: Record<(typeof ROLE_COLUMNS)[number]["key"], string[]> = {
  SUPERUSER: ["CORELITH_SUPPORT"],
  OWNER: ["SUPERADMIN"],
  MANAGER: ["MANAGER", "SHOP_MANAGER"],
  CASHIER: ["CASHIER"],
  STOCK_CLERK: ["STOCK_CLERK"],
  BOOKKEEPER: ["FINANCE_OFFICER"],
};

describe("the board's shape", () => {
  it("has seven sections and 32 rows in the board's order", () => {
    expect(ROLE_SECTIONS.map((section) => section.title)).toEqual([
      "Set up",
      "Products and prices",
      "Stock",
      "Buying and paying",
      "The floor",
      "Customers",
      "People and controls",
    ]);
    expect(ROWS).toHaveLength(32);
  });

  it("has six role columns with the board's names and subs", () => {
    expect(ROLE_COLUMNS.map((column) => [column.label, column.sub])).toEqual([
      ["Superuser", "Corelith support"],
      ["Owner", "SUPERADMIN"],
      ["Manager", "MANAGER, SHOP_MANAGER"],
      ["Cashier", "CASHIER"],
      ["Stock clerk", "STOCK_CLERK"],
      ["Bookkeeper", "FINANCE_OFFICER"],
    ]);
  });

  it("types every board cell as letters in C R U D order", () => {
    for (const row of ROWS) {
      for (const letters of Object.values(row.letters)) expect(letters).toMatch(/^C?R?U?D?$/);
    }
  });
});

describe("every cell of the board holds", () => {
  const cells = ROWS.flatMap((row) =>
    ROLE_COLUMNS.flatMap((column) =>
      KEYS_FOR[column.key].flatMap((roleKey) =>
        MATRIX_LETTERS.map((letter) => ({ row, column: column.key, roleKey, letter })),
      ),
    ),
  );

  it("covers 32 rows × 6 columns × 4 letters (Manager twice)", () => {
    expect(cells).toHaveLength(32 * 7 * 4);
  });

  it.each(cells.map((cell) => [`${cell.row.label} · ${cell.roleKey} · ${cell.letter}`, cell] as const))(
    "%s",
    (_name, { row, column, roleKey, letter }) => {
      const onBoard = row.letters[column].includes(letter);
      const pairs = row.realise[letter] ?? [];
      const held = pairs.some(([resource, action]) => canRetailRoleDo(roleKey, resource, action));
      expect(held).toBe(onBoard);
    },
  );

  it("derives the board's letters for every row and column", () => {
    for (const row of ROWS) {
      for (const column of ROLE_COLUMNS) {
        for (const roleKey of KEYS_FOR[column.key]) expect(lettersFor(row, roleKey)).toBe(row.letters[column.key]);
      }
    }
  });
});

describe("the grants around the board", () => {
  it("labels every resource", () => {
    expect(RETAIL_RESOURCES).toHaveLength(37);
    for (const resource of RETAIL_RESOURCES) expect(RESOURCE_LABELS[resource]?.length).toBeGreaterThan(0);
  });

  it("grants nothing to a role outside the seven keys", () => {
    const others = [...ROLES, "POS_CASHIER", "NOT_A_ROLE", ""].filter(
      (role) => !(RETAIL_ROLE_KEYS as readonly string[]).includes(role),
    );
    expect(others).toEqual(expect.arrayContaining(["TEACHER", "CLERK"]));
    for (const role of [...others, "SALES_REP"]) {
      for (const resource of RETAIL_RESOURCES) {
        for (const action of RETAIL_ACTIONS) expect(canRetailRoleDo(role, resource, action)).toBe(false);
      }
    }
  });

  it("never makes an R out of view-own", () => {
    for (const row of ROWS) {
      for (const [, action] of row.realise.R ?? []) expect(action).not.toBe("view-own");
    }
    const requisitions = ROWS.find((row) => row.label === "Requisitions");
    expect(requisitions && lettersFor(requisitions, "CASHIER")).toBe("C");
    expect(canRetailRoleDo("CASHIER", "retail.requisitions", "view-own")).toBe(true);
    expect(canRetailRoleDo("CASHIER", "retail.requisitions", "view")).toBe(false);
  });

  it("gives Corelith support everything but writes on activity, insights and money", () => {
    for (const resource of RETAIL_RESOURCES) {
      const readOnly = ["retail.activity", "retail.insights", "retail.money"].includes(resource);
      expect(canRetailRoleDo("CORELITH_SUPPORT", resource, "view")).toBe(true);
      expect(canRetailRoleDo("CORELITH_SUPPORT", resource, "update")).toBe(!readOnly);
      expect(canRetailRoleDo("CORELITH_SUPPORT", resource, "view-own")).toBe(false);
    }
  });
});

describe("the limit sentences read the Approvals settings", () => {
  const limitOf = (label: string, limits: RoleLimits = BOARD_LIMITS) =>
    ROWS.find((row) => row.label === label)?.limit?.(limits) ?? null;

  it("reads as the board with the board's settings", () => {
    expect(ROWS.map((row) => row.limit?.(BOARD_LIMITS) ?? "")).toEqual([
      "Superuser can switch business type and features for support.",
      "",
      "",
      "Managers change the rate only.",
      "",
      "",
      "",
      "",
      "Cashiers and stock clerks never see cost.",
      "Below cost needs the owner.",
      "Cashiers redeem vouchers at the till.",
      "",
      "Owner approves differences over US$100.",
      "Over US$50 needs a manager PIN.",
      "",
      "Liquor store only.",
      "",
      "Stock clerks receive; they do not order.",
      "Managers approve up to US$500.",
      "",
      "Cashiers refund with a manager PIN over the limit.",
      "Cashiers open and close their own.",
      "",
      "",
      "Cashiers add customers at the till.",
      "Owner approves limits over US$250.",
      "",
      "Managers add cashiers and stock clerks only.",
      "",
      "Managers see their own sites.",
      "Restore is U; delete for good is D.",
      "Managers do not see Money.",
    ]);
  });

  it("follows a changed setting", () => {
    const changed: RoleLimits = {
      ...BOARD_LIMITS,
      priceChanges: "OWNER",
      countDifferences: "ANY_MANAGER",
      adjustmentPinOver: new Prisma.Decimal("62.50"),
      requisitionOwnerOver: new Prisma.Decimal("1940.00"),
    };
    expect(limitOf("Prices and price lists", changed)).toBe("Price changes need the owner.");
    expect(limitOf("Counts", changed)).toBe("Any manager approves differences.");
    expect(limitOf("Adjustments, breakage", changed)).toBe("Over US$62.50 needs a manager PIN.");
    expect(limitOf("Requisitions", changed)).toBe("Managers approve up to US$1,940.");
    expect(limitOf("Prices and price lists", { ...BOARD_LIMITS, belowCostNeedsOwner: false })).toBeNull();
  });

  it("formats whole dollars without .00", () => {
    expect(formatLimitMoney(new Prisma.Decimal("500.00"))).toBe("US$500");
    expect(formatLimitMoney(new Prisma.Decimal("1940.5"))).toBe("US$1,940.50");
  });
});

describe("rolesView, the sheet's data", () => {
  const view = rolesView(BOARD_LIMITS);

  it("draws the board from the grants, with live limits and their links", () => {
    expect(view.columns.map((column) => column.label)).toEqual([
      "Superuser",
      "Owner",
      "Manager",
      "Cashier",
      "Stock clerk",
      "Bookkeeper",
    ]);
    const bin = view.sections.at(-1)?.rows.find((row) => row.label === "Bin");
    expect(bin?.cells).toEqual({
      SUPERUSER: "CRUD",
      OWNER: "RUD",
      MANAGER: "RU",
      CASHIER: "",
      STOCK_CLERK: "",
      BOOKKEEPER: "",
    });
    const requisitions = view.sections[3].rows.find((row) => row.label === "Requisitions");
    expect(requisitions).toMatchObject({
      limit: "Managers approve up to US$500.",
      limitHref: "/retail/manage/approvals",
    });
    const sales = view.sections[4].rows[0];
    expect(sales.limitHref).toBe("/retail/manage/till-rules");
    expect(view.sections[0].rows[1]).toMatchObject({ limit: null, limitHref: null });
  });
});

/**
 * The Roles board, transcribed: "Who can do what" (80-admin 3.1, ADM-01).
 *
 * Seven sections, 32 rows, six role columns and a Limits column, in the
 * board's order and words. Each row keeps the board's letters as typed, and
 * says which grants make each letter true (`realise`); `roles-matrix.test.ts`
 * holds the letters and the grants in `permission-matrix.ts` equal, cell by
 * cell. The "Who can do what" sheet renders `rolesView`, whose letters are
 * derived from the grants — the matrix the server enforces, never typed into
 * a page.
 */

import type { Prisma } from "@prisma/client";

import { canRetailRoleDo, type RetailAction, type RetailResource } from "./permission-matrix";

export const ROLE_COLUMNS = [
  { key: "SUPERUSER", label: "Superuser", sub: "Corelith support", roleKey: "CORELITH_SUPPORT" },
  { key: "OWNER", label: "Owner", sub: "SUPERADMIN", roleKey: "SUPERADMIN" },
  { key: "MANAGER", label: "Manager", sub: "MANAGER, SHOP_MANAGER", roleKey: "MANAGER" },
  { key: "CASHIER", label: "Cashier", sub: "CASHIER", roleKey: "CASHIER" },
  { key: "STOCK_CLERK", label: "Stock clerk", sub: "STOCK_CLERK", roleKey: "STOCK_CLERK" },
  { key: "BOOKKEEPER", label: "Bookkeeper", sub: "FINANCE_OFFICER", roleKey: "FINANCE_OFFICER" },
] as const;

export type RoleColumn = (typeof ROLE_COLUMNS)[number]["key"];

export const MATRIX_LETTERS = ["C", "R", "U", "D"] as const;
export type MatrixLetter = (typeof MATRIX_LETTERS)[number];

/**
 * The Approvals settings a limit sentence reads. A subset of ADM-04's
 * `ApprovalLimits`, so `getApprovalLimits(companyId)` passes straight in.
 */
export type RoleLimits = {
  priceChanges: "MANAGERS" | "OWNER";
  belowCostNeedsOwner: boolean;
  adjustmentPinOver: Prisma.Decimal;
  countDifferences: "ANY_MANAGER" | "OWNER_OVER_LIMIT";
  countOwnerOver: Prisma.Decimal;
  requisitionOwnerOver: Prisma.Decimal;
  accountOwnerOver: Prisma.Decimal;
};

export const APPROVALS_HREF = "/retail/manage/approvals";
export const TILL_RULES_HREF = "/retail/manage/till-rules";

export type RoleRow = {
  label: string;
  /** The board's letters per column, as typed on it: "CRUD", "RU", "" (drawn "–"). */
  letters: Record<RoleColumn, string>;
  /** Per letter, the grants that make it true (any of). */
  realise: Partial<Record<MatrixLetter, Array<[RetailResource, RetailAction]>>>;
  /** The live limit sentence, read from the Approvals settings. */
  limit?: (limits: RoleLimits) => string | null;
  /** Where the limit sentence links: Approvals or Till rules. */
  limitHref?: string;
};

export type RoleSection = { title: string; rows: RoleRow[] };

/** "US$500" for whole dollars, "US$62.50" otherwise. */
export function formatLimitMoney(value: Prisma.Decimal | number | string): string {
  const amount = Number(value);
  const whole = Number.isInteger(amount);
  return `US$${amount.toLocaleString("en-GB", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

/** C, R, U, D on one resource, the shape most rows have. */
function crud(resource: RetailResource): RoleRow["realise"] {
  return {
    C: [[resource, "create"]],
    R: [[resource, "view"]],
    U: [[resource, "update"]],
    D: [[resource, "delete"]],
  };
}

/** Letters in column order: Superuser, Owner, Manager, Cashier, Stock clerk, Bookkeeper. */
function cols(...letters: [string, string, string, string, string, string]): Record<RoleColumn, string> {
  return {
    SUPERUSER: letters[0],
    OWNER: letters[1],
    MANAGER: letters[2],
    CASHIER: letters[3],
    STOCK_CLERK: letters[4],
    BOOKKEEPER: letters[5],
  };
}

const always = (sentence: string) => () => sentence;

export const ROLE_SECTIONS: RoleSection[] = [
  {
    title: "Set up",
    rows: [
      {
        label: "Company and business type",
        letters: cols("CRUD", "RU", "R", "", "", "R"),
        realise: crud("retail.company"),
        limit: always("Superuser can switch business type and features for support."),
      },
      { label: "Sites and places", letters: cols("CRUD", "CRUD", "RU", "", "R", "R"), realise: crud("retail.sites") },
      { label: "Tills and devices", letters: cols("CRUD", "CRUD", "CRUD", "", "", ""), realise: crud("retail.tills") },
      {
        label: "Payments, ZiG rate",
        letters: cols("CRUD", "RU", "RU", "", "", "R"),
        realise: {
          C: [["retail.payments", "create"]],
          R: [["retail.payments", "view"]],
          U: [
            ["retail.payments", "update"],
            ["retail.zig-rate", "update"],
          ],
          D: [["retail.payments", "delete"]],
        },
        limit: always("Managers change the rate only."),
      },
      {
        label: "Till rules, receipts",
        letters: cols("CRUD", "RU", "RU", "", "", ""),
        realise: {
          C: [["retail.till-rules", "create"]],
          R: [
            ["retail.till-rules", "view"],
            ["retail.receipts", "view"],
          ],
          U: [
            ["retail.till-rules", "update"],
            ["retail.receipts", "update"],
          ],
          D: [["retail.till-rules", "delete"]],
        },
      },
      { label: "Fiscal device", letters: cols("CRUD", "RU", "R", "", "", "R"), realise: crud("retail.fiscal") },
      { label: "Posting to the books", letters: cols("CRUD", "RU", "", "", "", "RU"), realise: crud("retail.posting") },
      { label: "Plan and billing", letters: cols("CRUD", "RU", "", "", "", "R"), realise: crud("retail.billing") },
    ],
  },
  {
    title: "Products and prices",
    rows: [
      {
        label: "Products",
        letters: cols("CRUD", "CRUD", "CRUD", "R", "R", "R"),
        realise: crud("retail.catalog"),
        limit: always("Cashiers and stock clerks never see cost."),
      },
      {
        label: "Prices and price lists",
        letters: cols("CRUD", "CRUD", "CRU", "R", "", "R"),
        realise: {
          C: [["retail.prices", "create"]],
          R: [["retail.prices", "view"]],
          U: [
            ["retail.prices", "update"],
            ["retail.prices", "approve"],
          ],
          D: [["retail.prices", "delete"]],
        },
        limit: (limits) =>
          limits.priceChanges === "OWNER"
            ? "Price changes need the owner."
            : limits.belowCostNeedsOwner
              ? "Below cost needs the owner."
              : null,
        limitHref: APPROVALS_HREF,
      },
      {
        label: "Promotions, bundles, vouchers",
        letters: cols("CRUD", "CRUD", "CRUD", "R", "", "R"),
        realise: crud("retail.promotions"),
        limit: always("Cashiers redeem vouchers at the till."),
      },
      { label: "Categories", letters: cols("CRUD", "CRUD", "CRU", "", "", "R"), realise: crud("retail.categories") },
    ],
  },
  {
    title: "Stock",
    rows: [
      {
        label: "Counts",
        letters: cols("CRUD", "CRUD", "CRUD", "", "CRU", "R"),
        realise: {
          C: [["retail.counts", "create"]],
          R: [["retail.counts", "view"]],
          U: [
            ["retail.counts", "update"],
            ["retail.counts", "approve"],
          ],
          D: [["retail.counts", "delete"]],
        },
        limit: (limits) =>
          limits.countDifferences === "ANY_MANAGER"
            ? "Any manager approves differences."
            : `Owner approves differences over ${formatLimitMoney(limits.countOwnerOver)}.`,
        limitHref: APPROVALS_HREF,
      },
      {
        label: "Adjustments, breakage",
        letters: cols("CRUD", "CRUD", "CRU", "", "C", "R"),
        realise: {
          C: [["retail.adjustments", "create"]],
          R: [["retail.adjustments", "view"]],
          U: [
            ["retail.adjustments", "update"],
            ["retail.adjustments", "approve"],
          ],
          D: [["retail.adjustments", "delete"]],
        },
        limit: (limits) => `Over ${formatLimitMoney(limits.adjustmentPinOver)} needs a manager PIN.`,
        limitHref: APPROVALS_HREF,
      },
      { label: "Transfers", letters: cols("CRUD", "CRUD", "CRUD", "", "CRU", "R"), realise: crud("retail.transfers") },
      {
        label: "Empties",
        letters: cols("CRUD", "CRUD", "CRUD", "C", "CRU", "R"),
        realise: crud("retail.empties"),
        limit: always("Liquor store only."),
      },
    ],
  },
  {
    title: "Buying and paying",
    rows: [
      { label: "Suppliers", letters: cols("CRUD", "CRUD", "CRUD", "", "R", "RU"), realise: crud("retail.suppliers") },
      {
        label: "Orders and deliveries",
        letters: cols("CRUD", "CRUD", "CRUD", "", "CRU", "R"),
        realise: {
          C: [
            ["retail.purchasing", "create"],
            ["retail.purchasing", "receive"],
          ],
          R: [["retail.purchasing", "view"]],
          U: [
            ["retail.purchasing", "update"],
            ["retail.purchasing", "approve"],
            ["retail.purchasing", "receive"],
          ],
          D: [["retail.purchasing", "delete"]],
        },
        limit: always("Stock clerks receive; they do not order."),
      },
      {
        label: "Requisitions",
        letters: cols("CRUD", "CRUD", "CRU", "C", "C", "R"),
        realise: {
          C: [["retail.requisitions", "create"]],
          R: [["retail.requisitions", "view"]],
          U: [
            ["retail.requisitions", "update"],
            ["retail.requisitions", "approve"],
          ],
          D: [["retail.requisitions", "delete"]],
        },
        limit: (limits) => `Managers approve up to ${formatLimitMoney(limits.requisitionOwnerOver)}.`,
        limitHref: APPROVALS_HREF,
      },
      {
        label: "Bills and supplier payments",
        letters: cols("CRUD", "CRUD", "R", "", "", "CRUD"),
        realise: crud("retail.bills"),
      },
    ],
  },
  {
    title: "The floor",
    rows: [
      {
        label: "Sales, refunds, voids",
        letters: cols("CRUD", "CRUD", "CRUD", "CR", "", "R"),
        realise: {
          C: [
            ["retail.sell", "create"],
            ["retail.sell", "refund"],
            ["retail.sell", "void"],
          ],
          R: [["retail.sell", "view"]],
          U: [
            ["retail.sell", "update"],
            ["retail.sell", "approve"],
          ],
          D: [["retail.sell", "delete"]],
        },
        limit: always("Cashiers refund with a manager PIN over the limit."),
        limitHref: TILL_RULES_HREF,
      },
      {
        label: "Shifts and cash",
        letters: cols("CRUD", "CRUD", "CRUD", "CRU", "", "R"),
        realise: {
          C: [
            ["retail.cash-control", "create"],
            ["retail.sell", "open-shift"],
          ],
          R: [
            ["retail.cash-control", "view"],
            ["retail.sell", "open-shift"],
          ],
          U: [
            ["retail.cash-control", "update"],
            ["retail.cash-control", "close-shift"],
            ["retail.sell", "close-shift"],
          ],
          D: [["retail.cash-control", "delete"]],
        },
        limit: always("Cashiers open and close their own."),
      },
      { label: "Lay-bys", letters: cols("CRUD", "CRUD", "CRUD", "CRU", "", "R"), realise: crud("retail.laybys") },
      { label: "End of day", letters: cols("CRUD", "CRU", "CRU", "", "", "R"), realise: crud("retail.end-of-day") },
    ],
  },
  {
    title: "Customers",
    rows: [
      {
        label: "Customers and points",
        letters: cols("CRUD", "CRUD", "CRUD", "CR", "", "R"),
        realise: crud("retail.customers"),
        limit: always("Cashiers add customers at the till."),
      },
      {
        label: "Accounts",
        letters: cols("CRUD", "CRUD", "CRU", "", "", "RU"),
        realise: {
          C: [["retail.accounts", "create"]],
          R: [["retail.accounts", "view"]],
          U: [
            ["retail.accounts", "update"],
            ["retail.accounts", "approve"],
          ],
          D: [["retail.accounts", "delete"]],
        },
        limit: (limits) => `Owner approves limits over ${formatLimitMoney(limits.accountOwnerOver)}.`,
        limitHref: APPROVALS_HREF,
      },
      { label: "Loyalty settings", letters: cols("CRUD", "RU", "R", "", "", ""), realise: crud("retail.loyalty") },
    ],
  },
  {
    title: "People and controls",
    rows: [
      {
        label: "People and PINs",
        letters: cols("CRUD", "CRUD", "CRU", "", "", ""),
        realise: crud("retail.people"),
        limit: always("Managers add cashiers and stock clerks only."),
      },
      { label: "Approvals", letters: cols("CRUD", "RU", "R", "", "", "R"), realise: crud("retail.approvals") },
      {
        label: "Activity",
        letters: cols("R", "R", "R", "", "", "R"),
        realise: crud("retail.activity"),
        limit: always("Managers see their own sites."),
      },
      {
        label: "Bin",
        letters: cols("CRUD", "RUD", "RU", "", "", ""),
        realise: crud("retail.bin"),
        limit: always("Restore is U; delete for good is D."),
      },
      {
        label: "Insights",
        letters: cols("R", "R", "R", "", "", "R"),
        realise: crud("retail.insights"),
        limit: always("Managers do not see Money."),
      },
    ],
  },
];

/** The letters a role key holds on a row, derived from its grants, in C R U D order. */
export function lettersFor(row: RoleRow, roleKey: string): string {
  return MATRIX_LETTERS.filter((letter) =>
    (row.realise[letter] ?? []).some(([resource, action]) => canRetailRoleDo(roleKey, resource, action)),
  ).join("");
}

export const ROLES_INTRO =
  "C adds, R sees, U changes, D removes (to the bin, or ends it). Superuser is Corelith support acting for the shop, always logged. Owner is the tenant’s SUPERADMIN. Limits are set in Management › Approvals.";

export type RolesView = {
  intro: string;
  columns: Array<{ key: RoleColumn; label: string; sub: string }>;
  sections: Array<{
    title: string;
    rows: Array<{
      label: string;
      cells: Record<RoleColumn, string>;
      limit: string | null;
      limitHref: string | null;
    }>;
  }>;
};

/** The "Who can do what" sheet's data: letters from the grants, limits from the settings. */
export function rolesView(limits: RoleLimits): RolesView {
  return {
    intro: ROLES_INTRO,
    columns: ROLE_COLUMNS.map(({ key, label, sub }) => ({ key, label, sub })),
    sections: ROLE_SECTIONS.map((section) => ({
      title: section.title,
      rows: section.rows.map((row) => {
        const limit = row.limit?.(limits) ?? null;
        return {
          label: row.label,
          cells: Object.fromEntries(
            ROLE_COLUMNS.map((column) => [column.key, lettersFor(row, column.roleKey)]),
          ) as Record<RoleColumn, string>,
          limit,
          limitHref: limit ? (row.limitHref ?? null) : null,
        };
      }),
    })),
  };
}

/**
 * What this till is set to, and what the person standing at it may do about it.
 *
 * S-7.4. The pure half of `app/api/v2/retail/pos/till-settings/route.ts` — the
 * two decisions on that screen that are rules rather than rows, so they can be
 * asserted without a database.
 *
 * ── The cashier / manager decision, and why it is not a slider ─────────────
 *
 * The till portal is cashier-only. `canAccessPosPortal` in `lib/retail/pos-host.ts`
 * admits `CASHIER` and `POS_CASHIER` and nothing else, and `PosPortalAuthGuard`
 * sends everybody else to `/access-blocked`. A shop manager does not work at this
 * screen; they work in the back office at `/retail/setup/**` and they approve at
 * the counter by typing their password into the override dialog.
 *
 * So "what does a cashier see" is the whole question, and the answer is: all of
 * it, and none of it editable.
 *
 *  - **All of it**, because every group on this screen is a rule the cashier is
 *    already operating under — which register they are on, whether EcoCash needs
 *    a reference, whether a refund needs a reason, that the shelf price already
 *    contains the VAT. Withholding the rules from the person they constrain is
 *    theatre, and it costs the shop a cashier who has to ask.
 *  - **None of it editable**, because `retail.setup` is not a cashier grant in
 *    `lib/retail/permissions.ts` and a cashier who can raise the discount ceiling
 *    has removed the control the ceiling exists to be. That is not enforced by
 *    hiding a button: there is no write handler on `pos/till-settings` at all, so
 *    the capability does not exist to be found.
 *
 * The one exception is the cashier's **own unlock PIN**, which is not a setting
 * and is not `retail.setup`. It is a personal credential, it has its own endpoint
 * at `pos/pin`, and that endpoint requires the caller's own account password
 * before it will mint one — so changing it is an act of authentication rather than
 * of configuration. Conflating the two would either lock a cashier out of their own
 * PIN or hand them the shop's settings; it is the same mistake in both directions.
 *
 * ── Tax is derived, never typed ────────────────────────────────────────────
 *
 * The prototype has an editable "Tax rate (%)" defaulted to 14.5 — Zimbabwe's rate
 * from 2020 until it returned to 15% on 1 January 2023. Retail holds no shop-wide
 * tax rate and must not grow one: tax is `Product.defaultTaxRate` per item, and
 * whether the shelf price contains it is `PriceList.taxInclusive`. This module
 * summarises what the shop is *actually* charging across its shelf rather than
 * rendering a number somebody typed once.
 */

import type { Prisma } from "@corelithzw/db";

import { percent, type MoneyLike } from "@corelithzw/platform/money";
import { canRetailRoleDo } from "./permissions";

/* ─── What the shelf is taxed at ──────────────────────────────────────────── */

/** One distinct rate found on the shelf, and how many products carry it. */
export type ShelfTaxRateTally = {
  taxPercent: MoneyLike;
  productCount: number;
};

export type ShelfTaxSummary = {
  /**
   * The rate the shop mostly charges, as a fixed-2 string, or `null` when the
   * shelf is empty. The mode rather than a mean: averaging 15% over 400 bottles
   * with 0% over 3 zero-rated lines gives 14.89%, a rate no product is sold at.
   */
  standardRatePercent: string | null;
  /** True when more than one rate is in use, so the screen can say so. */
  mixed: boolean;
  /** Every distinct rate, most-used first, each as a fixed-2 string. */
  rates: Array<{ taxPercent: string; productCount: number }>;
  /** Products counted. Zero means nothing is priced yet, not that tax is zero. */
  productCount: number;
};

/**
 * The shelf's tax position, from a `groupBy` over the sellable products.
 *
 * Exact throughout: rates arrive as `Decimal(5,2)` and are compared with
 * `Decimal.equals`, never as floats. `14.50` and `14.5` are the same rate and
 * collapse into one row; `15.00` and `14.50` do not.
 */
export function summariseShelfTax(tallies: ShelfTaxRateTally[]): ShelfTaxSummary {
  const merged: Array<{ rate: Prisma.Decimal; productCount: number }> = [];
  for (const tally of tallies) {
    const rate = percent(tally.taxPercent);
    const existing = merged.find((candidate) => candidate.rate.equals(rate));
    if (existing) {
      existing.productCount += tally.productCount;
    } else {
      merged.push({ rate, productCount: tally.productCount });
    }
  }

  // Most-used first; on a tie the higher rate leads, so a shop with an even split
  // is told about the one a customer is more likely to be charged.
  merged.sort((a, b) => {
    if (a.productCount !== b.productCount) return b.productCount - a.productCount;
    return b.rate.comparedTo(a.rate);
  });

  const productCount = merged.reduce((sum, row) => sum + row.productCount, 0);

  return {
    standardRatePercent: merged.length > 0 ? merged[0].rate.toFixed(2) : null,
    mixed: merged.length > 1,
    rates: merged.map((row) => ({
      taxPercent: row.rate.toFixed(2),
      productCount: row.productCount,
    })),
    productCount,
  };
}

/* ─── What this role may do ───────────────────────────────────────────────── */

export type TillCapabilityId =
  | "sell"
  | "shift"
  | "refund"
  | "void"
  | "price-override"
  | "cost-price"
  | "setup";

export type TillCapability = {
  id: TillCapabilityId;
  label: string;
  allowed: boolean;
  /**
   * What happens when it is not allowed. `null` where the answer is simply "you
   * cannot" — a note that says nothing is worse than no note.
   */
  whenRefused: string | null;
};

/**
 * The capability list the settings screen renders, straight off the matrix.
 *
 * Read from `canRetailRoleDo` rather than from `canManageRetailTransactions` so
 * there is one authority. The two agree today — `RUN_A_TILL` grants a cashier
 * neither `update` nor `refund` nor `void`, and `MANAGE_THE_SHOP` grants
 * everything — and the point is that they cannot drift.
 *
 * `whenRefused` is the honest half. Three of these are refusals a cashier can
 * work around at the counter with a manager present, and three are not; a screen
 * that showed six identical red crosses would teach the cashier to stop reading it.
 */
/**
 * What actually happens when a cashier cannot reverse a sale.
 *
 * S-7.7. This used to read "A manager approves it at the till with their
 * password", which described a flow that does not exist. `pos/sales` has a
 * `managerOverride` field in its schema and **nothing in `components/` sends
 * it**; there is no approval dialog anywhere in the till. A capability list
 * whose refusals describe an imaginary remedy is worse than one that says
 * nothing, because a cashier follows it in front of a customer and finds no
 * button.
 *
 * Building that dialog is a real ticket. Until it exists the screen says where
 * the work genuinely gets done.
 */
const REVERSAL_IS_A_BACK_OFFICE_JOB =
  "Ask the manager — reversals are done in the back office, not at the till.";

export function summariseTillCapabilities(role: string | null | undefined): TillCapability[] {
  return [
    {
      id: "sell",
      label: "Ring up a sale and take payment",
      allowed: canRetailRoleDo(role, "retail.sell", "create"),
      whenRefused: null,
    },
    {
      id: "shift",
      label: "Open and cash up your own drawer",
      allowed:
        canRetailRoleDo(role, "retail.sell", "open-shift") &&
        canRetailRoleDo(role, "retail.sell", "close-shift"),
      whenRefused: null,
    },
    {
      id: "refund",
      label: "Refund a posted sale",
      allowed: canRetailRoleDo(role, "retail.sell", "refund"),
      whenRefused: REVERSAL_IS_A_BACK_OFFICE_JOB,
    },
    {
      id: "void",
      label: "Void a receipt",
      allowed: canRetailRoleDo(role, "retail.sell", "void"),
      whenRefused: REVERSAL_IS_A_BACK_OFFICE_JOB,
    },
    {
      id: "price-override",
      label: "Change a price or give a discount",
      allowed: canRetailRoleDo(role, "retail.sell", "update"),
      whenRefused: REVERSAL_IS_A_BACK_OFFICE_JOB,
    },
    {
      id: "cost-price",
      label: "See what the shop paid for an item",
      allowed: canRetailRoleDo(role, "retail.catalog", "view-cost"),
      whenRefused: "Cost and margin are the owner's; the till never shows them.",
    },
    {
      id: "setup",
      label: "Change any of the settings on this screen",
      allowed: canRetailRoleDo(role, "retail.setup", "update"),
      whenRefused: "The shop manager changes these in the back office.",
    },
  ];
}

/**
 * Whether the settings screen should offer a link into the back office.
 *
 * Only to somebody who could actually open it. At the till this is always false,
 * because the portal admits cashiers only — so the screen names where the setting
 * lives instead of offering a door that leads to `/access-blocked`.
 */
export function canEditTillSettings(role: string | null | undefined): boolean {
  return canRetailRoleDo(role, "retail.setup", "update");
}

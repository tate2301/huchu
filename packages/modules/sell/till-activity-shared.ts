/**
 * The half of the till activity log a browser may have.
 *
 * ── Why this file exists at all ────────────────────────────────────────────
 *
 * `till-activity.ts` imports `money()` from `lib/money`, which imports
 * `lib/prisma` for `resolveBaseCurrency`, which pulls in `pg`, which requires
 * `dns`. Importing any of it from a client component therefore fails the build
 * outright:
 *
 *     Module not found: Can't resolve 'dns'
 *       ./lib/prisma.ts        [Client Component Browser]
 *       ./lib/money.ts         [Client Component Browser]
 *       ./lib/retail/till-activity.ts
 *       ./components/retail/portal/pos-till-activity-view.tsx
 *
 * The screen only ever wanted the chip labels, the entry shape and a filter —
 * none of which touch money. So the pure part lives here with **no imports at
 * all**, and `till-activity.ts` re-exports it so server callers and the tests
 * carry on importing one module.
 *
 * This is the same rule `lib/retail/checkout.ts` follows and says so in its
 * header: a module the offline till bundles cannot afford a dependency, and
 * `lib/money` is the specific one that keeps getting added by accident.
 * Anything added below must stay dependency-free.
 */

/**
 * The prototype's six filter chips, minus its "all".
 *
 * `override` is the prototype's `disc` ("Discounts"). Renamed because what
 * retail actually records is `RetailSale.overrideReason` — a manager approving
 * a price off the shelf price — and an ordinary promotional discount writes no
 * such column. Calling the chip "Discounts" would promise rows that cannot
 * exist.
 */
export const TILL_ACTIVITY_KINDS = [
  "sale",
  "refund",
  "void",
  "override",
  "cash",
  "shift",
] as const;

export type TillActivityKind = (typeof TILL_ACTIVITY_KINDS)[number];

export const TILL_ACTIVITY_LABELS: Record<TillActivityKind, string> = {
  sale: "Sale",
  refund: "Refund",
  void: "Void",
  override: "Override",
  cash: "Cash move",
  shift: "Shift",
};

/** The chip row, in the prototype's order, with its "All" in front. */
export const TILL_ACTIVITY_FILTERS: Array<{ id: TillActivityKind | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "sale", label: "Sales" },
  { id: "refund", label: "Refunds" },
  { id: "void", label: "Voids" },
  { id: "override", label: "Overrides" },
  { id: "cash", label: "Cash moves" },
  { id: "shift", label: "Shift events" },
];

/**
 * One line of the timeline.
 *
 * `amount` is a fixed-2 string in the company's base currency, signed as it
 * affects the shop — never a float, and never re-signed by the reader. `null`
 * where the event has no money in it. A string rather than a number precisely
 * so this file needs no `Decimal`, and so no reader can round one.
 */
export type TillActivityEntry = {
  id: string;
  kind: TillActivityKind;
  /** ISO 8601. The only ordering key. */
  at: string;
  title: string;
  detail: string | null;
  actor: string | null;
  amount: string | null;
  shiftNo: string | null;
};

export function filterTillActivity(
  entries: TillActivityEntry[],
  kind: TillActivityKind | "all",
): TillActivityEntry[] {
  return kind === "all" ? entries : entries.filter((entry) => entry.kind === kind);
}

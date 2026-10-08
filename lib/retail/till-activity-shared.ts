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
 *       ./components/retail/till/person.tsx
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
 * The sale an event is about, for the sentence the screen writes. A reversal
 * points at the sale it reversed; an override at the sale it was given on.
 */
export type TillActivitySale = {
  /** Opens it in History. */
  id: string;
  saleNo: string;
  customerName: string | null;
  /** Fixed-2, base currency, positive: what the sale came to. */
  total: string;
};

export type TillActivityDiscount = {
  itemName: string;
  /** Fixed-2, base currency, positive. */
  amount: string;
};

/**
 * One line of the timeline, as facts: the screen writes the sentence.
 *
 * `amount` is a fixed-2 string in the company's base currency, signed as it
 * affects the shop — never a float, and never re-signed by the reader. `null`
 * where the event has no money in it. A string rather than a number precisely
 * so this file needs no `Decimal`, and so no reader can round one. The same
 * goes for every other money field here.
 */
export type TillActivityEntry = {
  id: string;
  kind: TillActivityKind;
  /** ISO 8601. The only ordering key. */
  at: string;
  actor: string | null;
  amount: string | null;
  shiftNo: string | null;
  /** The row's own sale number and customer: on sale, refund, void and override entries. */
  saleNo: string | null;
  customerName: string | null;
  /** "ZWG 1265.00" when it was paid in a currency other than the base one. */
  tendered: string | null;
  /** On a refund, a void or an override: the sale it is about. */
  sale: TillActivitySale | null;
  /** Why: a reversal's reason, an override's justification, a cash movement's note. */
  reason: string | null;
  /**
   * On a refund, a void or an override: the manager whose PIN let it through
   * ("Farai Mutasa approved"). Null when nobody had to, and on everything else.
   */
  approvedBy: string | null;
  /** On an override: the lines that came off the shelf price. */
  discounts: TillActivityDiscount[];
  /** On a cash movement: which way, and the reason picked from the list. */
  cashType: "DROP_TO_SAFE" | "FLOAT_TOP_UP" | "PAYOUT" | null;
  reasonLabel: string | null;
  /** On a shift event: which, on which till, and what the count came to. */
  shiftEvent: "open" | "close" | null;
  registerName: string | null;
  /** Signed fixed-2; null when the drawer was not counted. */
  variance: string | null;
};

/** What a manager approved with their PIN: a refund, a void or a discount. The till's "Approved" filter. */
export function wasApproved(entry: TillActivityEntry): boolean {
  return entry.approvedBy !== null;
}

export function filterTillActivity(
  entries: TillActivityEntry[],
  kind: TillActivityKind | "all",
): TillActivityEntry[] {
  return kind === "all" ? entries : entries.filter((entry) => entry.kind === kind);
}

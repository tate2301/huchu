/**
 * The vocabulary for cash moving in and out of a drawer mid-shift.
 *
 * S-7.1. Kept apart from `lib/retail/cash-up.ts` — which holds the arithmetic —
 * for one reason: the till renders these labels, and `lib/money.ts` reaches
 * `lib/prisma.ts`, so a client component importing the sums would drag the Prisma
 * client into the browser bundle. `lib/retail/checkout.ts` keeps itself importless
 * for exactly this reason and this file follows it: **no imports, and none may be
 * added.** The arithmetic lives one file over and is server-only.
 *
 * ── The three values ───────────────────────────────────────────────────────
 *
 * The direction is in each name on purpose. "Pickup" is the ambiguous word in this
 * trade: `docs/design-system/portals/pos.html` uses it for safe → drawer, most of
 * the sector uses it for drawer → safe, and a label that can be read either way on
 * a row that moves `expectedCash` is how the defect S-7.1 fixes would come back.
 *
 * These mirror `RetailCashMovementType` in `prisma/schema.prisma` exactly.
 * `lib/retail/cash-up.ts` asserts the two agree, so a value added to the schema and
 * forgotten here is a compile error rather than a movement the till cannot name.
 */

export const RETAIL_CASH_MOVEMENT_TYPES = [
  "DROP_TO_SAFE",
  "FLOAT_TOP_UP",
  "PAYOUT",
] as const;

export type RetailCashMovementTypeName = (typeof RETAIL_CASH_MOVEMENT_TYPES)[number];

/**
 * Which way each kind moves the money: `+1` into the drawer, `-1` out of it.
 *
 * The signs live here and nowhere else. `amount` on the row is always positive —
 * the direction is the type's job, because a negative `DROP_TO_SAFE` would be two
 * ways of saying the same thing and one of them would eventually be written by
 * mistake.
 */
export const RETAIL_CASH_MOVEMENT_DIRECTION: Record<RetailCashMovementTypeName, 1 | -1> = {
  /** The manager banks part of the takings. Out. */
  DROP_TO_SAFE: -1,
  /** Small notes carried in from the safe so the till can give change. In. */
  FLOAT_TOP_UP: 1,
  /** A supplier paid on delivery, or cash handed over outside a reversing sale. Out. */
  PAYOUT: -1,
};

/** Whether this kind of movement adds to the drawer or takes from it. */
export function cashMovementDirection(type: RetailCashMovementTypeName): 1 | -1 {
  return RETAIL_CASH_MOVEMENT_DIRECTION[type];
}

/** Reads on a till screen. Next to the directions so the two cannot drift apart. */
export const RETAIL_CASH_MOVEMENT_LABELS: Record<RetailCashMovementTypeName, string> = {
  DROP_TO_SAFE: "Drop to safe",
  FLOAT_TOP_UP: "Float top-up",
  PAYOUT: "Payout",
};

/* ── Reasons ─────────────────────────────────────────────────────────────── */

/**
 * Mirrors `RetailCashMovementReason` in `prisma/schema.prisma`.
 *
 * A fixed list rather than a text box, which is what
 * `docs/design-system/portals/pos.html` does and for a reason worth keeping: a
 * reason typed in a queue is a reason no Z-report can group by. "Cash level too
 * high" three times in a week is a float that is set wrong; three rows of free text
 * saying roughly that are three rows nobody counts.
 */
export const RETAIL_CASH_MOVEMENT_REASON_CODES = [
  "CASH_LEVEL_TOO_HIGH",
  "BANK_DEPOSIT",
  "END_OF_SHIFT_SKIM",
  "MANAGER_REQUEST",
  "CHANGE_REQUIRED",
  "SUPPLIER_PAYOUT",
  "PETTY_CASH",
  "OTHER",
] as const;

export type RetailCashMovementReasonCode =
  (typeof RETAIL_CASH_MOVEMENT_REASON_CODES)[number];

export const RETAIL_CASH_MOVEMENT_REASON_LABELS: Record<
  RetailCashMovementReasonCode,
  string
> = {
  CASH_LEVEL_TOO_HIGH: "Cash level too high",
  BANK_DEPOSIT: "Bank deposit",
  END_OF_SHIFT_SKIM: "End-of-shift skim",
  MANAGER_REQUEST: "Manager request",
  CHANGE_REQUIRED: "Ran out of change",
  SUPPLIER_PAYOUT: "Supplier paid on delivery",
  PETTY_CASH: "Petty cash",
  OTHER: "Other",
};

/**
 * Which reasons the till offers for each direction.
 *
 * The prototype's five, plus the two a payout needs — a payout reading "Cash level
 * too high" would be a lie, and the prototype has no payout to have thought about
 * it. `OTHER` is on every list and is the one that makes `reason` compulsory.
 */
export const RETAIL_CASH_MOVEMENT_REASONS: Record<
  RetailCashMovementTypeName,
  RetailCashMovementReasonCode[]
> = {
  DROP_TO_SAFE: [
    "CASH_LEVEL_TOO_HIGH",
    "BANK_DEPOSIT",
    "END_OF_SHIFT_SKIM",
    "MANAGER_REQUEST",
    "OTHER",
  ],
  FLOAT_TOP_UP: ["CHANGE_REQUIRED", "MANAGER_REQUEST", "OTHER"],
  PAYOUT: ["SUPPLIER_PAYOUT", "PETTY_CASH", "MANAGER_REQUEST", "OTHER"],
};

/* ── Denominations ───────────────────────────────────────────────────────── */

/**
 * One row of a counted bundle: how many of a note or coin.
 *
 * `denomination` is a decimal **string**, not a number. `0.1` is not representable
 * in binary and this value is multiplied by a count and summed against a
 * `Decimal(14,2)` column; keeping it as text means the arithmetic in
 * `lib/retail/cash-up.ts` never sees a float at all.
 */
export type CashDenominationLine = { denomination: string; count: number };

/** The bundle as it is stored on `RetailCashMovement.denominations`. */
export type CashDenominationBreakdown = {
  currency: string;
  lines: CashDenominationLine[];
};

/**
 * What a drawer holds, per currency, largest first.
 *
 * USD is the prototype's `DENOMS` verbatim — $100 down to 10c — because that is the
 * build contract and it is what a Harare bottle store's drawer actually contains.
 * ZWG is listed separately and is not a copy of it: a ZWG drop is a different set
 * of notes, and a breakdown keyed to the wrong denominations is worse than no
 * breakdown.
 *
 * A currency that is not here is not an error. `getCashDenominations` returns null
 * and the till falls back to keying the total on the keypad, which is what it did
 * before this ticket. Guessing a denomination set for a currency nobody has
 * configured would put invented facts into a safe log.
 */
export const RETAIL_CASH_DENOMINATIONS: Record<string, readonly string[]> = {
  USD: ["100", "50", "20", "10", "5", "2", "1", "0.50", "0.10"],
  ZWG: ["200", "100", "50", "20", "10", "5", "2", "1", "0.50", "0.10"],
};

/** The denominations to count this currency in, or null when none are configured. */
export function getCashDenominations(
  currency: string | null | undefined,
): readonly string[] | null {
  const code = currency?.trim().toUpperCase();
  if (!code) return null;
  return RETAIL_CASH_DENOMINATIONS[code] ?? null;
}

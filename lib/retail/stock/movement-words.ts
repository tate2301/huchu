import type { MovementType, StockMovementReason } from "@prisma/client";

/**
 * A stock movement in the words the Movement cell shows.
 *
 * One table for every screen that lists movements. The "short" form is the
 * Movements list's, which has a Site column of its own; the "long" form is the
 * product record's Stock movements tab, which has none, so a transfer there
 * names the other site ("Transfer to Borrowdale").
 */

/** `StateBadge` tones a movement can take: a badge on the list, a dot on the tab. */
export type MovementTone = "ok" | "warn" | "info" | "neutral" | "hollow";

/** The Kind filter on Movements: each reason belongs to one group. */
export type MovementKind = "SALES" | "DELIVERIES" | "COUNTS" | "BREAKAGE" | "CORRECTIONS" | "TRANSFERS" | "CASES";

/** Why a counted line differs, as the approver records it ("Why" on the count review). */
export type CountWhy = "BROKEN" | "NOT_KNOWN" | "FOUND";

type ReasonWords = { short: string; tone: MovementTone; kind: MovementKind };

const REASONS: Record<StockMovementReason, ReasonWords> = {
  SALE: { short: "Sale", tone: "hollow", kind: "SALES" },
  REFUND: { short: "Refund", tone: "hollow", kind: "SALES" },
  VOID: { short: "Void", tone: "hollow", kind: "SALES" },
  RECEIVED: { short: "Received", tone: "ok", kind: "DELIVERIES" },
  DELIVERY_DIFFERENCE: { short: "Delivery difference", tone: "warn", kind: "DELIVERIES" },
  SUPPLIER_RETURN: { short: "Returned to supplier", tone: "info", kind: "DELIVERIES" },
  // The count's own label is built from its difference and why; see below.
  COUNT: { short: "Count", tone: "warn", kind: "COUNTS" },
  BROKEN: { short: "Broken or spoilt", tone: "warn", kind: "BREAKAGE" },
  OWN_USE: { short: "Own use or gift", tone: "warn", kind: "BREAKAGE" },
  FOUND: { short: "Found more", tone: "ok", kind: "CORRECTIONS" },
  CORRECTION: { short: "Fixed a mistake", tone: "neutral", kind: "CORRECTIONS" },
  OPENING: { short: "Opening stock", tone: "ok", kind: "CORRECTIONS" },
  REVERSAL: { short: "Reversed", tone: "neutral", kind: "CORRECTIONS" },
  PLACE_MOVE: { short: "Moved", tone: "neutral", kind: "CORRECTIONS" },
  TRANSFER_OUT: { short: "Transfer out", tone: "info", kind: "TRANSFERS" },
  TRANSFER_IN: { short: "Transfer in", tone: "info", kind: "TRANSFERS" },
  TRANSFER_BACK: { short: "Back from a transfer", tone: "info", kind: "TRANSFERS" },
  CASE_BROKEN: { short: "Case broken into singles", tone: "neutral", kind: "CASES" },
};

/** The stores module's movements carry no reason; they read by their type. */
const UNREASONED: Record<MovementType, string> = {
  RECEIPT: "Received",
  ISSUE: "Issued",
  ADJUSTMENT: "Adjusted",
  TRANSFER: "Moved",
};

const KIND_LABEL: Record<MovementKind, string> = {
  SALES: "Sales and refunds",
  DELIVERIES: "Deliveries",
  COUNTS: "Counts",
  BREAKAGE: "Breakage and own use",
  CORRECTIONS: "Corrections",
  TRANSFERS: "Transfers",
  CASES: "Cases",
};

/** The Kind filter's groups, in the order the menu lists them, with the reasons in each. */
export const MOVEMENT_KINDS: ReadonlyArray<{ id: MovementKind; label: string; reasons: StockMovementReason[] }> = (
  Object.keys(KIND_LABEL) as MovementKind[]
).map((id) => ({
  id,
  label: KIND_LABEL[id],
  reasons: (Object.keys(REASONS) as StockMovementReason[]).filter((reason) => REASONS[reason].kind === id),
}));

export type MovementForWords = {
  reason: StockMovementReason | null;
  movementType: MovementType;
  /** Signed change to on hand. */
  change: number;
  /** A count line's Why, kept in the movement's notes when the count is approved. */
  why?: CountWhy | null;
  /** A transfer's other site: where it went, or where it came from. */
  otherSite?: string | null;
  /** Where a move between places went. */
  toPlace?: string | null;
  /** The document number ("Back from TRF-0008"). */
  reference?: string | null;
  /** On a reversal, the reason of the movement it put back. */
  reversedReason?: StockMovementReason | null;
};

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function countLabel(movement: MovementForWords): string {
  const units = Math.abs(movement.change);
  const amount = Number.isInteger(units) && units <= 10 ? NUMBER_WORDS[units] : String(units);
  const why =
    movement.why === "BROKEN"
      ? "broken"
      : movement.why === "FOUND"
        ? "found"
        : movement.change < 0
          ? "missing"
          : "extra";
  return `Count, ${amount} ${why}`;
}

/** The Movement cell: "Sale", "Count, two broken", "Transfer to Borrowdale". */
export function movementLabel(movement: MovementForWords, form: "short" | "long"): string {
  const { reason } = movement;
  if (!reason) return UNREASONED[movement.movementType];

  switch (reason) {
    case "COUNT":
      return countLabel(movement);
    case "PLACE_MOVE":
      return movement.toPlace ? `Moved to ${movement.toPlace}` : REASONS.PLACE_MOVE.short;
    case "REVERSAL":
      return form === "long" && movement.reversedReason && movement.reversedReason !== "REVERSAL"
        ? `Reversed: ${REASONS[movement.reversedReason].short.toLowerCase()}`
        : REASONS.REVERSAL.short;
    case "TRANSFER_OUT":
      return form === "long" && movement.otherSite ? `Transfer to ${movement.otherSite}` : REASONS.TRANSFER_OUT.short;
    case "TRANSFER_IN":
      return form === "long" && movement.otherSite ? `Transfer from ${movement.otherSite}` : REASONS.TRANSFER_IN.short;
    case "TRANSFER_BACK":
      return form === "long" && movement.reference ? `Back from ${movement.reference}` : REASONS.TRANSFER_BACK.short;
    default:
      return REASONS[reason].short;
  }
}

export function movementTone(reason: StockMovementReason | null): MovementTone {
  return reason ? REASONS[reason].tone : "hollow";
}

/** The Kind filter group a reason belongs to; the stores module's rows have none. */
export function movementKind(reason: StockMovementReason | null): MovementKind | null {
  return reason ? REASONS[reason].kind : null;
}

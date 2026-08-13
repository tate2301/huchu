/**
 * What to do with the price on a sale that already happened.
 *
 * S-3 (c), closing 0.3(4) of the consolidation plan. `pos/sync` used to persist
 * the device's `unitPrice` verbatim: no catalogue re-check, no manager-override
 * gate, while the online path in `pos/sales/route.ts` enforces both. A stale or
 * tampered device wrote whatever price it liked.
 *
 * ## Why this does not simply reject a mismatch
 *
 * A sale rung up offline at a price the shop has since changed is **not** an
 * error. The bottle store took that money over the counter, gave the customer a
 * slip, and the bottle left the shop. Refusing the replay does not un-take the
 * money — it loses the sale from the books and leaves the stock figure wrong.
 * The till's whole reason for working offline is that the shop keeps trading
 * when the network does not.
 *
 * So the question is not "is this price current" but **"is there an innocent
 * explanation"**, and there are exactly two:
 *
 * 1. **A superseded snapshot.** The shelf price was rewritten *after* the sale
 *    was rung up. A price change cannot reach back in time, so the device was
 *    right and the server is looking at a newer number. Take the device's price
 *    and stamp the sale as priced off a superseded snapshot — which is what
 *    `pricedAt` / `priceListId` exist for.
 * 2. **An override.** The price was changed at the till by somebody entitled to
 *    change it, with a reason. That is the same rule the online path applies:
 *    a user who `canManageRetailTransactions` needs a reason; anybody else
 *    needs a manager's password.
 *
 * If neither holds, the difference is unexplained. Sync cannot check a manager
 * password after the fact — the moment to do that was at the till — so the
 * operation fails and comes back to the device, where a manager can re-post it
 * with a reason. That is a strictly narrower rejection than "prices differ",
 * and it is the only case where money the shop actually took is refused.
 *
 * This module is pure so the rule can be tested without a database or a
 * network. The route supplies the facts; this decides.
 */

/** The same tolerance the online override check uses. Half a cent is not a price change. */
export const REPLAY_PRICE_TOLERANCE = 0.009;

export type ReplayPriceVerdict =
  /** The device and the shelf agree. */
  | "MATCHES"
  /** The shelf price moved after the sale. The device's price stands. */
  | "SUPERSEDED"
  /** Unexplained by the clock, but authorised at the till. */
  | "OVERRIDDEN"
  /** Unexplained and unauthorised. */
  | "UNAUTHORISED";

export type ReplayPriceLineInput = {
  /** For the operator-facing message. */
  itemName: string;
  /** What the device says it charged. Absent means "whatever the shelf says". */
  submittedUnitPrice: number | null | undefined;
  /** What the shelf says now. */
  resolvedUnitPrice: number;
  /** When the row behind `resolvedUnitPrice` was last written. */
  priceChangedAt: Date | null;
};

export type ReplayPriceLineReview = {
  itemName: string;
  verdict: ReplayPriceVerdict;
  /** The price to persist. */
  unitPrice: number;
  submittedUnitPrice: number;
  resolvedUnitPrice: number;
};

export type ReplayPriceReview = {
  lines: ReplayPriceLineReview[];
  /**
   * A note to append to the sale's override reason, or null when every line
   * agreed with the shelf. Written so a manager reading the sale later can see
   * what happened without opening a log.
   */
  overrideNote: string | null;
  /** Set when the replay must be refused. Null means post it. */
  error: string | null;
};

function differs(a: number, b: number) {
  return Math.abs(a - b) > REPLAY_PRICE_TOLERANCE;
}

/**
 * Review every line of a replayed sale.
 *
 * `soldAt` is when the device rang the sale, which the outbox already carries
 * as `offlineCreatedAt` — so supersession can be established without the client
 * echoing anything back. When the device *does* send its snapshot stamp,
 * `snapshotPricedAt` is used instead: it is the sharper fact, because a device
 * can hold a cached price for hours before a sale is rung against it.
 */
export function reviewReplayedPrices(input: {
  lines: ReplayPriceLineInput[];
  soldAt: Date;
  snapshotPricedAt?: Date | null;
  /** Whether the account replaying this may authorise a price change itself. */
  actorCanOverride: boolean;
  /** The reason the till captured, if any. */
  overrideReason: string | null;
}): ReplayPriceReview {
  // The moment the device's prices are known to be at least as new as. A
  // snapshot stamp beats the sale time when present, because a price rewritten
  // between the snapshot and the sale did not reach the device either.
  const knownGoodFrom = input.snapshotPricedAt ?? input.soldAt;

  const lines: ReplayPriceLineReview[] = [];
  const superseded: string[] = [];
  const overridden: string[] = [];
  const unauthorised: string[] = [];

  for (const line of input.lines) {
    const submitted =
      line.submittedUnitPrice == null ? line.resolvedUnitPrice : line.submittedUnitPrice;

    if (!differs(submitted, line.resolvedUnitPrice)) {
      lines.push({
        itemName: line.itemName,
        verdict: "MATCHES",
        // The shelf figure, not the device's: within tolerance they are the
        // same price, and the shelf is the one the books can be reconciled to.
        unitPrice: line.resolvedUnitPrice,
        submittedUnitPrice: submitted,
        resolvedUnitPrice: line.resolvedUnitPrice,
      });
      continue;
    }

    const changedAfterSale =
      line.priceChangedAt !== null && line.priceChangedAt.getTime() > knownGoodFrom.getTime();

    const describe = `${line.itemName} at ${submitted.toFixed(2)} (shelf ${line.resolvedUnitPrice.toFixed(2)})`;

    if (changedAfterSale) {
      superseded.push(describe);
      lines.push({
        itemName: line.itemName,
        verdict: "SUPERSEDED",
        unitPrice: submitted,
        submittedUnitPrice: submitted,
        resolvedUnitPrice: line.resolvedUnitPrice,
      });
      continue;
    }

    if (input.actorCanOverride && input.overrideReason) {
      overridden.push(describe);
      lines.push({
        itemName: line.itemName,
        verdict: "OVERRIDDEN",
        unitPrice: submitted,
        submittedUnitPrice: submitted,
        resolvedUnitPrice: line.resolvedUnitPrice,
      });
      continue;
    }

    unauthorised.push(describe);
    lines.push({
      itemName: line.itemName,
      verdict: "UNAUTHORISED",
      unitPrice: line.resolvedUnitPrice,
      submittedUnitPrice: submitted,
      resolvedUnitPrice: line.resolvedUnitPrice,
    });
  }

  if (unauthorised.length > 0) {
    return {
      lines,
      overrideNote: null,
      error:
        `Replayed price does not match the shelf and carries no approval: ` +
        `${unauthorised.join("; ")}. Re-post with a manager's approval.`,
    };
  }

  const notes: string[] = [];
  if (superseded.length > 0) {
    notes.push(`PRICE_SNAPSHOT_SUPERSEDED: ${superseded.join("; ")}`);
  }
  if (overridden.length > 0) {
    notes.push(`PRICE_OVERRIDE_OFFLINE: ${overridden.join("; ")}`);
  }

  return {
    lines,
    overrideNote: notes.length > 0 ? notes.join(" | ") : null,
    error: null,
  };
}

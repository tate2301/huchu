/**
 * S-3 (c) — what `pos/sync` does with the price on a sale that already happened.
 *
 * `pos/sync/route.ts` persisted the device's `unitPrice` verbatim: no catalogue
 * re-check and no override gate, while the online path enforced both. These are
 * the four answers that replaces it, and the reasoning is in
 * `replay-price-review.ts` — in short, a sale rung up offline against a shelf
 * the shop has since repriced is money the shop actually took, so it is
 * recorded and stamped rather than refused. Only a difference with no innocent
 * explanation is refused, because sync cannot check a manager's password after
 * the fact.
 */

import { describe, expect, it } from "vitest";

import { reviewReplayedPrices } from "./replay-price-review";

const SOLD_AT = new Date("2026-08-13T09:00:00.000Z");
const BEFORE_THE_SALE = new Date("2026-08-01T00:00:00.000Z");
const AFTER_THE_SALE = new Date("2026-08-13T14:30:00.000Z");

function castle(overrides: Partial<Parameters<typeof reviewReplayedPrices>[0]> = {}) {
  return reviewReplayedPrices({
    lines: [
      {
        itemName: "Castle Lager 340ml",
        submittedUnitPrice: 1.2,
        resolvedUnitPrice: 1.2,
        priceChangedAt: BEFORE_THE_SALE,
      },
    ],
    soldAt: SOLD_AT,
    actorCanOverride: false,
    overrideReason: null,
    ...overrides,
  });
}

describe("a replayed price that still matches the shelf", () => {
  it("posts, unstamped", () => {
    const review = castle();

    expect(review.error).toBeNull();
    expect(review.overrideNote).toBeNull();
    expect(review.lines[0].verdict).toBe("MATCHES");
    expect(review.lines[0].unitPrice).toBe(1.2);
  });

  it("treats a sub-cent difference as the same price", () => {
    const review = castle({
      lines: [
        {
          itemName: "Castle Lager 340ml",
          submittedUnitPrice: 1.2049,
          resolvedUnitPrice: 1.2,
          priceChangedAt: BEFORE_THE_SALE,
        },
      ],
    });

    expect(review.lines[0].verdict).toBe("MATCHES");
    // The shelf figure wins a tie, because that is the one the books reconcile to.
    expect(review.lines[0].unitPrice).toBe(1.2);
  });

  it("fills in the shelf price when the device sent none", () => {
    const review = castle({
      lines: [
        {
          itemName: "Castle Lager 340ml",
          submittedUnitPrice: undefined,
          resolvedUnitPrice: 1.2,
          priceChangedAt: BEFORE_THE_SALE,
        },
      ],
    });

    expect(review.lines[0].verdict).toBe("MATCHES");
    expect(review.lines[0].unitPrice).toBe(1.2);
  });
});

describe("a sale priced off a superseded snapshot", () => {
  /**
   * The shop put Castle up from $1.20 to $1.35 at half past two. A sale rung up
   * at nine that morning was priced off the old shelf, and no price change can
   * reach back to it. The customer paid $1.20 and the books must say $1.20.
   */
  it("keeps the price the customer paid and flags it", () => {
    const review = castle({
      lines: [
        {
          itemName: "Castle Lager 340ml",
          submittedUnitPrice: 1.2,
          resolvedUnitPrice: 1.35,
          priceChangedAt: AFTER_THE_SALE,
        },
      ],
    });

    expect(review.error).toBeNull();
    expect(review.lines[0].verdict).toBe("SUPERSEDED");
    expect(review.lines[0].unitPrice).toBe(1.2);
    expect(review.overrideNote).toContain("PRICE_SNAPSHOT_SUPERSEDED");
    expect(review.overrideNote).toContain("Castle Lager 340ml at 1.20 (shelf 1.35)");
  });

  /**
   * The device's own snapshot stamp is sharper than the sale time: a price
   * rewritten between the snapshot and the sale never reached the till either,
   * so a sale rung up *after* the change is still legitimately stale.
   */
  it("believes the device's snapshot stamp over the sale time", () => {
    const review = castle({
      lines: [
        {
          itemName: "Castle Lager 340ml",
          submittedUnitPrice: 1.2,
          resolvedUnitPrice: 1.35,
          // Changed before the sale was rung, but after the till last synced.
          priceChangedAt: new Date("2026-08-13T08:00:00.000Z"),
        },
      ],
      snapshotPricedAt: new Date("2026-08-13T06:00:00.000Z"),
    });

    expect(review.error).toBeNull();
    expect(review.lines[0].verdict).toBe("SUPERSEDED");
    expect(review.lines[0].unitPrice).toBe(1.2);
  });

  it("stamps every affected line, not just the first", () => {
    const review = castle({
      lines: [
        {
          itemName: "Castle Lager 340ml",
          submittedUnitPrice: 1.2,
          resolvedUnitPrice: 1.35,
          priceChangedAt: AFTER_THE_SALE,
        },
        {
          itemName: "Chibuku Scud 1L",
          submittedUnitPrice: 1.1,
          resolvedUnitPrice: 1.1,
          priceChangedAt: BEFORE_THE_SALE,
        },
        {
          itemName: "Coca-Cola 500ml",
          submittedUnitPrice: 0.75,
          resolvedUnitPrice: 0.8,
          priceChangedAt: AFTER_THE_SALE,
        },
      ],
    });

    expect(review.lines.map((line) => line.verdict)).toEqual([
      "SUPERSEDED",
      "MATCHES",
      "SUPERSEDED",
    ]);
    expect(review.overrideNote).toContain("Castle Lager 340ml at 1.20 (shelf 1.35)");
    expect(review.overrideNote).toContain("Coca-Cola 500ml at 0.75 (shelf 0.80)");
    expect(review.error).toBeNull();
  });
});

describe("a difference the clock does not explain", () => {
  /**
   * The shelf has said $1.20 since the first of the month and the device claims
   * it charged 50c. Nobody approved that, and sync has no way to ask a manager
   * for a password now. The operation comes back to the till.
   */
  it("refuses a price nobody authorised", () => {
    const review = castle({
      lines: [
        {
          itemName: "Castle Lager 340ml",
          submittedUnitPrice: 0.5,
          resolvedUnitPrice: 1.2,
          priceChangedAt: BEFORE_THE_SALE,
        },
      ],
    });

    expect(review.lines[0].verdict).toBe("UNAUTHORISED");
    expect(review.error).toContain("Castle Lager 340ml at 0.50 (shelf 1.20)");
    expect(review.error).toContain("manager");
    expect(review.overrideNote).toBeNull();
  });

  it("refuses the whole replay when one line of several is unexplained", () => {
    const review = castle({
      lines: [
        {
          itemName: "Castle Lager 340ml",
          submittedUnitPrice: 1.2,
          resolvedUnitPrice: 1.35,
          priceChangedAt: AFTER_THE_SALE,
        },
        {
          itemName: "Johnnie Walker Black 750ml",
          submittedUnitPrice: 4,
          resolvedUnitPrice: 42,
          priceChangedAt: BEFORE_THE_SALE,
        },
      ],
    });

    expect(review.error).toContain("Johnnie Walker Black 750ml at 4.00 (shelf 42.00)");
    expect(review.error).not.toContain("Castle Lager");
    expect(review.overrideNote).toBeNull();
  });

  /** The online path's rule: a manager needs a reason, and that is enough. */
  it("accepts it from a manager who gave a reason", () => {
    const review = castle({
      lines: [
        {
          itemName: "Castle Lager 340ml",
          submittedUnitPrice: 1,
          resolvedUnitPrice: 1.2,
          priceChangedAt: BEFORE_THE_SALE,
        },
      ],
      actorCanOverride: true,
      overrideReason: "Damaged label, agreed with the customer",
    });

    expect(review.error).toBeNull();
    expect(review.lines[0].verdict).toBe("OVERRIDDEN");
    expect(review.lines[0].unitPrice).toBe(1);
    expect(review.overrideNote).toContain("PRICE_OVERRIDE_OFFLINE");
  });

  it("refuses a manager's price change that came with no reason", () => {
    const review = castle({
      lines: [
        {
          itemName: "Castle Lager 340ml",
          submittedUnitPrice: 1,
          resolvedUnitPrice: 1.2,
          priceChangedAt: BEFORE_THE_SALE,
        },
      ],
      actorCanOverride: true,
      overrideReason: null,
    });

    expect(review.lines[0].verdict).toBe("UNAUTHORISED");
    expect(review.error).not.toBeNull();
  });

  it("refuses a reason offered by somebody who cannot approve one", () => {
    const review = castle({
      lines: [
        {
          itemName: "Castle Lager 340ml",
          submittedUnitPrice: 1,
          resolvedUnitPrice: 1.2,
          priceChangedAt: BEFORE_THE_SALE,
        },
      ],
      actorCanOverride: false,
      overrideReason: "Because I said so",
    });

    expect(review.lines[0].verdict).toBe("UNAUTHORISED");
    expect(review.error).not.toBeNull();
  });
});

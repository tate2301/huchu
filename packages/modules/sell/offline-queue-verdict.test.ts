/**
 * S-7.3 — the queue's verdict mapping.
 *
 * The point of the screen is that "failed" is the wrong word for most of what
 * happens to a queued sale, so the interesting assertions here are the ones about
 * *which* verdict a refusal earns and whether pressing retry could ever help.
 *
 * The price cases are checked against the real message and the real marker
 * `lib/retail/replay-price-review.ts` writes, not against a hand-typed copy of
 * them — a reworded sentence has to fail here rather than quietly retiring a
 * verdict on the screen.
 */

import { describe, expect, it } from "vitest";

import {
  OFFLINE_REPLAY_NOTE_MARKER,
  classifyQueuedSale,
  classifyReplayedSale,
} from "./offline-queue-verdict";
import { reviewReplayedPrices } from "./replay-price-review";

const SOLD_AT = new Date("2026-08-13T18:02:00.000Z");

function queued(overrides: Partial<Parameters<typeof classifyQueuedSale>[0]> = {}) {
  return classifyQueuedSale({
    status: "QUEUED",
    lastError: null,
    retryCount: 0,
    ...overrides,
  });
}

describe("classifyQueuedSale", () => {
  it("says nothing is wrong with a sale that is simply waiting", () => {
    const verdict = queued();
    expect(verdict.kind).toBe("WAITING");
    expect(verdict.action).toBeNull();
  });

  it("puts a sale behind its dependency ahead of everything else", () => {
    // Even a failed one: the reason it failed is very likely the missing shift,
    // and telling the cashier to fetch a manager for that would be wrong.
    const verdict = queued({
      status: "FAILED_BLOCKING",
      lastError: "Open shift not found",
      blockedByOperationId: "op:retail-pos:open-shift:1",
    });
    expect(verdict.kind).toBe("BLOCKED_BY_ANOTHER");
    expect(verdict.retryable).toBe(false);
  });

  it("reads an unexplained replay price off the message the review actually writes", () => {
    // The real refusal, produced by the real rule: a $1.20 shelf price the till
    // rang at $1.00, with the shelf unchanged since before the sale, by somebody
    // who cannot authorise a price.
    const review = reviewReplayedPrices({
      lines: [
        {
          itemName: "Castle Lager 375ml",
          submittedUnitPrice: 1.0,
          resolvedUnitPrice: 1.2,
          priceChangedAt: new Date("2026-08-01T09:00:00.000Z"),
        },
      ],
      soldAt: SOLD_AT,
      snapshotPricedAt: null,
      actorCanOverride: false,
      overrideReason: null,
    });
    expect(review.error).not.toBeNull();

    const verdict = classifyQueuedSale({
      status: "FAILED_BLOCKING",
      lastError: review.error,
      retryCount: 2,
    });

    expect(verdict.kind).toBe("PRICE_UNEXPLAINED");
    expect(verdict.tone).toBe("danger");
    // The whole reason this verdict is separate: retry is not the answer, and a
    // cashier told "failed" will press it until the shift ends.
    expect(verdict.retryable).toBe(false);
    expect(verdict.action).toContain("manager");
  });

  it("separates a discount that nobody approved from a price nobody can explain", () => {
    const verdict = classifyQueuedSale({
      status: "FAILED_BLOCKING",
      lastError: "Manager approval is required for price or discount overrides",
      retryCount: 1,
    });
    expect(verdict.kind).toBe("NEEDS_APPROVAL");
    expect(verdict.retryable).toBe(false);
  });

  it("recognises a closed shift and an item problem", () => {
    expect(
      classifyQueuedSale({ status: "FAILED_BLOCKING", lastError: "Open shift not found", retryCount: 0 })
        .kind,
    ).toBe("SHIFT_CLOSED");
    expect(
      classifyQueuedSale({
        status: "FAILED_BLOCKING",
        lastError: "Insufficient stock for Castle Lager 375ml.",
        retryCount: 0,
      }).kind,
    ).toBe("STOCK");
  });

  it("counts the tries on a connection failure and leaves it alone", () => {
    const verdict = classifyQueuedSale({
      status: "FAILED_RETRYABLE",
      lastError: "Failed to fetch",
      retryCount: 3,
    });
    expect(verdict.kind).toBe("OFFLINE");
    expect(verdict.detail).toContain("3 times");
    expect(verdict.action).toBeNull();
    expect(verdict.retryable).toBe(true);
  });

  it("repeats a refusal it does not recognise rather than inventing one", () => {
    const verdict = classifyQueuedSale({
      status: "FAILED_BLOCKING",
      lastError: "Tendered amount is below the sale total",
      retryCount: 1,
    });
    expect(verdict.kind).toBe("REFUSED");
    expect(verdict.detail).toBe("Tendered amount is below the sale total");
  });
});

describe("classifyReplayedSale", () => {
  const soldAt = SOLD_AT.toISOString();
  const replayNote = `${OFFLINE_REPLAY_NOTE_MARKER}:${soldAt}`;

  it("leaves an ordinary counter sale alone", () => {
    expect(classifyReplayedSale({ notes: "LOYALTY_REDEEM:40" }).kind).toBe("NOT_A_REPLAY");
    expect(classifyReplayedSale({}).kind).toBe("NOT_A_REPLAY");
  });

  it("says what a superseded price did, off the note the review writes", () => {
    // The shelf moved to $1.30 an hour *after* the till rang it at $1.20.
    const review = reviewReplayedPrices({
      lines: [
        {
          itemName: "Castle Lager 375ml",
          submittedUnitPrice: 1.2,
          resolvedUnitPrice: 1.3,
          priceChangedAt: new Date("2026-08-13T19:00:00.000Z"),
        },
      ],
      soldAt: SOLD_AT,
      snapshotPricedAt: null,
      actorCanOverride: false,
      overrideReason: null,
    });
    expect(review.error).toBeNull();

    const verdict = classifyReplayedSale({
      notes: replayNote,
      overrideReason: review.overrideNote,
    });

    expect(verdict.kind).toBe("SUPERSEDED");
    expect(verdict.tone).toBe("warning");
    expect(verdict.soldAt).toBe(soldAt);
  });

  it("distinguishes a price changed at the till from one the shop changed later", () => {
    const review = reviewReplayedPrices({
      lines: [
        {
          itemName: "Chibuku Super 1L",
          submittedUnitPrice: 1.5,
          resolvedUnitPrice: 1.8,
          priceChangedAt: new Date("2026-08-01T09:00:00.000Z"),
        },
      ],
      soldAt: SOLD_AT,
      snapshotPricedAt: null,
      actorCanOverride: true,
      overrideReason: "Damaged label, agreed with the customer",
    });

    const verdict = classifyReplayedSale({
      notes: replayNote,
      overrideReason: review.overrideNote,
    });
    expect(verdict.kind).toBe("OVERRIDDEN");
  });

  it("calls a clean replay synced, and still says when it was rung", () => {
    const verdict = classifyReplayedSale({ notes: replayNote, overrideReason: null });
    expect(verdict.kind).toBe("MATCHED");
    expect(verdict.soldAt).toBe(soldAt);
  });
});

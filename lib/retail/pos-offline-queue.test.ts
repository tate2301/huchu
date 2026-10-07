/**
 * The queue's identity for a sale, across the S-7.7 rename.
 *
 * These two behaviours are worth pinning because getting either wrong loses a
 * cashier's money rather than merely looking wrong: a queued sale is cash
 * already in the drawer that has not reached the server, and the queue is the
 * only record of it.
 */

import { describe, expect, it } from "vitest";

import { queuedSaleLabel, type PosSaleQueuePayload } from "./pos-offline-queue";

/** Only the fields the label reads; the rest of the payload is irrelevant here. */
function payload(fields: Record<string, unknown>) {
  return fields as unknown as PosSaleQueuePayload;
}

describe("what an unsent sale is called", () => {
  it("does not invent a receipt number it does not have", () => {
    // The server allocates the number when the sale lands. Until then there
    // isn't one, and showing the raw key would be worse than the old form.
    const label = queuedSaleLabel(payload({ clientRef: "3f2a1b9c-77d4-4e21-9a10-8c5b2e4f0d6a" }));
    expect(label).toBe("Unsent · 4F0D6A");
    expect(label).not.toContain("3f2a1b9c");
  });

  it("says something rather than nothing when the key is missing", () => {
    expect(queuedSaleLabel(payload({}))).toBe("Unsent sale");
  });
});

import { describe, expect, it } from "vitest";

import { MOVEMENT_KINDS, movementKind, movementLabel, movementTone, type MovementForWords } from "./movement-words";

const words = (movement: Partial<MovementForWords>, form: "short" | "long" = "short") =>
  movementLabel({ reason: null, movementType: "ISSUE", change: -1, ...movement }, form);

describe("a stock movement in the Movement cell's words", () => {
  it("names the everyday reasons as the board does", () => {
    expect(words({ reason: "SALE" })).toBe("Sale");
    expect(words({ reason: "RECEIVED", movementType: "RECEIPT", change: 40 })).toBe("Received");
    expect(words({ reason: "CASE_BROKEN" })).toBe("Case broken into singles");
    expect(words({ reason: "BROKEN", movementType: "ADJUSTMENT", change: -2 })).toBe("Broken or spoilt");
    expect(words({ reason: "OPENING", movementType: "RECEIPT", change: 12 })).toBe("Opening stock");
  });

  it("says how many a count found and why, in words up to ten", () => {
    expect(words({ reason: "COUNT", movementType: "ADJUSTMENT", change: -2, why: "BROKEN" })).toBe("Count, two broken");
    expect(words({ reason: "COUNT", movementType: "ADJUSTMENT", change: 2, why: "FOUND" })).toBe("Count, two found");
    expect(words({ reason: "COUNT", movementType: "ADJUSTMENT", change: -1, why: "NOT_KNOWN" })).toBe("Count, one missing");
    expect(words({ reason: "COUNT", movementType: "ADJUSTMENT", change: 3, why: "NOT_KNOWN" })).toBe("Count, three extra");
    expect(words({ reason: "COUNT", movementType: "ADJUSTMENT", change: -12 })).toBe("Count, 12 missing");
  });

  it("names the other site and the document on the product's own tab only", () => {
    expect(words({ reason: "TRANSFER_OUT", otherSite: "Borrowdale" })).toBe("Transfer out");
    expect(words({ reason: "TRANSFER_OUT", otherSite: "Borrowdale" }, "long")).toBe("Transfer to Borrowdale");
    expect(words({ reason: "TRANSFER_IN", otherSite: "Harare Main Branch" }, "long")).toBe(
      "Transfer from Harare Main Branch",
    );
    expect(words({ reason: "TRANSFER_BACK", reference: "TRF-0008" })).toBe("Back from a transfer");
    expect(words({ reason: "TRANSFER_BACK", reference: "TRF-0008" }, "long")).toBe("Back from TRF-0008");
    expect(words({ reason: "REVERSAL", reversedReason: "BROKEN" })).toBe("Reversed");
    expect(words({ reason: "REVERSAL", reversedReason: "BROKEN" }, "long")).toBe("Reversed: broken or spoilt");
  });

  it("names the place a move between places went to", () => {
    expect(words({ reason: "PLACE_MOVE", movementType: "TRANSFER", change: 0, toPlace: "Back store" })).toBe(
      "Moved to Back store",
    );
  });

  it("reads the stores module's movements by their type", () => {
    expect(words({ movementType: "RECEIPT" })).toBe("Received");
    expect(words({ movementType: "ISSUE" })).toBe("Issued");
    expect(words({ movementType: "ADJUSTMENT" })).toBe("Adjusted");
    expect(words({ movementType: "TRANSFER" })).toBe("Moved");
    expect(movementTone(null)).toBe("hollow");
    expect(movementKind(null)).toBeNull();
  });

  it("tones each reason as the board does", () => {
    expect(movementTone("SALE")).toBe("hollow");
    expect(movementTone("RECEIVED")).toBe("ok");
    expect(movementTone("COUNT")).toBe("warn");
    expect(movementTone("TRANSFER_IN")).toBe("info");
    expect(movementTone("CASE_BROKEN")).toBe("neutral");
  });

  it("puts every reason in exactly one Kind group", () => {
    expect(MOVEMENT_KINDS.map((kind) => kind.label)).toEqual([
      "Sales and refunds",
      "Deliveries",
      "Counts",
      "Breakage and own use",
      "Corrections",
      "Transfers",
      "Cases",
    ]);
    const all = MOVEMENT_KINDS.flatMap((kind) => kind.reasons);
    expect(all).toHaveLength(18);
    expect(new Set(all).size).toBe(18);
    expect(MOVEMENT_KINDS.find((kind) => kind.id === "CORRECTIONS")?.reasons).toEqual([
      "FOUND",
      "CORRECTION",
      "OPENING",
      "REVERSAL",
      "PLACE_MOVE",
    ]);
    expect(movementKind("OWN_USE")).toBe("BREAKAGE");
  });
});

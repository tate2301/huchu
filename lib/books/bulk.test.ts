import { describe, expect, it } from "vitest";

import { bulkWords, eachOf } from "./bulk";

describe("a move on a selection (books-final §5.13)", () => {
  it("does every row it can and skips the rest with why, never stopping at a refusal", async () => {
    const outcome = await eachOf(
      ["REQ-0091", "REQ-0093", "REQ-0092"],
      (row) => row,
      async (row) => {
        if (row === "REQ-0093") throw new Error("Somebody else has to approve your own request.");
      },
      (error) => (error as Error).message,
    );
    expect(outcome.done).toEqual(["REQ-0091", "REQ-0092"]);
    expect(outcome.skipped).toEqual([{ label: "REQ-0093", why: "Somebody else has to approve your own request." }]);
    expect(bulkWords(outcome, "approved", ["requisition", "requisitions"])).toEqual({
      title: "2 requisitions approved",
      description: "Skipped REQ-0093: Somebody else has to approve your own request.",
      ok: true,
    });
  });

  it("names the one it did, and says so when it did nothing", () => {
    expect(bulkWords({ done: ["PAY-0062"], skipped: [] }, "paid", ["payment", "payments"])).toEqual({ title: "PAY-0062 paid", description: undefined, ok: true });
    expect(bulkWords({ done: [], skipped: [{ label: "PAY-0062", why: "It has not been approved." }] }, "paid", ["payment", "payments"]).ok).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { readEventType } from "@/lib/admin/activity";

describe("an event type read aloud", () => {
  it("turns any module's vocabulary into plain lower-case words", () => {
    expect(readEventType("RETAIL_PRICE.CHANGED")).toBe("retail price changed");
    expect(readEventType("schools.fee.invoice.written-off")).toBe("schools fee invoice written off");
    expect(readEventType("gold.import.rolled-back")).toBe("gold import rolled back");
  });
});

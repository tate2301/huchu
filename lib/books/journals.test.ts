import { describe, expect, it } from "vitest";

import { journalRef, journalsFinding, sourceLabel } from "./journals";

describe("journalsFinding", () => {
  it("names the month the drafts hold open", () => {
    expect(journalsFinding([{ month: "September" }, { month: "September" }])).toEqual({
      fact: "2 journals are still in draft.",
      rest: "Both are dated September, so September cannot close until they post.",
    });
    expect(journalsFinding([{ month: "September" }]).rest).toBe("It is dated September, so September cannot close until it posts.");
    expect(journalsFinding([{ month: "August" }, { month: "September" }]).rest).toBe(
      "They are dated August and September, which cannot close until they post.",
    );
    expect(journalsFinding([])).toEqual({ fact: "Every journal is posted.", rest: null });
  });
});

describe("labels", () => {
  it("writes refs and sources the way the list does", () => {
    expect(journalRef(421)).toBe("JE-0421");
    expect(sourceLabel("SALES_INVOICE")).toBe("Sales invoice");
    expect(sourceLabel("MANUAL")).toBe("Manual");
  });
});

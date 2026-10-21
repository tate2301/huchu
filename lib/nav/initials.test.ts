import { describe, expect, it } from "vitest";

import { logoInitials } from "./initials";

describe("logoInitials", () => {
  it("reads the legal name, skipping words in brackets", () => {
    expect(logoInitials("Hurudza Creative (Private) Limited", "Harare Bottle Store")).toBe("HC");
    expect(logoInitials("(Pvt) Delta Beverages Ltd", null)).toBe("DB");
  });

  it("falls back to the trading name", () => {
    expect(logoInitials(null, "Harare Bottle Store")).toBe("HB");
    expect(logoInitials("  ", "Pamela")).toBe("P");
  });

  it("never draws nothing", () => {
    expect(logoInitials(null, null)).toBe("?");
  });
});

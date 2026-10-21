import { describe, expect, it } from "vitest";

import { clock, dayShort, roleWord, whenWord } from "./words";

describe("words", () => {
  it("names roles the way the boards do", () => {
    expect(roleWord({ role: "SALES_REP", isOwner: false, isAdmin: false })).toBe("Field worker");
    expect(roleWord({ role: "SUPERADMIN", isOwner: true, isAdmin: false })).toBe("Owner");
    expect(roleWord({ role: "SUPERADMIN", isOwner: false, isAdmin: true })).toBe("Admin");
  });

  it("tells time in Harare", () => {
    expect(clock(new Date("2026-10-19T09:41:00Z"))).toBe("11:41");
    expect(dayShort(new Date("2026-10-19T09:41:00Z"))).toBe("19 Oct");
  });

  it("gives a clock today and a day before", () => {
    const now = new Date("2026-10-19T12:00:00Z");
    expect(whenWord(new Date("2026-10-19T08:00:00Z"), now)).toBe("10:00");
    expect(whenWord(new Date("2026-10-16T08:00:00Z"), now)).toBe("16 Oct");
  });
});

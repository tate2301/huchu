import { describe, expect, it } from "vitest";

import { formatMoney, formatWhen } from "@/lib/admin/format";

// 14:20 in Harare (UTC+2).
const now = new Date("2026-10-13T12:20:00Z");

describe("how the portal writes a moment", () => {
  it("says today and yesterday by Harare's calendar, not the server's", () => {
    expect(formatWhen(new Date("2026-10-13T12:05:00Z"), now)).toBe("Today 14:05");
    // 23:30 UTC on the 12th is already the 13th in Harare.
    expect(formatWhen(new Date("2026-10-12T23:30:00Z"), now)).toBe("Today 01:30");
    expect(formatWhen(new Date("2026-10-12T15:40:00Z"), now)).toBe("Yesterday 17:40");
  });

  it("drops the time further back, and the year only when it is another year", () => {
    expect(formatWhen(new Date("2026-10-08T08:00:00Z"), now)).toBe("8 Oct");
    expect(formatWhen(new Date("2025-03-12T08:00:00Z"), now)).toBe("12 Mar 2025");
    expect(formatWhen(null, now)).toBeNull();
  });

  it("writes money in dollars with cents", () => {
    expect(formatMoney(758.4)).toBe("$758.40");
    expect(formatMoney("79")).toBe("$79.00");
  });
});

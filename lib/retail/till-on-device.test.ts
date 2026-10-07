import { describe, expect, it } from "vitest";

import { cashDropDue, cashDropSentence, offlineStopSentence, offlineWindowClosed } from "./till-on-device";

describe("the cash drop prompt", () => {
  it("asks once the drawer holds more than the rule allows", () => {
    expect(cashDropDue(500, "500.00")).toBe(false);
    expect(cashDropDue(500.01, "500.00")).toBe(true);
    expect(cashDropDue(0, "0.00")).toBe(false);
    expect(cashDropDue(612.4, "500.00")).toBe(true);
    expect(cashDropSentence(612.4, "500.00", "US$")).toBe(
      "The drawer holds about US$612.40, over the US$500.00 the till rules allow. Move some to the safe.",
    );
  });
});

describe("the offline window", () => {
  const now = new Date("2026-10-06T12:00:00Z").getTime();

  it("stays open while the server answered, and the oldest held sale is, within the window", () => {
    expect(
      offlineWindowClosed({
        offlineHours: 24,
        lastOnlineAt: "2026-10-05T12:30:00Z",
        oldestQueuedAt: "2026-10-05T13:00:00Z",
        now,
      }),
    ).toBe(false);
    expect(offlineWindowClosed({ offlineHours: 24, lastOnlineAt: null, oldestQueuedAt: null, now })).toBe(false);
  });

  it("closes once the last word from the server is older than the window", () => {
    expect(
      offlineWindowClosed({ offlineHours: 24, lastOnlineAt: "2026-10-05T11:59:00Z", oldestQueuedAt: null, now }),
    ).toBe(true);
  });

  it("closes once the oldest sale the till holds is older than the window", () => {
    expect(
      offlineWindowClosed({
        offlineHours: 12,
        lastOnlineAt: "2026-10-06T11:00:00Z",
        oldestQueuedAt: "2026-10-05T23:00:00Z",
        now,
      }),
    ).toBe(true);
    expect(offlineStopSentence(12)).toBe(
      "This till has been offline for more than 12 hours, longer than the till rules allow. Connect it to send what it holds, then sell again.",
    );
  });
});

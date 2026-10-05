import { describe, expect, it } from "vitest";

import { formatDayTime, leftOutNote, onlyWords, sendNote, sentToast, stillToCome, transferState, unitsWords } from "./transfer-words";

const tally = (sent: number, received = 0, lost = 0) => ({ sent, received, lost });

describe("a transfer's state (30-stock 5.12)", () => {
  it("reads as the State column draws it", () => {
    expect(transferState("ON_THE_WAY", tally(540))).toEqual({ label: "On the way", tone: "info" });
    expect(transferState("ON_THE_WAY", tally(10, 8))).toEqual({ label: "Part received, 2 to come", tone: "info" });
    expect(transferState("RECEIVED", tally(8, 8))).toEqual({ label: "Received", tone: "hollow" });
    expect(transferState("RECEIVED", tally(46, 44, 2))).toEqual({ label: "Received, 2 short", tone: "warn" });
    expect(transferState("CANCELLED", tally(540))).toEqual({ label: "Cancelled", tone: "neutral" });
  });

  it("has something to come only while on the way", () => {
    expect(stillToCome("ON_THE_WAY", tally(10, 6, 1))).toBe(3);
    expect(stillToCome("RECEIVED", tally(10, 6))).toBe(0);
    expect(stillToCome("CANCELLED", tally(10))).toBe(0);
  });
});

describe("when it left", () => {
  const now = new Date("2026-10-05T10:00:00+02:00");
  it("says today, yesterday, a day, or a day in another year", () => {
    expect(formatDayTime("2026-10-05T08:30:00+02:00", now)).toBe("Today, 08:30");
    expect(formatDayTime("2026-10-04T17:40:00+02:00", now)).toBe("Yesterday, 17:40");
    expect(formatDayTime("2026-10-01T12:03:00+02:00", now)).toBe("1 Oct, 12:03");
    expect(formatDayTime("2025-09-27T16:20:00+02:00", now)).toBe("27 Sep 2025, 16:20");
  });
});

describe("the sheet's and the toast's words", () => {
  it("are the board's", () => {
    expect(sentToast("TRF-0008", "Borrowdale")).toBe("TRF-0008 sent. Borrowdale will see it to receive.");
    expect(sendNote("Borrowdale")).toBe("It leaves stock here now and arrives when Borrowdale receives it.");
    expect(onlyWords(9, "Harare Main Branch")).toBe("Only 9 at Harare Main Branch.");
    expect(leftOutNote(2, "Borrowdale")).toBe("2 lines were not at Borrowdale and were left out.");
    expect(leftOutNote(1, "Borrowdale")).toBe("1 line was not at Borrowdale and was left out.");
    expect(unitsWords(540)).toBe("540 units");
    expect(unitsWords(1)).toBe("1 unit");
  });
});

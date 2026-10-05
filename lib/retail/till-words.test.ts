import { describe, expect, it } from "vitest";

import {
  codeShown,
  deviceWords,
  lastSaleWords,
  lastSeenWords,
  offlineFor,
  pairedWords,
  planLimitSentence,
  siteHint,
  suggestTillName,
  tillState,
  tillSub,
  unpairShiftOpen,
} from "./till-words";

/** The TillsList board at 11:42 in Harare. */
const now = new Date("2026-10-05T09:42:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000);

describe("a till's state (10-setup 4.3), first match wins", () => {
  it("reads the board's five tills", () => {
    // Front till: CounterMini seen now, Chipo's shift open.
    expect(tillState({ device: { kind: "COUNTER_MINI", lastSeenAt: now }, shiftOpen: true }, now)).toEqual({ state: "SELLING", label: "Selling" });
    // Back till: a browser seen four minutes ago, a shift open.
    expect(tillState({ device: { kind: "BROWSER", lastSeenAt: ago(4) }, shiftOpen: true }, now).state).toBe("SELLING");
    // Handheld 1: a Kora switched off last night with no shift is simply closed.
    expect(tillState({ device: { kind: "KORA", lastSeenAt: ago(14 * 60) }, shiftOpen: false }, now)).toEqual({ state: "CLOSED", label: "Closed" });
    // Borrowdale till: a CounterMini stays on all day, so two silent hours is offline.
    expect(tillState({ device: { kind: "COUNTER_MINI", lastSeenAt: ago(123) }, shiftOpen: false }, now)).toEqual({
      state: "OFFLINE",
      label: "Offline 2 hours",
    });
    // Cold room till: no device.
    expect(tillState({ device: null, shiftOpen: false }, now)).toEqual({ state: "NOT_PAIRED", label: "Not paired" });
  });

  it("counts a device with a shift open and silent past five minutes as offline, whatever it is", () => {
    expect(tillState({ device: { kind: "KORA", lastSeenAt: ago(6) }, shiftOpen: true }, now)).toEqual({ state: "OFFLINE", label: "Offline 6 minutes" });
    expect(tillState({ device: { kind: "BROWSER", lastSeenAt: ago(5) }, shiftOpen: true }, now).state).toBe("SELLING");
    expect(tillState({ device: { kind: "BROWSER", lastSeenAt: null }, shiftOpen: true }, now)).toEqual({ state: "OFFLINE", label: "Offline" });
  });

  it("says how long, rounded down, singular for one", () => {
    expect(offlineFor(60 * 60 * 1000)).toBe("1 hour");
    expect(offlineFor(119 * 60 * 1000)).toBe("1 hour");
    expect(offlineFor(30 * 1000)).toBe("1 minute");
    expect(offlineFor(3 * 24 * 60 * 60 * 1000 + 5)).toBe("3 days");
  });
});

describe("tills in words", () => {
  it("names what runs the till", () => {
    expect(deviceWords({ kind: "COUNTER_MINI", label: null })).toBe("CounterMini");
    expect(deviceWords({ kind: "KORA", label: null })).toBe("Kora");
    expect(deviceWords({ kind: "BROWSER", label: "Windows PC" })).toBe("Browser, Windows PC");
    expect(deviceWords(null)).toBe("No device yet");
  });

  it("writes the sheet's sub line", () => {
    expect(tillSub("Harare Main Branch", "CounterMini", { state: "SELLING", label: "Selling" })).toBe("Harare Main Branch · CounterMini · selling now");
    expect(tillSub("Borrowdale", "CounterMini", { state: "OFFLINE", label: "Offline 2 hours" })).toBe("Borrowdale · CounterMini · offline 2 hours");
    expect(tillSub("Harare Main Branch", null, { state: "NOT_PAIRED", label: "Not paired" })).toBe("Harare Main Branch · not paired");
  });

  it("dates the last sale and the last call", () => {
    expect(lastSaleWords(ago(0), now)).toBe("Today, 11:42");
    expect(lastSaleWords(new Date("2026-10-04T19:50:00Z"), now)).toBe("Yesterday, 21:50");
    expect(lastSaleWords(new Date("2026-10-02T12:05:00Z"), now)).toBe("2 October, 14:05");
    expect(lastSeenWords(ago(1), "4.12.0", now)).toBe("Now, version 4.12.0");
    expect(lastSeenWords(ago(4), "4.12.0", now)).toBe("11:38, version 4.12.0");
    expect(lastSeenWords(new Date("2026-10-04T19:55:00Z"), null, now)).toBe("Yesterday, 21:55");
    expect(pairedWords(new Date("2026-08-02T07:20:00Z"), "Tafara Nyathi")).toBe("2 August 2026 by Tafara Nyathi");
  });

  it("shows the code as the sheet draws it", () => {
    expect(codeShown("482917")).toBe("4 8 2 – 9 1 7");
    expect(codeShown("048217")).toBe("0 4 8 – 2 1 7");
  });

  it("words the refusals and the hints", () => {
    expect(planLimitSentence("Grow", 8)).toBe("Your Grow plan has 8 tills, all paired.");
    expect(planLimitSentence("Fiscal", 1)).toBe("Your Fiscal plan has 1 till, all paired.");
    expect(unpairShiftOpen("Front till", "Chipo Dube")).toBe("Close Chipo Dube’s shift on Front till first.");
    expect(siteHint(2)).toBe("Only asked because you have two sites.");
    expect(suggestTillName(["Front till", "Back till", "Till 3"])).toBe("Till 4");
  });
});

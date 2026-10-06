import { describe, expect, it } from "vitest";


import {
  lastInWord,
  personState,
  personSub,
  phoneDisplay,
  phoneSearchText,
  pinState,
  pinText,
  sitesLabel,
  spacedPin,
} from "./words";

/**
 * What Staff and PINs says about a person (80-admin 4.1, 5.1, 5.3), in
 * Africa/Harare. "Now" is 3 October 2026, 14:00 there (12:00 UTC).
 */

const NOW = new Date("2026-10-03T12:00:00Z");
const at = (iso: string) => new Date(iso);

const pin = (over: Partial<NonNullable<Parameters<typeof pinText>[0]>> = {}) => ({
  failedAttempts: 0,
  lockedAt: null,
  mustChange: false,
  issuedAt: at("2026-10-02T08:00:00Z"),
  lastUnlockedAt: null,
  ...over,
});

describe("a phone", () => {
  it("reads as the board groups it", () => {
    expect(phoneDisplay("+263719027713")).toBe("+263 71 902 7713");
    expect(phoneDisplay("+263774120098")).toBe("+263 77 412 0098");
    expect(phoneDisplay(null)).toBe("");
  });

  it("is found as shown, by its digits, and in its local forms", () => {
    const text = phoneSearchText("+263775510921");
    for (const typed of ["+263 77 551", "0921", "263775510921", "077 551 0921", "0775510921"]) {
      expect(text).toContain(typed);
    }
    expect(phoneSearchText(null)).toBe("");
  });
});

describe("sites", () => {
  it("is All sites, or the names", () => {
    expect(sitesLabel({ all: true, names: [] })).toBe("All sites");
    expect(sitesLabel({ all: false, names: ["Borrowdale", "Harare Main Branch"] })).toBe("Borrowdale, Harare Main Branch");
  });
});

describe("the till PIN", () => {
  it("is locked from the fifth wrong try until a new one is sent", () => {
    const locked = pin({ failedAttempts: 5, lockedAt: at("2026-10-03T11:55:00Z") });
    expect(pinState(locked)).toBe("LOCKED");
    expect(pinText(locked, NOW)).toBe("Locked today at 13:55 after 5 wrong tries");
  });

  it("says when it was last used, or that a sent one is not used yet", () => {
    expect(pinText(pin({ lastUnlockedAt: at("2026-10-03T05:58:00Z") }), NOW)).toBe("Set. Last used today at 07:58.");
    expect(pinText(pin({ lastUnlockedAt: at("2026-10-02T19:40:00Z") }), NOW)).toBe("Set. Last used yesterday at 21:40.");
    expect(pinState(pin({ mustChange: true }))).toBe("NEW");
    expect(pinText(pin({ mustChange: true }), NOW)).toBe("Sent 2 Oct. Not used yet.");
    expect(pinText(null, NOW)).toBe("No PIN yet.");
  });

  it("went with their access", () => {
    expect(pinText(null, NOW, at("2026-10-01T07:00:00Z"))).toBe("Removed with their access on 1 October.");
  });
});

describe("Last in", () => {
  const base = { isViewer: false, state: "ACTIVE" as const, invitedAt: null, lastSeenAt: null, pinUsedAt: null, now: NOW };

  it("is Now for the viewer and anyone seen in the last five minutes", () => {
    expect(lastInWord({ ...base, isViewer: true })).toBe("Now");
    expect(lastInWord({ ...base, lastSeenAt: at("2026-10-03T11:57:00Z") })).toBe("Now");
  });

  it("is Selling now while their PIN opened a till in the last half hour", () => {
    expect(lastInWord({ ...base, pinUsedAt: at("2026-10-03T11:56:00Z"), lastSeenAt: at("2026-10-03T11:56:00Z") })).toBe(
      "Selling now",
    );
  });

  it("is the time today, Yesterday, else the day", () => {
    expect(lastInWord({ ...base, lastSeenAt: at("2026-10-03T10:31:00Z") })).toBe("Today 12:31");
    expect(lastInWord({ ...base, lastSeenAt: at("2026-10-02T19:40:00Z") })).toBe("Yesterday");
    expect(lastInWord({ ...base, lastSeenAt: at("2026-09-28T09:00:00Z") })).toBe("28 Sep");
    expect(lastInWord(base)).toBe("Never");
  });

  it("is the day they were invited while the invite waits", () => {
    expect(lastInWord({ ...base, state: "INVITED", invitedAt: at("2026-10-02T08:00:00Z") })).toBe("Invited 2 Oct");
  });
});

describe("the state", () => {
  it("is no access first, then a waiting invite, then a locked PIN", () => {
    const invite = { acceptedAt: null, expiresAt: at("2026-10-09T08:00:00Z") };
    expect(personState({ isActive: false, invite, pin: "LOCKED", now: NOW })).toBe("NO_ACCESS");
    expect(personState({ isActive: true, invite, pin: "LOCKED", now: NOW })).toBe("INVITED");
    expect(personState({ isActive: true, invite: { ...invite, expiresAt: at("2026-10-01T00:00:00Z") }, pin: "NONE", now: NOW })).toBe(
      "INVITE_EXPIRED",
    );
    expect(personState({ isActive: true, invite: { ...invite, acceptedAt: NOW }, pin: "LOCKED", now: NOW })).toBe("PIN_LOCKED");
    expect(personState({ isActive: true, invite: null, pin: "SET", now: NOW })).toBe("ACTIVE");
  });
});

describe("the sheet's sub", () => {
  const sub = (over: Partial<Parameters<typeof personSub>[0]>) =>
    personSub({ role: "CASHIER", sites: "Borrowdale", state: "ACTIVE", pin: "SET", invitedAt: null, removedAt: null, ...over });

  it("says the role, the sites and the PIN or state", () => {
    expect(sub({ state: "PIN_LOCKED", pin: "LOCKED" })).toBe("Cashier · Borrowdale · PIN locked after 5 tries");
    expect(sub({ role: "MANAGER", sites: "Harare Main Branch" })).toBe("Manager · Harare Main Branch · PIN set");
    expect(sub({ role: "BOOKKEEPER", sites: "All sites", state: "INVITED", pin: "NONE", invitedAt: at("2026-10-02T08:00:00Z") })).toBe(
      "Bookkeeper · All sites · Invited 2 Oct",
    );
    expect(sub({ role: "STOCK_CLERK", sites: "All sites", state: "NO_ACCESS", removedAt: at("2026-10-01T08:00:00Z") })).toBe(
      "Stock clerk · All sites · No access since 1 Oct",
    );
    expect(sub({ role: "OWNER", sites: "All sites", pin: "NONE" })).toBe("Owner · All sites · No till PIN");
  });
});

describe("a PIN read aloud", () => {
  it("is spaced", () => {
    expect(spacedPin("4829")).toBe("4 8 2 9");
  });
});

import { describe, expect, it } from "vitest";

import {
  badCodeSentence,
  deviceKindFromShell,
  deviceLabelFromUserAgent,
  lockedSentence,
  pairedFootnote,
  personChip,
  shiftElsewhereSentence,
  unpairedSaleVerdict,
  unpairedSentence,
  wrongPinSentence,
} from "./device-words";

describe("what a device is", () => {
  it("reads the kiosk shell's header, else it is a browser", () => {
    expect(deviceKindFromShell("countermini")).toBe("COUNTER_MINI");
    expect(deviceKindFromShell("Kora")).toBe("KORA");
    expect(deviceKindFromShell(null)).toBe("BROWSER");
    expect(deviceKindFromShell("something")).toBe("BROWSER");
  });

  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36", "Windows PC"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15", "Mac"],
    ["Mozilla/5.0 (X11; CrOS x86_64 15917.71.0) AppleWebKit/537.36 Chrome/128.0 Safari/537.36", "Chromebook"],
    ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/128.0 Safari/537.36", "Linux PC"],
    ["Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 Chrome/128.0 Safari/537.36", "Android tablet"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36", "Android phone"],
    ["Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", "iPad"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", "iPhone"],
  ])("labels %s as %s", (ua, label) => {
    expect(deviceLabelFromUserAgent(ua)).toBe(label);
  });

  it("has no label for an agent it does not know", () => {
    expect(deviceLabelFromUserAgent("curl/8.0")).toBeNull();
    expect(deviceLabelFromUserAgent(null)).toBeNull();
  });
});

describe("the device screens' sentences", () => {
  it("counts the tries left on a wrong code or PIN", () => {
    expect(badCodeSentence(4)).toBe("That code did not work. 4 tries left.");
    expect(badCodeSentence(1)).toBe("That code did not work. 1 try left.");
    expect(wrongPinSentence(3)).toBe("Wrong PIN. 3 tries left.");
  });

  it("says when a locked device may try again, in Harare time", () => {
    expect(lockedSentence(new Date("2026-10-05T12:17:00Z"))).toBe("Too many tries. Try again at 14:17.");
  });

  it("names a person on a chip by first name and initial", () => {
    expect(personChip("Chipo Dube")).toBe("Chipo D.");
    expect(personChip("Kuda Tinashe Banda")).toBe("Kuda B.");
    expect(personChip("Farai")).toBe("Farai");
  });

  it("says who paired the till and when, the year only when it is not this one", () => {
    const now = new Date("2026-10-05T10:00:00Z");
    expect(pairedFootnote(new Date("2026-08-02T07:20:00Z"), "Tafara Nyathi", now)).toBe("Paired 2 August by Tafara Nyathi.");
    expect(pairedFootnote(new Date("2025-08-02T07:20:00Z"), "Tafara Nyathi", now)).toBe("Paired 2 August 2025 by Tafara Nyathi.");
  });

  it("tells an unpaired device who did it, when, and what it sent", () => {
    const at = new Date("2026-10-05T12:02:00Z");
    expect(unpairedSentence({ by: "Tafara Nyathi", at, reason: "REPLACED", tillName: "Back till", sent: 3 })).toBe(
      "Tafara Nyathi paired another device to Back till at 14:02. The 3 sales this one held offline were sent.",
    );
    expect(unpairedSentence({ by: "Tendai Mhlanga", at, reason: "UNPAIRED", tillName: "Test till", sent: 0 })).toBe(
      "Tendai Mhlanga unpaired Test till at 14:02.",
    );
    expect(unpairedSentence({ by: "Tendai Mhlanga", at, reason: "UNPAIRED", tillName: "Test till", sent: 1 })).toBe(
      "Tendai Mhlanga unpaired Test till at 14:02. The 1 sale this one held offline was sent.",
    );
  });

  it("refuses a second shift on another till by naming it", () => {
    expect(shiftElsewhereSentence("Front till")).toBe("Close your shift on Front till first.");
  });
});

describe("offline sales from a device that was unpaired (W-76)", () => {
  const unpairedAt = new Date("2026-10-05T12:00:00Z");

  it("takes everything from a device still paired", () => {
    expect(unpairedSaleVerdict({ unpairedAt: null, soldAt: new Date() })).toBe("accept");
  });

  it("takes, flagged, what it sold up to the moment it was unpaired", () => {
    expect(unpairedSaleVerdict({ unpairedAt, soldAt: new Date("2026-10-05T11:59:00Z") })).toBe("flag");
    expect(unpairedSaleVerdict({ unpairedAt, soldAt: unpairedAt })).toBe("flag");
  });

  it("refuses what it sold after", () => {
    expect(unpairedSaleVerdict({ unpairedAt, soldAt: new Date("2026-10-05T12:00:01Z") })).toBe("refuse");
  });
});

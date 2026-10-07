import { describe, expect, it } from "vitest";

import {
  cleanSiteCode,
  countWord,
  placeCode,
  placesWords,
  siteNewNote,
  siteSub,
  suggestSiteCode,
  zimbabwePhone,
} from "./site-words";

/** The words of Setup › Sites, as the boards write them. */
describe("site words", () => {
  it("writes the places as the list does", () => {
    expect(placesWords(["Shop floor", "Back store", "Cold room"])).toBe("Shop floor, back store, cold room");
    expect(placesWords(["Shop floor"])).toBe("Shop floor");
  });

  it("suggests a free short code from the name, and codes a place from its first word", () => {
    expect(suggestSiteCode("Avondale", ["HRE", "BDL"])).toBe("AVO");
    expect(suggestSiteCode("Avondale", ["AVO"])).toBe("AVO2");
    expect(suggestSiteCode("A", [])).toBe("");
    expect(cleanSiteCode(" avd ")).toBe("AVD");
    expect(placeCode("Shop floor", [])).toBe("SHOP");
    expect(placeCode("Cold room", ["COLD"])).toBe("COLD2");
    expect(placeCode("Walk-in fridge", [])).toBe("WALKIN");
  });

  it("reads a Zimbabwe landline or mobile in one shape", () => {
    expect(zimbabwePhone("+263 24 270 5521")).toBe("+263 24 270 5521");
    expect(zimbabwePhone("0242334410")).toBe("+263 24 233 4410");
    expect(zimbabwePhone("263774120098")).toBe("+263 77 412 0098");
    expect(zimbabwePhone("+27 11 555 0101")).toBeNull();
    expect(zimbabwePhone("12345")).toBeNull();
  });

  it("says what the edit sheet's sub says", () => {
    expect(siteSub({ isDefault: true, tills: 3, stockValue: 41280 })).toBe("Default site · 3 tills · US$41,280.00 in stock");
    expect(siteSub({ isDefault: false, tills: 1, stockValue: 12904.5 })).toBe("1 till · US$12,904.50 in stock");
    expect(siteSub({ isDefault: false, tills: 1, stockValue: null })).toBe("1 till");
  });

  it("says how much room the plan has", () => {
    expect(siteNewNote({ name: "Grow", maxSites: 3, openSites: 2 })).toBe(
      "Then pair its tills. Your Grow plan has room for one more site.",
    );
    expect(siteNewNote({ name: "Scale", maxSites: 25, openSites: 2 })).toBe(
      "Then pair its tills. Your Scale plan has room for 23 more sites.",
    );
    expect(siteNewNote({ name: "Grow", maxSites: 3, openSites: 3 })).toBe("Your Grow plan has no room for another site.");
    expect(siteNewNote(null)).toBe("Then pair its tills.");
    expect(countWord(2)).toBe("two");
  });
});

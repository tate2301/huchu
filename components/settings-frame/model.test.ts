import { describe, expect, it } from "vitest";

import { companyPage } from "@/lib/retail/settings-pages/company";
import { paymentsPage } from "@/lib/retail/settings-pages/payments";

import { canChangeField, changedValues, checkBeforeSave, cleanLine, shownSettingsSections, splitChanges } from "./model";
import { changesNotSaved } from "./save-bar";

const SAVED = {
  businessType: "Liquor store",
  casesAndSingles: true,
  weekdayHours: "08:00 to 22:00",
  tradingName: "Harare Bottle Store",
};

describe("a settings page's state", () => {
  it("counts only the fields the page changes that differ from what is saved", () => {
    expect(changedValues(companyPage, SAVED, { ...SAVED, casesAndSingles: false })).toEqual({ casesAndSingles: false });
    expect(changedValues(companyPage, SAVED, { ...SAVED, tradingName: "Other" })).toEqual({});
    expect(changesNotSaved(1)).toBe("1 change not saved");
    expect(changesNotSaved(2)).toBe("2 changes not saved");
  });

  it("hides Liquor store features while the business type is General retail", () => {
    const titles = (businessType: string) =>
      shownSettingsSections(companyPage, { businessType }).map((section) => section.title);
    expect(titles("Liquor store")).toEqual(["Business type", "Liquor store features", "The business", "Money"]);
    expect(titles("General retail")).toEqual(["Business type", "The business", "Money"]);
  });

  it("checks the hours before sending", () => {
    expect(checkBeforeSave(companyPage, { weekdayHours: "eight till ten" })).toEqual({
      weekdayHours: "Write it as 08:00 to 22:00.",
    });
  });

  it("says who last changed it, that it just saved, or who may", () => {
    const now = new Date("2026-10-05T10:00:00Z");
    const lastChanged = { by: "Tendai Mhlanga", at: "2026-10-02T12:40:00Z" };
    expect(cleanLine({ page: companyPage, canEdit: true, lastChanged, savedAt: null, now })).toBe(
      "Last changed by Tendai Mhlanga, 2 October.",
    );
    expect(
      cleanLine({ page: companyPage, canEdit: true, lastChanged: { ...lastChanged, at: "2025-12-30T10:00:00Z" }, savedAt: null, now }),
    ).toBe("Last changed by Tendai Mhlanga, 30 December 2025.");
    expect(cleanLine({ page: companyPage, canEdit: true, lastChanged, savedAt: now.getTime() - 5_000, now })).toBe(
      "Saved just now.",
    );
    expect(cleanLine({ page: companyPage, canEdit: true, lastChanged, savedAt: now.getTime() - 61_000, now })).toBe(
      "Last changed by Tendai Mhlanga, 2 October.",
    );
    expect(cleanLine({ page: companyPage, canEdit: true, lastChanged: null, savedAt: null, now })).toBeNull();
    expect(cleanLine({ page: companyPage, canEdit: false, lastChanged, savedAt: null, now })).toBe(
      "Owners only. Every change shows in Activity with who made it.",
    );
  });

  it("sends the rate to its own action, and lets the manager change only that", () => {
    expect(splitChanges(paymentsPage, { zigRate: "27.10", innbucks: true })).toEqual({
      action: { zigRate: "27.10" },
      settings: { innbucks: true },
    });
    const manager = { canEdit: false, canAct: true };
    const owner = { canEdit: true, canAct: true };
    expect(canChangeField(paymentsPage, manager, "zigRate")).toBe(true);
    expect(canChangeField(paymentsPage, manager, "innbucks")).toBe(false);
    expect(canChangeField(paymentsPage, owner, "innbucks")).toBe(true);
    expect(canChangeField(paymentsPage, { canEdit: false, canAct: false }, "zigRate")).toBe(false);
  });
});

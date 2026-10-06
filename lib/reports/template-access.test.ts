import { describe, expect, it } from "vitest";

import { canChangeTemplate, canSaveTemplates, canSeeTemplate, canShareWith, paramsToKeep } from "./template-access";
import type { ReportParam } from "./types";

/** 70-insights-reports 3.3 (INS-07): the same rules for both products. */
const owner = { id: "u-tendai", role: "SUPERADMIN" };
const tafara = { id: "u-tafara", role: "MANAGER" };
const shopManager = { id: "u-shop", role: "SHOP_MANAGER" };
const bookkeeper = { id: "u-ruvimbo", role: "FINANCE_OFFICER" };
const cashier = { id: "u-chipo", role: "CASHIER" };

const tendaisShared = { audience: "MANAGERS" as const, createdById: owner.id };
const tafarasOwn = { audience: "JUST_ME" as const, createdById: tafara.id };
const tafarasShared = { audience: "EVERYONE" as const, createdById: tafara.id };

describe("who sees a template", () => {
  it("shows Just me only to whoever made it", () => {
    expect(canSeeTemplate(tafarasOwn, tafara)).toBe(true);
    expect(canSeeTemplate(tafarasOwn, owner)).toBe(false);
    expect(canSeeTemplate(tafarasOwn, bookkeeper)).toBe(false);
  });

  it("counts the owner, managers, shop managers and the bookkeeper as Managers, never a cashier", () => {
    for (const person of [owner, tafara, shopManager, bookkeeper]) expect(canSeeTemplate(tendaisShared, person)).toBe(true);
    expect(canSeeTemplate(tendaisShared, cashier)).toBe(false);
  });

  it("shows Everyone to anyone; Reports itself is checked by the caller", () => {
    expect(canSeeTemplate(tafarasShared, cashier)).toBe(true);
  });

  it("shows a built-in by its audience alone: it has no maker", () => {
    expect(canSeeTemplate({ audience: "MANAGERS", createdById: null }, bookkeeper)).toBe(true);
    expect(canSeeTemplate({ audience: "MANAGERS", createdById: null }, cashier)).toBe(false);
  });
});

describe("who changes a template (W-75)", () => {
  it("lets the maker change their own, shared or not", () => {
    expect(canChangeTemplate(tafarasOwn, tafara)).toBe(true);
    expect(canChangeTemplate(tafarasShared, tafara)).toBe(true);
  });

  it("lets the owner change Tendai's shared template and Tafara's shared one, never her Just me one", () => {
    expect(canChangeTemplate(tendaisShared, owner)).toBe(true);
    expect(canChangeTemplate(tafarasShared, owner)).toBe(true);
    expect(canChangeTemplate(tafarasOwn, owner)).toBe(false);
  });

  it("does not let another manager change it: Tafara cannot change Tendai's", () => {
    expect(canChangeTemplate(tendaisShared, tafara)).toBe(false);
    expect(canChangeTemplate(tafarasShared, shopManager)).toBe(false);
    expect(canChangeTemplate(tafarasShared, bookkeeper)).toBe(false);
  });

  it("lets nobody change a built-in", () => {
    expect(canChangeTemplate({ audience: "EVERYONE", createdById: null }, owner)).toBe(false);
  });
});

describe("who saves retail templates (W-73)", () => {
  it("is the owner's and the managers', from the matrix", () => {
    expect(canSaveTemplates("SUPERADMIN")).toBe(true);
    expect(canSaveTemplates("MANAGER")).toBe(true);
    expect(canSaveTemplates("SHOP_MANAGER")).toBe(true);
    expect(canSaveTemplates("FINANCE_OFFICER")).toBe(false);
    expect(canSaveTemplates("CASHIER")).toBe(false);
  });
});

describe("who shares a generic template", () => {
  it("lets anyone keep one for themselves and only managers share", () => {
    expect(canShareWith("JUST_ME", "CASHIER")).toBe(true);
    expect(canShareWith("MANAGERS", "CASHIER")).toBe(false);
    expect(canShareWith("EVERYONE", "MANAGER")).toBe(true);
  });
});

describe("what a template keeps", () => {
  const declared: ReportParam[] = [
    { key: "from", label: "From", type: "date", default: "monthStart" },
    { key: "to", label: "To", type: "date", default: "today" },
    { key: "site", label: "Shop", type: "choice", options: [{ value: "a", label: "A" }] },
  ];
  const shown = { from: "2026-10-01", to: "2026-10-03", site: "a", stray: "x" };

  it("keeps the choices and lets the dates move with today", () => {
    expect(paramsToKeep(declared, shown, false)).toEqual({ site: "a" });
  });

  it("keeps the dates when asked to", () => {
    expect(paramsToKeep(declared, shown, true)).toEqual({ from: "2026-10-01", to: "2026-10-03", site: "a" });
  });
});

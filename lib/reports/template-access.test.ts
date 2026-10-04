import { describe, expect, it } from "vitest";

import { canChangeTemplate, canSeeTemplate, canShareWith, paramsToKeep } from "./template-access";
import type { ReportParam } from "./types";

const maker = { id: "u-maker", role: "CASHIER" };
const manager = { id: "u-manager", role: "MANAGER" };
const clerk = { id: "u-clerk", role: "CLERK" };

describe("who sees a template", () => {
  it("shows a private template only to whoever made it", () => {
    const template = { audience: "JUST_ME" as const, createdById: maker.id };
    expect(canSeeTemplate(template, maker)).toBe(true);
    expect(canSeeTemplate(template, manager)).toBe(false);
    expect(canSeeTemplate(template, clerk)).toBe(false);
  });

  it("shows a managers' template to managers and its maker", () => {
    const template = { audience: "MANAGERS" as const, createdById: maker.id };
    expect(canSeeTemplate(template, maker)).toBe(true);
    expect(canSeeTemplate(template, manager)).toBe(true);
    expect(canSeeTemplate(template, clerk)).toBe(false);
  });

  it("shows an everyone template to everyone", () => {
    expect(canSeeTemplate({ audience: "EVERYONE", createdById: maker.id }, clerk)).toBe(true);
  });
});

describe("who changes a template", () => {
  it("lets the maker change their own, shared or not", () => {
    expect(canChangeTemplate({ audience: "JUST_ME", createdById: maker.id }, maker)).toBe(true);
    expect(canChangeTemplate({ audience: "EVERYONE", createdById: maker.id }, maker)).toBe(true);
  });

  it("lets a manager change a shared template but never a private one", () => {
    expect(canChangeTemplate({ audience: "EVERYONE", createdById: maker.id }, manager)).toBe(true);
    expect(canChangeTemplate({ audience: "JUST_ME", createdById: maker.id }, manager)).toBe(false);
  });

  it("does not let someone else who can see it change it", () => {
    expect(canChangeTemplate({ audience: "EVERYONE", createdById: maker.id }, clerk)).toBe(false);
  });
});

describe("who shares a template", () => {
  it("lets anyone keep one for themselves and only managers share", () => {
    expect(canShareWith("JUST_ME", "CASHIER")).toBe(true);
    expect(canShareWith("MANAGERS", "CASHIER")).toBe(false);
    expect(canShareWith("EVERYONE", "CASHIER")).toBe(false);
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

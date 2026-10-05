import { describe, expect, it } from "vitest";
import { z } from "zod";

import { FLOOR_SHEETS } from "@/lib/retail/sheet-kinds/floor";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import type { SheetCtx, SheetKind } from "@/lib/workspace/sheet-kind";

import { checkValues, discardAsk, initialValues, isDirty, lineTotals, shownSections, submitFailure } from "./model";

const ctxFor = (role: string, name = "Tafara Nyathi"): SheetCtx => ({
  params: new URLSearchParams("sheet=shift-open"),
  id: null,
  user: { id: "u-1", name, role },
  can: (resource, action) => canRetailRoleDo(role, resource, action),
});

const shiftOpen = FLOOR_SHEETS["shift-open"]!;

describe("the shift-open sheet's rules", () => {
  it("starts with the signed-in seller as the cashier and nothing else filled", () => {
    expect(initialValues(shiftOpen, ctxFor("MANAGER"))).toEqual({
      till: null,
      who: { id: "u-1", label: "Tafara Nyathi" },
      float: "",
    });
  });

  it("says which required fields are empty, in order, with the float's own rule", () => {
    const ctx = ctxFor("MANAGER");
    const values = initialValues(shiftOpen, ctx);
    expect(checkValues(shiftOpen, values, ctx)).toEqual({
      till: "Till is needed.",
      float: "Opening float is needed.",
    });
    expect(checkValues(shiftOpen, { ...values, till: { id: "t", label: "Back till" }, float: "1.234" }, ctx)).toEqual({
      float: "Give the float as an amount, like 100.00.",
    });
  });

  it("fixes the cashier to a cashier opening their own, and never checks it", () => {
    const ctx = ctxFor("CASHIER", "Chipo Dube");
    const values = initialValues(shiftOpen, ctx);
    expect(values.who).toEqual({ id: "u-1", label: "Chipo Dube" });
    expect(Object.keys(checkValues(shiftOpen, { ...values, who: null }, ctx))).not.toContain("who");
  });

  it("asks before throwing typing away", () => {
    expect(discardAsk("Open a shift")).toEqual({
      title: "Discard this open a shift?",
      body: "What you typed is not saved.",
      keep: "Keep editing",
      go: "Discard",
      fill: "bad",
    });
    const start = initialValues(shiftOpen, ctxFor("MANAGER"));
    expect(isDirty(start, { ...start })).toBe(false);
    expect(isDirty(start, { ...start, float: "25" })).toBe(true);
  });
});

describe("a refused submit", () => {
  const ids = ["till", "who", "float"];
  it("puts field messages under their fields", () => {
    expect(submitFailure(400, { error: "x", fieldErrors: { who: "Tendai Sibanda cannot sell at a till." } }, ids)).toEqual({
      fieldErrors: { who: "Tendai Sibanda cannot sell at a till." },
      footer: null,
    });
  });
  it("puts anything else in the footer as a sentence", () => {
    expect(submitFailure(409, { error: "Back till already has an open shift." }, ids)).toEqual({
      fieldErrors: {},
      footer: "Back till already has an open shift.",
    });
    expect(submitFailure(403, { error: "Your role cannot change shifts and cash" }, ids).footer).toBe(
      "Your role cannot change shifts and cash.",
    );
  });
});

describe("sections and lines", () => {
  const kind: SheetKind = {
    title: "T",
    sub: "S",
    cur: "US$",
    note: "",
    done: "",
    primary: "Go",
    invalidate: [],
    requires: [],
    submit: () => ({ method: "POST", url: "/" }),
    sections: [
      { fields: [{ id: "how", t: "seg", l: "How", o: ["Cash", "Account"], v: "Cash" }] },
      { when: ["how", "Account"], fields: [{ id: "account", t: "text", l: "Account", schema: z.string().min(3, "Too short.") }] },
      { fold: ["More details", "Notes"], fields: [{ id: "note", t: "area", l: "Note", opt: true }] },
    ],
  };
  it("shows a conditional section only while its field has its value", () => {
    const ctx = ctxFor("MANAGER");
    expect(shownSections(kind, { how: "Cash" })).toHaveLength(2);
    expect(shownSections(kind, { how: "Account" })).toHaveLength(3);
    expect(checkValues(kind, { how: "Cash", note: "" }, ctx)).toEqual({});
    expect(checkValues(kind, { how: "Account", account: "ab" }, ctx)).toEqual({ account: "Too short." });
  });
  it("totals lines as you type", () => {
    expect(
      lineTotals([
        { productId: "a", name: "A", sub: null, quantity: "24", cost: "0.58" },
        { productId: "b", name: "B", sub: null, quantity: "2", cost: "10" },
      ]),
    ).toEqual({ count: 2, quantity: 26, value: 33.92 });
  });
});

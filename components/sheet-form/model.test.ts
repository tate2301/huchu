import { describe, expect, it } from "vitest";
import { z } from "zod";

import { FLOOR_SHEETS } from "@/lib/retail/sheet-kinds/floor";
import { PRODUCT_SHEETS } from "@/lib/retail/sheet-kinds/products";
import { SETUP_SHEETS } from "@/lib/retail/sheet-kinds/setup";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { addDays, formatDay, todayIn } from "@/lib/workspace/format";
import type { SheetCtx, SheetKind } from "@/lib/workspace/sheet-kind";

import {
  checkValues,
  discardAsk,
  doneSentence,
  initialValues,
  isDirty,
  lineTotals,
  neededMessage,
  sheetText,
  shownSections,
  submitFailure,
  withDerived,
} from "./model";

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
      zig: "",
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

describe("sheets that load what they draw (PRD-02)", () => {
  const kind: SheetKind = {
    title: (_ctx, values) => String(values._name ?? ""),
    sub: "Products › Categories",
    cur: "US$",
    sections: [
      { fields: [{ id: "name", t: "text", l: "Name" }, { id: "returnable", t: "text", l: "Deposit", show: (values) => values._deposits === true }] },
      { title: "Deleting", forDanger: true, show: (_values, ctx) => ctx.can("retail.categories", "delete"), fields: [{ id: "moveTo", t: "auto", l: "Move to" }] },
    ],
    note: "",
    primary: "Save",
    done: (result, values) => `${String(values._name)} saved as ${(result as { name: string }).name}.`,
    submit: () => ({ method: "PATCH", url: "/x" }),
    invalidate: [],
    requires: [],
  };

  it("titles from what was loaded, shows sections by role, and leaves danger-only fields out of Save", () => {
    const owner = ctxFor("SUPERADMIN");
    const manager = ctxFor("MANAGER");
    expect(sheetText(kind.title, owner, { _name: "Spirits" })).toBe("Spirits");
    expect(shownSections(kind, {}, owner)).toHaveLength(2);
    expect(shownSections(kind, {}, manager)).toHaveLength(1);
    // Deposit is hidden without deposits, so not needed; Move to belongs to Delete, not Save.
    expect(checkValues(kind, { name: "", returnable: "", moveTo: null }, owner)).toEqual({ name: "Name is needed." });
    expect(checkValues(kind, { name: "Gin", returnable: "", moveTo: null, _deposits: true }, owner)).toEqual({
      returnable: "Deposit is needed.",
    });
    expect(doneSentence(kind, { name: "Spirits" }, { _name: "Spirits" })).toBe("Spirits saved as Spirits.");
    expect(discardAsk("Spirits", { record: true }).title).toBe("Discard changes to Spirits?");
  });

  it("puts a 409's field message under its field", () => {
    expect(
      submitFailure(409, { error: "x", fieldErrors: { name: "There is already a category called Mixers." } }, ["name"]),
    ).toEqual({ fieldErrors: { name: "There is already a category called Mixers." }, footer: null });
  });
});

describe("the labels sheet (PRD-06)", () => {
  const labels = PRODUCT_SHEETS.labels!;
  const on = { price: true, was: true, barcode: true, copies: "1", _products: 4 };

  it("cannot print with neither a price nor a barcode, or more than 2,000 labels", () => {
    expect(labels.primaryDisabled?.(on)).toBe(false);
    expect(labels.primaryDisabled?.({ ...on, price: false, was: true, barcode: false })).toBe(true);
    expect(labels.note).toBeTypeOf("function");
    const note = labels.note as (values: typeof on) => string;
    expect(note({ ...on, price: false, barcode: false })).toBe("Show at least a price or a barcode.");
    expect(labels.primaryDisabled?.({ ...on, price: false })).toBe(false);
    expect(labels.primaryDisabled?.({ ...on, _products: 41, copies: "50" })).toBe(true);
    expect(note({ ...on, _products: 41, copies: "50" })).toBe("Print at most 2,000 labels at a time: tick fewer products or lower the copies.");
    expect(labels.primaryDisabled?.({ ...on, _products: 40, copies: "50" })).toBe(false);
    expect(note(on)).toBe("Prices changing tonight print with tomorrow’s price.");
  });
});

describe("the category sheets (PRD-02)", () => {
  const owner = ctxFor("SUPERADMIN");
  const loaded = { name: "Wine", vat: "15%", margin: "", ageCheck: true, returnable: false, moveTo: null, _name: "Wine", _children: 0 };

  it("asks for a target margin on a new category only; elsewhere empty means none", () => {
    const fresh = { ...initialValues(PRODUCT_SHEETS["category-new"]!, owner), name: "Mixers" };
    expect(checkValues(PRODUCT_SHEETS["category-new"]!, fresh, owner)).toEqual({ margin: "Target margin is needed." });
    expect(checkValues(PRODUCT_SHEETS["category-edit"]!, { ...loaded, _products: 1, _filed: 1 }, owner)).toEqual({});
    expect(checkValues(PRODUCT_SHEETS["category-margin"]!, { margin: "" }, owner)).toEqual({});
    expect(checkValues(PRODUCT_SHEETS["category-edit"]!, { ...loaded, margin: "120%" }, owner)).toEqual({
      margin: "Write the target margin as a percentage under 100, like 30%.",
    });
  });

  it("offers the move whenever something is filed under it, binned products included", () => {
    const edit = PRODUCT_SHEETS["category-edit"]!;
    const remove = PRODUCT_SHEETS["category-delete"]!;
    const binnedOnly = { ...loaded, _products: 0, _filed: 1 };
    expect(shownSections(edit, binnedOnly, owner).map((section) => section.title ?? "")).toEqual(["", "Deleting"]);
    expect(shownSections(remove, binnedOnly, owner)).toHaveLength(1);
    expect(shownSections(edit, { ...loaded, _products: 0, _filed: 0, _children: 1 }, owner)).toHaveLength(2);

    const empty = { ...loaded, _products: 0, _filed: 0 };
    expect(shownSections(edit, empty, owner)).toHaveLength(1);
    expect(shownSections(remove, empty, owner)).toHaveLength(0);
    expect(typeof remove.guide === "function" ? remove.guide(empty) : remove.guide).toBe(
      "Nothing is filed under Wine, so nothing moves.",
    );
    expect(typeof remove.guide === "function" ? remove.guide(binnedOnly) : remove.guide).toBe("");
    expect(remove.primaryTone).toBe("danger");
  });
});

describe("the Sites sheets (SET-02)", () => {
  const siteNew = SETUP_SHEETS["site-new"]!;
  const site = SETUP_SHEETS.site!;
  const owner = ctxFor("SUPERADMIN", "Tendai Mhlanga");

  it("suggests a short code from the name until the person types one", () => {
    const start = initialValues(siteNew, owner);
    expect(start.places).toEqual(["Shop floor"]);
    expect(start.stock).toBe("Start empty");
    const named = withDerived(siteNew, { ...start, name: "Avondale", _takenCodes: ["HRE", "BDL"] });
    expect(named.code).toBe("AVO");
    expect(withDerived(siteNew, { ...named, code: "AVD", name: "Avondale East" }, new Set(["code"])).code).toBe("AVD");
  });

  it("says the plan's room in the note and holds the primary when there is none", () => {
    const note = (plan: unknown) => (typeof siteNew.note === "function" ? siteNew.note({ _plan: plan }) : siteNew.note);
    expect(note({ name: "Grow", maxSites: 3, openSites: 2 })).toBe("Then pair its tills. Your Grow plan has room for one more site.");
    expect(note({ name: "Grow", maxSites: 3, openSites: 3 })).toBe("Your Grow plan has no room for another site.");
    expect(siteNew.primaryDisabled?.({ _plan: { name: "Grow", maxSites: 3, openSites: 3 } })).toBe(true);
    expect(siteNew.noteLink?.({ _plan: { name: "Grow", maxSites: 3, openSites: 3 } })?.label).toBe("Plan and billing");
    expect(siteNew.primaryDisabled?.({ _plan: null })).toBe(false);
  });

  it("offers Move some from the default site only when there is one, and opens the transfer after", () => {
    const stock = siteNew.sections[2]!.fields.find((field) => field.id === "stock")!;
    const options = (values: Record<string, unknown>) => (typeof stock.o === "function" ? stock.o(values) : stock.o);
    expect(options({ _from: null })).toEqual(["Start empty"]);
    expect(options({ _from: { id: "hre", name: "Harare Main Branch" } })).toEqual(["Start empty", "Move some from Harare Main Branch"]);
    const result = { id: "avd", name: "Avondale" };
    expect(siteNew.next?.(result, { stock: "Start empty", _from: { id: "hre", name: "Harare Main Branch" } })).toBeNull();
    expect(siteNew.next?.(result, { stock: "Move some from Harare Main Branch", _from: { id: "hre", name: "Harare Main Branch" } })).toBe(
      "/retail/stock/transfers?sheet=transfer-new&from=hre&to=avd",
    );
    expect(doneSentence(siteNew, result)).toBe("Avondale added. Pair its tills next.");
    expect(siteNew.openLabel).toBe("Pair a till");
  });

  it("keeps known places by id, warns when the default is switched off, and reads only for a stock clerk", () => {
    const values = {
      name: "Harare Main Branch",
      code: "hre",
      phone: "",
      address: "14 Samora Machel Avenue, Harare",
      isDefault: false,
      places: ["Shop floor", "Cold room"],
      priceListId: { id: "list", label: "Retail" },
      openingHours: "",
      _isDefault: true,
      _places: [
        { id: "shop", name: "Shop floor", hasStock: true },
        { id: "back", name: "Back store", hasStock: true },
      ],
    };
    const request = site.submit(values, { ...owner, id: "hre" })!;
    expect(request).toMatchObject({ method: "PATCH", url: "/api/v2/retail/sites/hre" });
    expect(request.body).toMatchObject({
      code: "HRE",
      phone: null,
      places: [{ id: "shop", name: "Shop floor" }, { name: "Cold room" }],
      priceListId: "list",
      isDefault: false,
    });
    const toggle = site.sections[0]!.fields.find((field) => field.id === "isDefault")!;
    expect(typeof toggle.h === "function" && toggle.h(values)).toBe("Make another site the default instead.");
    expect(typeof toggle.warn === "function" && toggle.warn(values)).toBe(true);
    expect(site.readOnly?.(ctxFor("STOCK_CLERK"), {})).toBe(true);
    expect(site.readOnly?.(ctxFor("MANAGER"), {})).toBe(false);
    expect(site.readOnly?.(ctxFor("MANAGER"), { _closed: true })).toBe(true);
    expect(site.danger?.show?.(ctxFor("MANAGER"), { _name: "Borrowdale" })).toBe(false);
    expect(site.danger?.show?.(owner, { _name: "Borrowdale", _isDefault: false })).toBe(true);
    expect(site.danger?.show?.(owner, { _name: "Harare Main Branch", _isDefault: true })).toBe(false);
  });
});

describe("a date field", () => {
  const dated: SheetKind = {
    title: "Expected",
    sub: "",
    sections: [
      {
        fields: [
          { id: "expected", t: "date", l: "Expected", earliest: "today" },
          { id: "opens", t: "datetime", l: "Opens", opt: true, latest: "2026-12-31" },
        ],
      },
    ],
    cur: "US$",
    note: "",
    done: "Saved",
    primary: "Save",
    submit: (values) => ({ method: "PATCH", url: "/x", body: { expectedDate: values.expected, opensAt: values.opens } }),
    invalidate: [],
    requires: [],
  };
  const ctx = ctxFor("MANAGER");
  const today = todayIn();

  it("starts empty and asks for a date when required", () => {
    const values = initialValues(dated, ctx);
    expect(values).toEqual({ expected: null, opens: null });
    expect(checkValues(dated, values, ctx)).toEqual({ expected: "Choose a date." });
  });

  it("refuses a day outside its bounds in words", () => {
    const yesterday = addDays(today, -1);
    expect(checkValues(dated, { expected: yesterday, opens: null }, ctx)).toEqual({
      expected: `Choose a day from ${formatDay(today)}.`,
    });
    expect(checkValues(dated, { expected: today, opens: "2027-01-01T09:00" }, ctx)).toEqual({
      opens: "Choose a day up to 31 December 2026.",
    });
  });

  it("sends the day as it was picked", () => {
    const values = { expected: "2026-10-07", opens: "2026-10-07T09:30" };
    expect(dated.submit(values, ctx)?.body).toEqual({ expectedDate: "2026-10-07", opensAt: "2026-10-07T09:30" });
  });

  it("asks for a date and time when a required datetime is empty", () => {
    expect(neededMessage("Opens", { t: "datetime" })).toBe("Choose a date and time.");
  });
});

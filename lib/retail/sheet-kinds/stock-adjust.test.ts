import { describe, expect, it } from "vitest";

import { doneSentence, fieldIds, shownSections } from "@/components/sheet-form/model";
import type { SheetCtx, SheetValues } from "@/lib/workspace/sheet-kind";

import { caseThen, plannedValue, STOCK_ADJUST_SHEETS } from "./stock-adjust";

const adjust = STOCK_ADJUST_SHEETS["stock-adjust"]!;
const caseBreak = STOCK_ADJUST_SHEETS["case-break"]!;
const ctx = (role: string, can: (resource: string, action: string) => boolean): SheetCtx => ({
  params: new URLSearchParams({ productId: "p-amarula" }),
  id: null,
  user: { id: "u", name: "Tendai Sibanda", role },
  can: can as SheetCtx["can"],
});
const clerk = ctx("STOCK_CLERK", (resource, action) => resource === "retail.adjustments" && action === "create");
const loaded: SheetValues = {
  _name: "Amarula Cream 750ml",
  _onHand: 13,
  _site: "Harare Main Branch",
  _siteCount: 2,
  _cost: 13.03,
  _pinOver: "50.00",
  _canApprove: false,
  why: "Broken or spoilt",
  n: "2",
};

describe("Adjust stock (W-23, board StockAdjust)", () => {
  it("reads the board's title, sub and note, and asks for adjust rights", () => {
    expect(adjust.requires).toEqual([["retail.adjustments", "create"]]);
    expect(typeof adjust.sub === "function" && adjust.sub(clerk, loaded)).toBe("Amarula Cream 750ml · 13 on hand at Harare Main Branch");
    expect(typeof adjust.sub === "function" && adjust.sub(clerk, { ...loaded, _siteCount: 1 })).toBe("Amarula Cream 750ml · 13 on hand");
    expect(typeof adjust.note === "function" && adjust.note(loaded)).toBe("Over US$50.00 needs a manager PIN. Every adjustment shows in Activity.");
    expect(fieldIds(adjust)).toEqual(["siteId", "why", "n", "atCost", "note", "photoUrl", "approver", "pin"]);
  });

  it("values the change at cost, setting on hand for a mistake", () => {
    expect(plannedValue(loaded)).toBe(26.06);
    expect(plannedValue({ ...loaded, why: "Fix a mistake", n: "11" })).toBe(26.06);
    expect(plannedValue({ ...loaded, n: "" })).toBe(0);
  });

  it("shows the manager's approval over the limit, or once the server asks, never to an approver", () => {
    const titles = (values: SheetValues, c = clerk) => shownSections(adjust, values, c).map((section) => section.title ?? null);
    expect(titles(loaded)).toEqual([null]);
    expect(titles({ ...loaded, n: "4" })).toEqual([null, "Manager’s approval"]);
    expect(titles({ ...loaded, ...adjust.onRefused!({ needsApprover: true, reason: "Over US$50.00 needs a manager PIN." }, loaded) })).toEqual([
      null,
      "Manager’s approval",
    ]);
    expect(titles({ ...loaded, n: "4", _canApprove: true })).toEqual([null]);
  });

  it("sends the reason, and the approver only while asked", () => {
    const body = (values: SheetValues) => (adjust.submit(values, clerk)!.body as Record<string, unknown>);
    expect(body({ ...loaded, note: "Dropped." })).toMatchObject({ productId: "p-amarula", why: "BROKEN", n: "2", note: "Dropped." });
    expect(body({ ...loaded, n: "4", approver: { id: "tafara", label: "Tafara Nyathi" }, pin: "2468" }).approver).toEqual({ userId: "tafara", pin: "2468" });
    expect(body({ ...loaded, approver: { id: "tafara", label: "Tafara Nyathi" }, pin: "2468" }).approver).toBeUndefined();
    expect(doneSentence(adjust, {}, loaded, { message: "2 off Amarula Cream 750ml. 11 left." })).toBe("2 off Amarula Cream 750ml. 11 left.");
  });
});

describe("Break a case (W-26, board BreakCase)", () => {
  it("says what happens, and names its button by the count", () => {
    expect(caseThen({ _caseOnHand: 4, _singleOnHand: 2, _packSize: 24, cases: "1" })).toBe("Cases 4 → 3, singles 2 → 26");
    expect(typeof caseBreak.primary === "function" && caseBreak.primary({ cases: "1" })).toBe("Break 1 case");
    expect(typeof caseBreak.primary === "function" && caseBreak.primary({ cases: "2" })).toBe("Break 2 cases");
    expect(typeof caseBreak.sub === "function" && caseBreak.sub(clerk, { caseProductId: null })).toBe("Pick a case");
    expect(caseBreak.submit({ caseProductId: { id: "case", label: "Castle" }, _siteId: "hre", cases: "1" }, clerk)!.body).toEqual({
      caseProductId: "case",
      siteId: "hre",
      cases: 1,
    });
  });
});

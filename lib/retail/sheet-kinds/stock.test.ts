import { describe, expect, it } from "vitest";

import { checkValues, doneSentence, lineErrorsOf, submitFailure, fieldIds } from "@/components/sheet-form/model";
import type { SheetCtx, SheetValues } from "@/lib/workspace/sheet-kind";

import { STOCK_SHEETS } from "./stock";

const kind = STOCK_SHEETS["transfer-new"]!;
const ctx: SheetCtx = {
  params: new URLSearchParams(),
  id: null,
  user: { id: "u", name: "Tafara Nyathi", role: "MANAGER" },
  can: () => true,
};
const hre = { id: "hre", label: "Harare Main Branch", sub: "Default" };
const bdl = { id: "bdl", label: "Borrowdale", sub: null };
const jameson = { productId: "line-j", name: "Jameson Irish Whiskey 750ml", sub: "9 at Harare Main Branch", quantity: "4", cost: "22.15", of: "p-j" };

describe("Move stock (30-stock 5.13)", () => {
  it("is the board's wide sheet, and only for those who may send", () => {
    expect(kind).toMatchObject({ title: "Move stock", sub: "Stock › Transfers", wide: true, primary: "Send" });
    expect(kind.requires).toEqual([["retail.transfers", "create"]]);
    expect(fieldIds(kind)).toEqual(["from", "to", "lines", "who", "when"]);
    expect(kind.sections.map((section) => section.title ?? null)).toEqual([null, "What goes", "On the way"]);
  });

  it("asks for every field before it sends", () => {
    expect(checkValues(kind, { from: hre, to: null, lines: [], who: null, when: "" }, ctx)).toEqual({
      to: "To is needed.",
      lines: "What goes is needed.",
      who: "Taken by is needed.",
      when: "Arrives is needed.",
    });
  });

  it("sends the stock lines with how many, and says where it is going", () => {
    const values: SheetValues = { from: hre, to: bdl, lines: [jameson], who: { id: "farai", label: "Farai Moyo" }, when: " Today, by 11:00 " };
    expect(kind.submit(values, ctx)).toEqual({
      method: "POST",
      url: "/api/v2/retail/stock/transfers",
      body: {
        fromSiteId: "hre",
        toSiteId: "bdl",
        lines: [{ lineId: "line-j", quantity: "4" }],
        takenById: "farai",
        arrives: "Today, by 11:00",
      },
    });
    expect(typeof kind.note === "function" && kind.note(values)).toBe("It leaves stock here now and arrives when Borrowdale receives it.");
    expect(typeof kind.note === "function" && kind.note({ ...values, _leftOut: 2, _leftOutAt: "Borrowdale" })).toBe(
      "2 lines were not at Borrowdale and were left out.",
    );
    const sent = { id: "t8", transferNo: "TRF-0008", units: 540, to: { id: "bdl", name: "Borrowdale" } };
    expect(doneSentence(kind, sent)).toBe("TRF-0008 sent. Borrowdale will see it to receive.");
    expect(kind.open?.(sent)).toBe("/retail/stock/transfers/t8");
  });

  it("shows a line's refusal on that line", () => {
    const failure = submitFailure(400, { error: "Only 9 at Harare Main Branch.", fieldErrors: { "lines.0": "Only 9 at Harare Main Branch.", to: "Pick a different site." } }, fieldIds(kind));
    expect(failure).toEqual({ fieldErrors: { "lines.0": "Only 9 at Harare Main Branch.", to: "Pick a different site." }, footer: null });
    expect(lineErrorsOf("lines", failure.fieldErrors)).toEqual({ 0: "Only 9 at Harare Main Branch." });
  });
});

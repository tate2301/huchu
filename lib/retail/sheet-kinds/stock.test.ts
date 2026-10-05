import { describe, expect, it } from "vitest";

import { checkValues, doneSentence, lineErrorsOf, submitFailure, fieldIds } from "@/components/sheet-form/model";
import type { SheetCtx, SheetValues } from "@/lib/workspace/sheet-kind";

import { siteHoldingMost, STOCK_SHEETS } from "./stock";

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
    expect(kind.sections[1]!.fields[0]).toMatchObject({ t: "lines", noun: "stock-line", p: "Add a product: search or scan" });
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

  it("leaves from the site most of the ticked lines are at, the default site on a tie", () => {
    const at = (...sites: string[]) => sites.map((siteId) => ({ siteId }));
    expect(siteHoldingMost(at("hre", "hre", "bdl"), "hre")).toBe("hre");
    expect(siteHoldingMost(at("bdl", "hre", "hre"), "bdl")).toBe("hre");
    expect(siteHoldingMost(at("bdl", "hre"), "hre")).toBe("hre");
    expect(siteHoldingMost(at("bdl", "hre"), "avd")).toBe("bdl");
    expect(siteHoldingMost([], "hre")).toBeNull();
  });
});

describe("Receive a transfer (30-stock 5.15)", () => {
  const receive = STOCK_SHEETS["transfer-receive"]!;
  const values = (fanta: string): SheetValues => ({
    _transferNo: "TRF-0008",
    _sub: "From Harare Main Branch · sent today 08:30 by Tafara Nyathi",
    _from: "Harare Main Branch",
    _to: "Borrowdale",
    _toCome: { "line-c": 240, "line-f": 60 },
    lines: [
      { productId: "line-c", name: "Castle Lager 340ml", sub: "240 sent", quantity: "240", cost: "0.86" },
      { productId: "line-f", name: "Fanta Orange 500ml", sub: "60 sent", quantity: fanta, cost: "0.76" },
    ],
    short: "Lost on the way",
  });
  const rctx: SheetCtx = { ...ctx, id: "t-8" };

  it("is the board's wide sheet, titled by the transfer, with no add row", () => {
    expect(typeof receive.title === "function" && receive.title(rctx, values("60"))).toBe("Receive TRF-0008");
    expect(typeof receive.sub === "function" && receive.sub(rctx, values("60"))).toBe("From Harare Main Branch · sent today 08:30 by Tafara Nyathi");
    expect(receive).toMatchObject({ wide: true, primary: "Receive" });
    expect(receive.sections[0]!.fields[0]).toMatchObject({ t: "lines", ql: "Came", cl: "Cost", closed: true });
    expect(typeof receive.note === "function" && receive.note(values("60"))).toBe("Received stock is on sale at Borrowdale at once.");
    expect(receive.requires).toEqual([["retail.transfers", "update"]]);
  });

  it("says what is short, warns on that line, and asks only then what became of it", () => {
    const field = receive.sections[0]!.fields[0]!;
    const hint = (v: SheetValues) => (typeof field.h === "function" ? field.h(v) : field.h);
    expect(hint(values("60"))).toBe("");
    expect(receive.sections[1]!.show!(values("60"), rctx)).toBe(false);
    expect(hint(values("58"))).toBe("2 × Fanta Orange 500ml short. They go back on Harare Main Branch’s stock unless you mark them lost.");
    expect(receive.sections[1]!.show!(values("58"), rctx)).toBe(true);
    const fanta = (values("58").lines as Array<{ productId: string; quantity: string }>)[1]!;
    expect(field.lineWarn!(fanta as never, values("58"))).toBe(true);
  });

  it("sends each line's figure and what is short", () => {
    expect(receive.submit({ ...values("58"), short: "Still coming" }, rctx)).toEqual({
      method: "POST",
      url: "/api/v2/retail/stock/transfers/t-8/receive",
      body: { lines: [{ id: "line-c", received: "240" }, { id: "line-f", received: "58" }], short: "STILL_COMING" },
    });
    expect(doneSentence(receive, { message: "TRF-0008 received at Borrowdale. 2 × Fanta Orange 500ml written off." }, {})).toBe(
      "TRF-0008 received at Borrowdale. 2 × Fanta Orange 500ml written off.",
    );
  });
});

describe("Change the lines (30-stock 5.16)", () => {
  const lines = STOCK_SHEETS["transfer-lines"]!;
  const v: SheetValues = { _transferNo: "TRF-0008", _from: "Harare Main Branch", _to: "Borrowdale", from: "Harare Main Branch", to: "Borrowdale", lines: [jameson] };

  it("reads From and To, keeps the lines, and saves the new figures", () => {
    expect(lines).toMatchObject({ title: "Change the lines", primary: "Save" });
    expect(typeof lines.sub === "function" && lines.sub(ctx, v)).toBe("TRF-0008 · Harare Main Branch to Borrowdale");
    expect(lines.sections[0]!.fields.map((field) => field.t)).toEqual(["read", "read"]);
    expect(lines.sections.some((section) => section.title === "On the way")).toBe(false);
    expect(typeof lines.note === "function" && lines.note(v)).toBe("Changes leave or come back to Harare Main Branch’s stock now.");
    expect(lines.submit(v, { ...ctx, id: "t-8" })).toEqual({
      method: "PUT",
      url: "/api/v2/retail/stock/transfers/t-8/lines",
      body: { lines: [{ lineId: "line-j", quantity: "4" }] },
    });
  });
});

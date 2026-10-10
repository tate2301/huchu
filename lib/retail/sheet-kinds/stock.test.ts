import { afterEach, describe, expect, it, vi } from "vitest";

import { checkValues, doneSentence, lineErrorsOf, submitFailure, fieldIds } from "@/components/sheet-form/model";
import type { SheetCtx, SheetValues } from "@/lib/workspace/sheet-kind";

import { recomputeLevels, siteHoldingMost, STOCK_SHEETS } from "./stock";

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
    expect(kind.open?.(sent, values)).toBe("/retail/stock/transfers/t8");
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

describe("Change reorder levels (30-stock 5.3, W-21)", () => {
  const reorder = STOCK_SHEETS["reorder-levels"]!;
  const facts = {
    "line-jw": { perDay: 2, leadDays: 2, caseSize: null },
    "line-am": { perDay: 2, leadDays: 2, caseSize: null },
    "line-ca": { perDay: 30, leadDays: 2, caseSize: 24 },
  };
  const line = (productId: string, quantity: string, touched = false) => ({ productId, name: productId, sub: null, quantity, cost: "1.00", touched });
  const values = (more: SheetValues): SheetValues => ({
    set: "From what sells",
    keep: "14 days",
    round: "Whole cases",
    oneLevel: "",
    _facts: facts,
    levels: [line("line-jw", "12"), line("line-am", "40", true), line("line-ca", "96")],
    ...more,
  });
  const levels = (out: SheetValues) => (out.levels as Array<{ productId: string; quantity: string }>).map((row) => [row.productId, row.quantity]);

  it("is the board's wide sheet, for those who may change stock levels", () => {
    expect(reorder.wide).toBe(true);
    expect(reorder.requires).toEqual([["retail.stock", "update"]]);
    expect(typeof reorder.sub === "function" ? reorder.sub(ctx, { _ticked: 4 }) : reorder.sub).toBe("4 products ticked");
    expect(typeof reorder.sub === "function" ? reorder.sub(ctx, { _ticked: 1 }) : reorder.sub).toBe("1 product ticked");
  });

  it("works each line out from what sells, leaving a level typed by hand alone", () => {
    expect(levels(recomputeLevels(values({})))).toEqual([
      ["line-jw", "32"],
      ["line-am", "40"],
      ["line-ca", "480"],
    ]);
    expect(levels(recomputeLevels(values({ round: "Singles", keep: "13" })))).toEqual([
      ["line-jw", "30"],
      ["line-am", "40"],
      ["line-ca", "450"],
    ]);
  });

  it("gives every untyped line the one number, and waits while Keep enough for is not a number of days", () => {
    expect(levels(recomputeLevels(values({ set: "One number for all", oneLevel: "24" })))).toEqual([
      ["line-jw", "24"],
      ["line-am", "40"],
      ["line-ca", "24"],
    ]);
    expect(levels(recomputeLevels(values({ keep: "a while" })))).toEqual([
      ["line-jw", "12"],
      ["line-am", "40"],
      ["line-ca", "96"],
    ]);
  });

  describe("opened on ticked lines", () => {
    const reorderLine = (lineId: string, siteId: string, unitCost: number | null) => ({
      lineId,
      productId: `p-${lineId}`,
      product: lineId,
      siteId,
      site: siteId,
      unit: "bottle",
      perDay: 2,
      reorderAt: 12,
      unitCost,
      leadDays: 2,
      caseSize: null,
    });
    const open = async (lines: ReturnType<typeof reorderLine>[]) => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: lines, keepDays: 14 }), { status: 200 })));
      const loaded = await reorder.load!({ ...ctx, params: new URLSearchParams({ ids: lines.map((line) => line.lineId).join(",") }) });
      const field = reorder.sections[1]!.fields[0]!;
      return { loaded, context: typeof field.context === "function" ? field.context(ctx, loaded) : field.context };
    };
    afterEach(() => vi.unstubAllGlobals());

    it("adds from the ticked lines' site, or from every site when they span two", async () => {
      expect((await open([reorderLine("line-jw", "hre", 33.6), reorderLine("line-am", "hre", 13.03)])).context).toEqual({ siteId: "hre" });
      expect((await open([reorderLine("line-jw", "hre", 33.6), reorderLine("line-bo", "bdl", 1.08)])).context).toEqual({ everySite: true });
    });

    it("leaves a cost that is not set blank, not US$0.00", async () => {
      const { loaded } = await open([reorderLine("line-jw", "hre", 33.6), reorderLine("line-zc", "hre", null)]);
      expect((loaded.levels as Array<{ cost: string }>).map((line) => line.cost)).toEqual(["33.60", ""]);
    });
  });

  it("sends each line's level, a blank one as not set, and says how many were saved", () => {
    const sent = reorder.submit(values({ levels: [line("line-jw", "32"), line("line-am", " ")] }), ctx);
    expect(sent).toEqual({
      method: "PUT",
      url: "/api/v2/retail/stock/reorder",
      body: { levels: [{ lineId: "line-jw", reorderAt: "32" }, { lineId: "line-am", reorderAt: null }] },
    });
    expect(doneSentence(reorder, { saved: 2 }, values({}))).toBe("Reorder levels saved for 3 products.");
  });
});

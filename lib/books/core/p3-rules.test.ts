/**
 * P3's rules, pure (books-final §4.13, §5.8–5.11, D3, D4, D15, D17): base
 * posting of a document in another currency, realised differences, the
 * withholding rules, IMTT, the VAT calendar and categories, the provisional
 * tax instalments, the tax settings and their "to confirm" marks, the one
 * aging, a fiscal credit note's signed facts and who may reconcile.
 */
import { describe, expect, it } from "vitest";

import { buildNoteSigningInput } from "@/lib/accounting/fiscalisation";
import { adjustmentLines, convertLines, readFx, toBase } from "@/lib/accounting/fx-lines";

import { ageLedgerLines, bucketOf } from "./aging-lines";
import { imttOn, isImttLine } from "./bank";
import { canDo, type BooksActor } from "./can-do";
import { documentIdOf, realisedAdjustments, settle } from "./currency";
import { provisionalInstalments } from "./tax-calendar";
import { DEFAULT_TAX_SETTINGS, resolveTaxSettings } from "./tax-settings";
import { vatDueDates, vatPeriodFor } from "./vat-figures";
import { itf263Valid, withholdingFor } from "./withholding";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe("a document in another currency posts in the base currency (D3, D4)", () => {
  const line = (accountId: string, debit: number, credit: number) => ({ accountId, debit, credit, memo: accountId, costCenterId: null });

  it("converts each line at the frozen rate and keeps the original beside it", () => {
    const out = convertLines([line("AR", 30030, 0), line("Sales", 0, 26000), line("VAT", 0, 4030)], { currency: "ZWG", rate: 26 });
    expect(out.map((row) => [row.accountId, row.debit, row.credit, row.currency, row.amountInCurrency, row.exchangeRate])).toEqual([
      ["AR", 1155, 0, "ZWG", 30030, 26],
      ["Sales", 0, 1000, "ZWG", 26000, 26],
      ["VAT", 0, 155, "ZWG", 4030, 26],
    ]);
  });

  it("puts a rounding cent on the side with more lines, so the receivable keeps its exact base", () => {
    const out = convertLines([line("AR", 15015, 0), line("Sales", 0, 13000), line("VAT", 0, 2015)], { currency: "ZWG", rate: 26.5 });
    const ar = out.find((row) => row.accountId === "AR")!;
    expect(ar.debit).toBe(toBase(15015, 26.5));
    expect(out.reduce((sum, row) => sum + row.debit, 0)).toBeCloseTo(out.reduce((sum, row) => sum + row.credit, 0), 6);
    expect(out.find((row) => row.accountId === "VAT")!.credit).toBe(76.04);
  });

  it("leaves the base currency alone and turns adjustments round with the entry", () => {
    expect(convertLines([line("A", 10, 0)], null)[0]).toMatchObject({ debit: 10, currency: null, amountInCurrency: null });
    expect(adjustmentLines([{ accountId: "FX", debit: 3.7, credit: 0, memo: "loss" }], true)[0]).toMatchObject({ debit: 0, credit: 3.7 });
    expect(readFx({ fx: { currency: "zwg", rate: 27 } })).toEqual({ currency: "ZWG", rate: 27 });
    expect(readFx({ fx: { currency: "ZWG", rate: null } })).toBeNull();
  });

  it("names the document behind a posting key", () => {
    expect(documentIdOf("void:abc")).toBe("abc");
    expect(documentIdOf("abc:revision-2")).toBe("abc");
    expect(documentIdOf("abc:fdms")).toBe("abc");
    expect(documentIdOf("abc:r2")).toBe("abc");
  });
});

describe("realised exchange differences (§5.9.3)", () => {
  it("a US dollar receipt on a ZWG invoice takes its base value at the day's ZWG rate off the invoice", () => {
    const settled = settle({ direction: "IN", docCurrency: "ZWG", docRate: 26, payCurrency: "USD", payAmount: 1000, payRate: 1, crossRate: 26.5 });
    expect(settled).toEqual({ allocated: 26500, settledBase: 1000, carryingBase: 1019.23, gain: -19.23 });
    expect(realisedAdjustments("IN", settled.gain)).toEqual([
      { accountCode: "1100", debit: 0, credit: 19.23, memo: "Realised exchange loss" },
      { accountCode: "4210", debit: 19.23, credit: 0, memo: "Realised exchange loss" },
    ]);
  });

  it("paying a ZWG bill after the ZWG weakened is a gain", () => {
    const settled = settle({ direction: "OUT", docCurrency: "ZWG", docRate: 26, payCurrency: "ZWG", payAmount: 2600, payRate: 27 });
    expect(settled.gain).toBeCloseTo(3.7, 2);
    expect(realisedAdjustments("OUT", settled.gain)[0]).toMatchObject({ accountCode: "2000", debit: 3.7 });
    expect(realisedAdjustments("OUT", 0.004)).toEqual([]);
  });
});

describe("withholding (D17)", () => {
  const settings = DEFAULT_TAX_SETTINGS;
  const base = { gross: 600, grossBase: 600, paidThisYearBase: 0, hasValidItf263: false, vatInPayment: 0, weAreVatAgent: false, supplierIsVatAgent: false, supplierVatRegistered: true, settings };

  it("withholds 30% without a valid ITF263 only once the year's payments reach the threshold", () => {
    expect(withholdingFor(base).total).toBe(0);
    expect(withholdingFor({ ...base, paidThisYearBase: 400 })).toMatchObject({ incomeTax: 180, vat: 0, type: "INCOME_30" });
    expect(withholdingFor({ ...base, paidThisYearBase: 400, hasValidItf263: true }).total).toBe(0);
  });

  it("withholds a third of the VAT as an agent, not from another agent", () => {
    expect(withholdingFor({ ...base, vatInPayment: 93, weAreVatAgent: true })).toMatchObject({ vat: 31, type: "VAT_THIRD" });
    expect(withholdingFor({ ...base, vatInPayment: 93, weAreVatAgent: true, supplierIsVatAgent: true }).total).toBe(0);
    expect(withholdingFor({ ...base, gross: 1200, grossBase: 1200, vatInPayment: 93, weAreVatAgent: true })).toMatchObject({ incomeTax: 360, vat: 31, total: 391, type: "BOTH" });
  });

  it("reads a tax clearance as valid with a number and an expiry on or after the day", () => {
    expect(itf263Valid({ itf263Number: null, itf263ExpiresAt: null }, day("2026-09-01"))).toBe(false);
    expect(itf263Valid({ itf263Number: "ITF-1", itf263ExpiresAt: day("2026-12-31") }, day("2026-09-01"))).toBe(true);
    expect(itf263Valid({ itf263Number: "ITF-1", itf263ExpiresAt: day("2026-06-30") }, day("2026-09-01"))).toBe(false);
  });
});

describe("IMTT (§5.8.3)", () => {
  it("proposes 2% on US dollars, 1.5% on ZWG and the flat amount over the threshold", () => {
    expect(imttOn(1212.75, "USD", DEFAULT_TAX_SETTINGS)).toBe(24.26);
    expect(imttOn(10000, "ZWG", DEFAULT_TAX_SETTINGS)).toBe(150);
    expect(imttOn(600_000, "USD", DEFAULT_TAX_SETTINGS)).toBe(10_150);
    expect(imttOn(27_000_000, "ZWG", DEFAULT_TAX_SETTINGS, "USD", 27)).toBe(274_050);
  });

  it("recognises the bank's IMTT line", () => {
    expect(isImttLine("IMTT 2% TAX ON TRANSFER")).toBe(true);
    expect(isImttLine("Intermediated money transfer tax")).toBe(true);
    expect(isImttLine("Monthly service fee")).toBe(false);
  });
});

describe("VAT periods and due dates (§5.10.1)", () => {
  it("C is monthly, A ends in odd months, B in even", () => {
    const c = vatPeriodFor(day("2026-09-14"), { category: "C", periodMonths: 1 });
    expect([iso(c.start), iso(c.end)]).toEqual(["2026-09-01", "2026-09-30"]);
    const a = vatPeriodFor(day("2026-10-14"), { category: "A", periodMonths: 2 });
    expect([iso(a.start), iso(a.end)]).toEqual(["2026-10-01", "2026-11-30"]);
    const b = vatPeriodFor(day("2026-10-14"), { category: "B", periodMonths: 2 });
    expect([iso(b.start), iso(b.end)]).toEqual(["2026-09-01", "2026-10-31"]);
  });

  it("files by the 10th and pays by the 15th of the next month, from the settings", () => {
    expect(vatDueDates(day("2026-09-30"), DEFAULT_TAX_SETTINGS.vat)).toEqual({ returnDue: "2026-10-10", paymentDue: "2026-10-15" });
    expect(vatDueDates(day("2026-12-31"), { returnDay: 25, paymentDay: 25 })).toEqual({ returnDue: "2027-01-25", paymentDue: "2027-01-25" });
  });
});

describe("provisional tax (§5.11)", () => {
  it("splits the estimate 10, 25, 30, 35 on the set dates, 50/50 where it applies", () => {
    const rows = provisionalInstalments(2026, { ...DEFAULT_TAX_SETTINGS.provisional, estimates: { "2026": { taxUsd: 10_000, split5050: true, foreignShare: 0.6 } } });
    expect(rows.map((row) => [row.share, row.amount, row.paymentDue])).toEqual([
      [10, 1000, "2026-03-25"],
      [25, 2500, "2026-06-25"],
      [30, 3000, "2026-09-25"],
      [35, 3500, "2026-12-20"],
    ]);
    expect(rows[1].split).toEqual({ usd: 1500, zwgInUsd: 1000 });
    expect(provisionalInstalments(2027, DEFAULT_TAX_SETTINGS.provisional)[0].amount).toBeNull();
  });
});

describe("tax settings (brief default 5)", () => {
  it("are today's research values, the FLAGged ones marked to confirm until saved", () => {
    const fresh = resolveTaxSettings(null);
    expect(fresh.vat).toMatchObject({ returnDay: 10, paymentDay: 15, category: "C" });
    expect(fresh.withholding.thresholdUsd).toBe(1000);
    expect(fresh.imtt).toMatchObject({ usdRate: 0.02, zwgRate: 0.015 });
    expect(fresh.toConfirm.map((item) => item.key)).toContain("withholding.thresholdUsd");
    const own = resolveTaxSettings({ withholding: { thresholdUsd: 1500 }, confirmed: ["withholding.thresholdUsd"] });
    expect(own.withholding).toMatchObject({ thresholdUsd: 1500, contractRate: 0.3 });
    expect(own.toConfirm.map((item) => item.key)).not.toContain("withholding.thresholdUsd");
  });
});

describe("the one aging (fix 14)", () => {
  it("ages each line in its currency and in the base at its frozen rate", () => {
    const asOf = day("2026-10-01");
    const lines = [
      { partyId: "c1", entryDate: day("2026-09-28"), debit: 15015, credit: 0, currency: "ZWG", sourceType: "SALES_INVOICE" as const, sourceId: "i1", invoiceId: "i1", billId: null },
      { partyId: "c1", entryDate: day("2026-07-01"), debit: 100, credit: 0, currency: "USD", sourceType: "SALES_INVOICE" as const, sourceId: "i2", invoiceId: "i2", billId: null },
      { partyId: "c1", entryDate: day("2026-07-02"), debit: 0, credit: 100, currency: "USD", sourceType: "SALES_RECEIPT" as const, sourceId: "r1", invoiceId: "i2", billId: null },
    ];
    const aged = ageLedgerLines("customer", lines, new Map([["c1", "Pomona Offices"]]), asOf, "USD", (line) => (line.invoiceId === "i1" ? 26.5 : 1));
    expect(aged.rows).toHaveLength(1);
    expect(aged.rows[0]).toMatchObject({ name: "Pomona Offices", current: 566.6, total: 566.6 });
    expect(aged.rows[0].byCurrency).toEqual([{ currency: "ZWG", current: 15015, days30: 0, days60: 0, days90: 0, over90: 0, total: 15015 }]);
    expect(bucketOf(day("2026-05-01"), asOf)).toBe("over90");
  });
});

describe("a fiscal credit note's signed facts (§4.17)", () => {
  it("is a CREDITNOTE in the invoice's currency, signed negative", () => {
    const facts = buildNoteSigningInput("CREDITNOTE", {
      currency: "USD",
      noteDate: day("2026-10-02"),
      total: 115.5,
      lines: [{ description: "Vinyl", taxAmount: 15.5, taxCode: { code: "VAT15_5", rate: 15.5, zimraTaxId: 517 } }],
    });
    expect(facts.receiptType).toBe("CREDITNOTE");
    expect(facts.receiptTotal.toString()).toBe("-11550");
    expect(facts.taxes[0]).toMatchObject({ taxId: 517, taxPercent: 15.5 });
    expect(facts.taxes[0].taxAmount.toString()).toBe("-1550");
    expect(buildNoteSigningInput("DEBITNOTE", { currency: "USD", noteDate: day("2026-10-02"), total: 10, lines: [] }).receiptTotal.toString()).toBe("1000");
  });
});

describe("who reconciles (§4.13)", () => {
  const actor = (role: string): BooksActor => ({ companyId: "c", userId: "u", role });
  it("closes with a manager or the accountant, reopens and voids with the owner only", () => {
    expect(canDo(actor("MANAGER"), "reconciliation.close").allowed).toBe(true);
    expect(canDo(actor("FINANCE_OFFICER"), "reconciliation.close").allowed).toBe(true);
    expect(canDo(actor("SHOP_MANAGER"), "reconciliation.close").allowed).toBe(false);
    expect(canDo(actor("MANAGER"), "reconciliation.reopen").allowed).toBe(false);
    expect(canDo(actor("SUPERADMIN"), "reconciliation.reopen").allowed).toBe(true);
    expect(canDo(actor("MANAGER"), "reconciliation.void").allowed).toBe(false);
    expect(canDo(actor("SHOP_MANAGER"), "bank.match", { module: "retail" }).allowed).toBe(true);
    expect(canDo(actor("CLERK"), "bank.entry").allowed).toBe(false);
  });
});

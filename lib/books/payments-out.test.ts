import { describe, expect, it } from "vitest";

import { toPaymentOutRow } from "./payments-out";

const record = (over: Record<string, unknown> = {}) =>
  ({
    id: "p1",
    paymentNumber: null,
    groupNo: null,
    status: "DRAFT",
    paidAt: new Date("2026-10-09T00:00:00.000Z"),
    amount: 312.4,
    reference: null,
    createdById: "u1",
    voidedAt: null,
    voidReason: null,
    exchangeRate: null,
    withholdingAmount: 0,
    vendor: { id: "v1", name: "Halsted Builders", itf263Number: null, itf263ExpiresAt: null },
    bankAccount: { name: "CBZ current", bankName: "CBZ", currency: "USD" },
    bill: null,
    ...over,
  }) as unknown as Parameters<typeof toPaymentOutRow>[0];

const now = new Date("2026-10-10T08:00:00.000Z");

describe("Payments made rows (BkPaymentsOut)", () => {
  it("shows gross, withheld and what the supplier is paid, and warns of the missing ITF263 on one still to pay", () => {
    const row = toPaymentOutRow(record(), "USD", { withheld: 93.72, imtt: 4.37 }, now);
    expect(row).toMatchObject({ number: "Draft", from: "CBZ current", amount: 312.4, withheld: 93.72, paid: 218.68 });
    expect(row.note).toEqual({ text: "No ITF263", warn: true });
  });

  it("names the IMTT on one that is paid, and nothing is withheld without a reason", () => {
    const row = toPaymentOutRow(record({ status: "PAID", paymentNumber: "PAY-0051", amount: 1860, vendor: { id: "v2", name: "Tile & Trim Supplies", itf263Number: "ITF-1", itf263ExpiresAt: null } }), "USD", { withheld: 0, imtt: 37.2 }, now);
    expect(row).toMatchObject({ number: "PAY-0051", withheld: 0, paid: 1860 });
    expect(row.note).toEqual({ text: "IMTT US$37.20", warn: false });
  });

  it("gives a void its reason", () => {
    const row = toPaymentOutRow(record({ status: "VOIDED", voidedAt: now, voidReason: "Paid twice" }), "USD", { withheld: 0, imtt: 0 }, now);
    expect(row.note).toEqual({ text: "Paid twice", warn: false });
    expect(row.voided?.reason).toBe("Paid twice");
  });
});

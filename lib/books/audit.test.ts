import { describe, expect, it } from "vitest";

import { describeEvent, eventDetail, keptLines, whenLabel } from "./audit";

describe("the audit trail's words (BkAudit)", () => {
  it("names each change P4 writes, and P5's reversals", () => {
    expect(describeEvent("books.invoice.voided")).toEqual({ kind: "void", what: "Voided", noun: "Invoice" });
    expect(describeEvent("books.invoice.revised").kind).toBe("revise");
    expect(describeEvent("books.bill.deleted")).toMatchObject({ kind: "delete", what: "Deleted permanently" });
    expect(describeEvent("books.fiscal-device.purged")).toMatchObject({ kind: "delete", noun: "Fiscal device" });
    expect(describeEvent("books.journal.reversed")).toMatchObject({ kind: "void", noun: "Journal" });
    expect(describeEvent("books.reconciliation.reopened").kind).toBe("reopen");
  });

  it("says what replaced what, and keeps the snapshot readable", () => {
    expect(eventDetail("Invoice", { number: "INV-0143", creditNote: "CN-0009" })).toBe("INV-0143 → CN-0009");
    expect(eventDetail("Bill", { number: "BILL-0005" })).toBe("BILL-0005");
    expect(keptLines({ by: { userId: "u" }, number: "BILL-0005", snapshot: { id: "x", billNumber: "BILL-0005", total: 120, vendorId: "v" }, receiptsOnAccount: [{ number: "REC-0094" }] })).toBe("number: BILL-0005\nbillNumber: BILL-0005\ntotal: 120\nreceiptsOnAccount: REC-0094");
    expect(whenLabel(new Date("2026-10-12T14:21:00.000Z"))).toBe("Mon 12 Oct 16:21");
  });
});

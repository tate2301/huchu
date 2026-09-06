import { describe, it, expect } from "vitest";

import { resolveViewIcon } from "./view-icons";

describe("resolveViewIcon", () => {
  it("gives the same icon to the same idea across modules", () => {
    // Accounting, schools and the CRM all have a view called "invoices". A
    // rail that pictures them differently is a rail somebody has to read.
    expect(resolveViewIcon("invoices", "Invoices")).toBe(
      resolveViewIcon("fee-invoice", "Fee Invoices"),
    );
  });

  it("falls back to the label when the id is not a word", () => {
    expect(resolveViewIcon("tab-3", "Receipts")).toBe(resolveViewIcon("receipts"));
  });

  it("reads a keyword out of a label nobody put in the table", () => {
    expect(resolveViewIcon("bucket9", "Unpaid supplier invoices")).toBe(
      resolveViewIcon("invoices"),
    );
  });

  it("always answers with something, however odd the view", () => {
    expect(resolveViewIcon("zzz", "Qqq")).toBeTruthy();
  });

  it("does not confuse two different ideas that share a prefix", () => {
    expect(resolveViewIcon("receipts")).not.toBe(resolveViewIcon("reports"));
  });
});

/**
 * Undo's rules (books-final §4.1, §2.5, §5.13), one by one: when Void,
 * Revise and Delete permanently are refused, and what the refusal names.
 */
import { describe, expect, it } from "vitest";

import { canDo, VOID_GRANT, type BooksActor } from "./can-do";
import { bulkSummary, deleteRefusal, dependentsSentence, isBulkAction, isUndoKind, reasonOf, reviseRefusal, voidRefusal, type UndoFacts } from "./undo-rules";

const invoice = (over: Partial<UndoFacts> = {}): UndoFacts => ({
  kind: "invoice",
  id: "inv-1",
  label: "INV-0143",
  draft: false,
  voided: false,
  posted: true,
  date: new Date("2026-10-10T00:00:00Z"),
  fiscalised: false,
  testDevice: false,
  ownerId: "u1",
  dependents: [],
  ...over,
});

describe("void", () => {
  it("lets a posted document go, and says why not for the rest", () => {
    expect(voidRefusal(invoice())).toBeNull();
    expect(voidRefusal(invoice({ voided: true }))).toBe("INV-0143 is void already.");
    expect(voidRefusal(invoice({ draft: true, posted: false }))).toMatch(/is a draft and nothing was posted: delete it instead/);
  });

  it("names the later documents standing on it", () => {
    const one = voidRefusal(invoice({ dependents: [{ kind: "receipt", id: "r1", label: "RCT-0007" }] }));
    expect(one).toBe("RCT-0007 stands on INV-0143. Void it first.");
    const two = voidRefusal(invoice({ dependents: [{ kind: "receipt", id: "r1", label: "RCT-0007" }, { kind: "credit-note", id: "c1", label: "CN-0002" }] }));
    expect(two).toBe("RCT-0007 and CN-0002 stand on INV-0143. Void them first.");
  });

  it("is refused while today's month is closed, or its bank line sits in a closed reconciliation", () => {
    expect(voidRefusal(invoice(), { todayHeld: "October 2026 is closed" })).toBe("October 2026 is closed, and a void posts today. The owner reopens it first.");
    expect(voidRefusal(invoice({ kind: "receipt", label: "RCT-0007" }), { closedReconciliation: "Stanbic USD to 2026-09-30" })).toMatch(/closed reconciliation \(Stanbic USD to 2026-09-30\)/);
  });

  it("sends a person to the module that owns till sales, lay-bys and school fees", () => {
    expect(voidRefusal(invoice({ kind: "retail-sale", label: "SALE-1" }))).toMatch(/at the till/);
    expect(voidRefusal(invoice({ kind: "school-fee-receipt", label: "SFR-1" }))).toMatch(/Schools → Fees/);
  });
});

describe("revise", () => {
  it("is for invoices, quotes, bills and credit notes only", () => {
    expect(reviseRefusal(invoice())).toBeNull();
    expect(reviseRefusal(invoice({ kind: "receipt", label: "RCT-1" }))).toMatch(/is not revised/);
    expect(reviseRefusal(invoice({ kind: "credit-note", label: "CN-1", fiscalised: true }))).toMatch(/never voided or revised/);
    expect(reviseRefusal(invoice({ draft: true, posted: false }))).toBe("INV-0143 is a draft: change it directly.");
  });

  it("follows the void's rules", () => {
    expect(reviseRefusal(invoice({ dependents: [{ kind: "receipt", id: "r", label: "RCT-9" }] }))).toMatch(/RCT-9 stands on INV-0143/);
  });
});

describe("delete permanently", () => {
  it("lets a posted, unfiscalised document in an open month go", () => {
    expect(deleteRefusal(invoice())).toBeNull();
  });

  it("never deletes a fiscalised one, unless a test device signed it (D18)", () => {
    expect(deleteRefusal(invoice({ fiscalised: true }))).toMatch(/was fiscalised, so ZIMRA holds it/);
    expect(deleteRefusal(invoice({ fiscalised: true, testDevice: true }))).toBeNull();
  });

  it("is refused in a closed month, a finalised VAT return or a closed reconciliation", () => {
    expect(deleteRefusal(invoice(), { monthHeld: "September 2026 is closed" })).toBe("September 2026 is closed, so its figures have been reported. Void it instead.");
    expect(deleteRefusal(invoice(), { vatReturn: "the VAT return for 2026-09-01 to 2026-09-30" })).toMatch(/is counted in the VAT return/);
    expect(deleteRefusal(invoice(), { closedReconciliation: "Stanbic USD" })).toMatch(/Void it instead, or the owner reopens/);
  });

  it("never deletes school fees or till sales from Books", () => {
    expect(deleteRefusal(invoice({ kind: "school-fee-invoice" }))).toMatch(/never deleted from Books/);
    expect(deleteRefusal(invoice({ kind: "retail-sale" }))).toMatch(/Retail/);
  });
});

describe("the grant (§2.3; brief default 2)", () => {
  const as = (role: string, extra: Partial<BooksActor> = {}): BooksActor => ({ companyId: "c", userId: "me", role, ...extra });
  it("nobody voids or revises without it but the owner and a superuser", () => {
    for (const action of ["void", "revise"] as const) {
      expect(canDo(as("SUPERADMIN"), action).allowed).toBe(true);
      expect(canDo(as("CLERK", { signInAs: { id: "s", number: 9, operatorName: "Rudo", mode: "CHANGE", until: "2099-01-01T00:00:00Z" } }), action).allowed).toBe(true);
      expect(canDo(as("FINANCE_OFFICER"), action).allowed).toBe(false);
      expect(canDo(as("MANAGER"), action).allowed).toBe(false);
      expect(canDo(as("FINANCE_OFFICER", { grants: [VOID_GRANT] }), action).allowed).toBe(true);
      expect(canDo(as("MANAGER", { grants: new Set([VOID_GRANT]) }), action).allowed).toBe(true);
      // The grant never reaches a clerk, nor permanent delete.
      expect(canDo(as("CLERK", { grants: [VOID_GRANT] }), action).allowed).toBe(false);
    }
    expect(canDo(as("FINANCE_OFFICER", { grants: [VOID_GRANT] }), "delete.posted").allowed).toBe(false);
  });
});

describe("words and inputs", () => {
  it("shortens a long list of what stands on it", () => {
    const many = ["A", "B", "C", "D", "E", "F"].map((label) => ({ kind: "receipt" as const, id: label, label }));
    expect(dependentsSentence(many)).toBe("A, B, C and 3 more");
  });

  it("wants a reason of three characters or more", () => {
    expect(reasonOf("  ab ")).toBeNull();
    expect(reasonOf(" Entered twice ")).toBe("Entered twice");
    expect(reasonOf("x".repeat(400))).toHaveLength(300);
  });

  it("knows the kinds and the bulk actions", () => {
    expect(isUndoKind("invoice")).toBe(true);
    expect(isUndoKind("payslip")).toBe(false);
    expect(isBulkAction("mark-paid")).toBe(true);
    expect(isBulkAction("archive")).toBe(false);
  });

  it("sums up a bulk run", () => {
    expect(bulkSummary({ action: "void", kind: "invoice", done: [{ id: "1", label: "INV-1" }, { id: "2", label: "INV-2" }, { id: "3", label: "INV-3" }], skipped: [{ id: "4", label: "INV-4", why: "x" }, { id: "5", label: "INV-5", why: "y" }], failed: [] })).toBe(
      "3 invoices voided. 2 skipped.",
    );
    expect(bulkSummary({ action: "delete", kind: "bill", done: [], skipped: [], failed: [{ id: "1", label: "B", why: "z" }] })).toBe("Nothing was deleted. 1 failed.");
  });
});

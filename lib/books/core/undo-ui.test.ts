/**
 * What the undo dialogs say (undo-ui.ts): the labelled lines of a void, which
 * of delete's four refusals holds, and the four words of a bulk result.
 */
import { describe, expect, it } from "vitest";

import { bulkOutcome, deleteRuleRows, leadOf, outcomes, sharedWhy, voidWill } from "./undo-ui";
import { deleteRefusal, voidEffects, type UndoFacts } from "./undo-rules";

const facts = (over: Partial<UndoFacts> = {}): UndoFacts => ({
  kind: "invoice",
  id: "inv-1",
  label: "INV-0140",
  draft: false,
  voided: false,
  posted: true,
  date: new Date("2026-10-01T00:00:00Z"),
  fiscalised: false,
  testDevice: false,
  ownerId: "u1",
  dependents: [],
  ...over,
});

describe("what a void does", () => {
  it("reads credit note, posting and payments in that order, with the note's number", () => {
    const doc = facts({ fiscalised: true });
    const will = voidWill({ kind: "invoice", fiscalised: true, effects: voidEffects(doc), onAccount: [], nextNote: "CN-0013" });
    expect(will.map((row) => row.label)).toEqual(["Credit note", "Posting", "Payments", "Commission"]);
    expect(will[0].text).toBe("CN-0013, signed on FDMS");
    expect(will[2].text).toBe("None on it, so none to move");
  });

  it("names the payments that stay on account", () => {
    const will = voidWill({ kind: "invoice", fiscalised: false, effects: voidEffects(facts({ onAccount: [{ kind: "receipt", id: "r", label: "REC-0097" }] })), onAccount: ["REC-0097"], nextNote: "CN-0014" });
    expect(will.find((row) => row.label === "Payments")?.text).toMatch(/REC-0097 stays on the customer/);
  });
});

describe("delete's four refusals", () => {
  const choices = (doc: Partial<UndoFacts>, context = {}) => ({ fiscalised: Boolean(doc.fiscalised), delete: { allowed: false, why: deleteRefusal(facts(doc), context), permanent: true } });

  it("marks fiscalised and leaves the later checks unknown", () => {
    const rows = deleteRuleRows(choices({ fiscalised: true }))!;
    expect(rows.map((row) => row.here)).toEqual(["yes", "unknown", "unknown", "unknown"]);
  });

  it("marks a closed month, with fiscalised read as No", () => {
    const rows = deleteRuleRows(choices({}, { monthHeld: "September 2026 is closed" }))!;
    expect(rows.map((row) => row.here)).toEqual(["no", "yes", "unknown", "unknown"]);
  });

  it("marks a filed return and a closed reconciliation", () => {
    expect(deleteRuleRows(choices({}, { vatReturn: "the VAT return for September 2026" }))!.map((row) => row.here)).toEqual(["no", "no", "yes", "unknown"]);
    expect(deleteRuleRows(choices({}, { closedReconciliation: "Stanbic USD to 30 Sep 2026" }))!.map((row) => row.here)).toEqual(["no", "no", "no", "yes"]);
  });

  it("has nothing to say for a refusal that is none of the four, or when delete is allowed", () => {
    expect(deleteRuleRows({ fiscalised: false, delete: { allowed: false, why: "Only the owner can delete a posted document.", permanent: true } })).toBeNull();
    expect(deleteRuleRows({ fiscalised: false, delete: { allowed: true, why: null, permanent: true } })).toBeNull();
  });
});

describe("a bulk result's four words", () => {
  it("sorts a row by what the core said about it", () => {
    expect(bulkOutcome("done")).toBe("done");
    expect(bulkOutcome("skipped", "INV-0061 is void already.")).toBe("unchanged");
    expect(bulkOutcome("skipped", "Draft invoice is a draft and nothing was posted: delete it instead.")).toBe("skipped");
    expect(bulkOutcome("skipped", "September 2026 is closed, and a void posts today. The owner reopens it first.")).toBe("refused");
    expect(bulkOutcome("failed", "It did not work.")).toBe("refused");
  });

  it("lists every row once, and gives a group one line", () => {
    const rows = outcomes({ done: [{ id: "a", label: "INV-1" }], skipped: [{ id: "b", label: "INV-2", why: "INV-2 is void already." }], failed: [{ id: "c", label: "INV-3", why: "Device offline" }] });
    expect(rows.map((row) => row.outcome)).toEqual(["done", "unchanged", "refused"]);
    expect(sharedWhy([{ why: "Device offline" }, { why: "Device offline" }])).toBe("Device offline");
    expect(sharedWhy([{ why: "A" }, { why: "A" }, { why: "B" }])).toBe("A 1 other reason in the list.");
  });

  it("splits a refusal at its first sentence", () => {
    expect(leadOf("It was fiscalised on 10 Sep. ZIMRA holds it.")).toEqual({ lead: "It was fiscalised on 10 Sep.", rest: "ZIMRA holds it." });
    expect(leadOf("No stop")).toEqual({ lead: "No stop", rest: "" });
  });
});

import { describe, expect, it } from "vitest";

import { invoiceStatus } from "./concern";
import {
  changeLine,
  changesOf,
  groupByDay,
  initialsOf,
  isMention,
  moduleOf,
  needsYou,
  relativeTime,
  secondLineFor,
  sentenceFor,
  subjectOf,
  todayAndEarlier,
  typesForModule,
} from "./describe";

const base = { title: "", summary: "", entityType: null, entityId: null, payload: null };
const DEAL = "0804acc1-1ca3-41ba-a0de-ce8b63c21458";

describe("module and kind", () => {
  it("files each type under its module", () => {
    expect(moduleOf({ type: "HR_PAYROLL_SUBMITTED", payload: null })).toBe("payroll");
    expect(moduleOf({ type: "HR_INCIDENT_CREATED", payload: null })).toBe("people");
    expect(moduleOf({ type: "OPS_PERMIT_EXPIRING", payload: null })).toBe("operations");
    expect(moduleOf({ type: "RETAIL_COUNT_ASSIGNED", payload: null })).toBe("retail");
    expect(moduleOf({ type: "CRM_MENTIONED", payload: null })).toBe("crm");
  });

  it("lets the payload name a module the types have no value for", () => {
    expect(moduleOf({ type: "CRM_RECORD_ACTIVITY", payload: { module: "books" } })).toBe("books");
    expect(moduleOf({ type: "CRM_RECORD_ACTIVITY", payload: { module: "nowhere" } })).toBe("crm");
  });

  it("lists a module's types for the server's filter", () => {
    expect(typesForModule("payroll", ["HR_PAYROLL_APPROVED", "CRM_MENTIONED", "HR_COMP_RULE_REJECTED"])).toEqual([
      "HR_PAYROLL_APPROVED",
      "HR_COMP_RULE_REJECTED",
    ]);
  });

  it("knows what needs the reader", () => {
    expect(needsYou({ type: "HR_PAYROLL_SUBMITTED", payload: null })).toBe(true);
    expect(needsYou({ type: "HR_PAYROLL_APPROVED", payload: null })).toBe(false);
    expect(needsYou({ type: "HR_PAYROLL_APPROVED", severity: "CRITICAL", payload: null })).toBe(true);
    expect(needsYou({ type: "CRM_RECORD_ACTIVITY", payload: { needsYou: true } })).toBe(true);
    expect(isMention({ type: "CRM_MENTIONED", payload: null })).toBe(true);
  });
});

describe("subjectOf", () => {
  it("reads the payload's subject first", () => {
    expect(subjectOf({ ...base, type: "CRM_RECORD_ACTIVITY", payload: { subject: { kind: "invoice", id: "abc" } } })).toEqual({
      kind: "invoice",
      id: "abc",
    });
  });

  it("ignores a subject of a kind it does not know", () => {
    expect(subjectOf({ ...base, type: "CRM_RECORD_ACTIVITY", payload: { subject: { kind: "rocket", id: "abc" } } })).toBeNull();
  });

  it("maps the schema's entity, then a CRM view path", () => {
    expect(subjectOf({ ...base, type: "HR_PAYROLL_SUBMITTED", entityType: "PAYROLL_RUN", entityId: "r1" })).toEqual({ kind: "payroll-run", id: "r1" });
    expect(subjectOf({ ...base, type: "CRM_DOCUMENT_APPROVED", entityType: "CRM_LEAD", payload: { viewPath: `/crm/deals/${DEAL}` } })).toEqual({
      kind: "deal",
      id: DEAL,
    });
  });
});

describe("sentenceFor", () => {
  it("prefers the line that says who did what to the record", () => {
    const { segments, used } = sentenceFor({
      title: "Invoice approved",
      summary: "Tendai approved INV-0042.",
      actorName: "Tendai",
      refLabel: "INV-0042",
      type: "CRM_RECORD_ACTIVITY",
    });
    expect(used).toBe("summary");
    expect(segments).toEqual([{ text: "Tendai approved " }, { text: "INV-0042", strong: true }]);
  });

  it("puts a mention on its record", () => {
    const { segments } = sentenceFor({ title: "Tendai mentioned you", summary: "@James can you…", actorName: "Tendai", refLabel: "Rusape scanners", type: "CRM_MENTIONED" });
    expect(segments).toEqual([{ text: "Tendai mentioned you on " }, { text: "Rusape scanners", strong: true }]);
  });

  it("leaves a sentence alone when it names no record", () => {
    expect(sentenceFor({ title: "Quote approved", summary: "A client approved a document.", actorName: null, refLabel: null, type: "CRM_DOCUMENT_APPROVED" }).segments).toEqual([
      { text: "Quote approved" },
    ]);
  });
});

describe("second line", () => {
  it("says what changed first", () => {
    const changes = changesOf({ changes: [{ label: "Due", from: "12 Oct", to: "19 Oct" }, { nope: 1 }] });
    expect(changes).toHaveLength(1);
    expect(changeLine(changes[0]!)).toBe("Due 12 Oct → 19 Oct");
    expect(secondLineFor({ sentence: "x", title: "a", summary: "b", used: "title", changes })).toBe("Due 12 Oct → 19 Oct");
  });

  it("uses the other text's first line, never a repeat or a stub", () => {
    expect(secondLineFor({ sentence: "Tendai commented", title: "Tendai commented", summary: "Worth pushing on this one.\nMore.", used: "title", changes: [] })).toBe(
      "Worth pushing on this one",
    );
    expect(secondLineFor({ sentence: "Tendai approved INV-1", title: "Invoice approved", summary: "Tendai approved INV-1.", used: "summary", changes: [] })).toBeNull();
    expect(secondLineFor({ sentence: "Paid", title: "Paid", summary: "Paid in full.", used: "title", changes: [] })).toBeNull();
  });
});

describe("time and groups", () => {
  const now = new Date(2026, 9, 14, 12, 0);

  it("writes the row's time short", () => {
    expect(relativeTime(new Date(2026, 9, 14, 11, 59, 30).toISOString(), now)).toBe("now");
    expect(relativeTime(new Date(2026, 9, 14, 11, 56).toISOString(), now)).toBe("4m");
    expect(relativeTime(new Date(2026, 9, 14, 9, 0).toISOString(), now)).toBe("3h");
    expect(relativeTime(new Date(2026, 9, 13, 18, 0).toISOString(), now)).toBe("Yesterday");
    expect(relativeTime(new Date(2026, 9, 12, 18, 0).toISOString(), now)).toBe("Mon");
    expect(relativeTime(new Date(2026, 8, 30, 18, 0).toISOString(), now)).toBe("30 Sep");
  });

  it("groups by day, newest first", () => {
    const items = [
      { id: "a", createdAt: new Date(2026, 9, 14, 10).toISOString() },
      { id: "b", createdAt: new Date(2026, 9, 13, 10).toISOString() },
      { id: "c", createdAt: new Date(2026, 9, 12, 10).toISOString() },
    ];
    expect(groupByDay(items, now).map((group) => group.label)).toEqual(["Today", "Yesterday", "Monday 12 October"]);
    expect(todayAndEarlier(items, now).map((group) => [group.label, group.items.length])).toEqual([
      ["Today", 1],
      ["Earlier", 2],
    ]);
  });

  it("makes initials", () => {
    expect(initialsOf("Tendai Moyo")).toBe("TM");
    expect(initialsOf("rudo")).toBe("R");
    expect(initialsOf(null)).toBe("");
  });
});

describe("invoiceStatus", () => {
  const due = new Date(Date.UTC(2026, 9, 10));
  it("reads as Books does", () => {
    expect(invoiceStatus({ status: "ISSUED", total: 100, amountPaid: 0, dueDate: due }, "2026-10-14").label).toBe("Overdue");
    expect(invoiceStatus({ status: "ISSUED", total: 100, amountPaid: 40, dueDate: due }, "2026-10-01").label).toBe("Part paid");
    expect(invoiceStatus({ status: "ISSUED", total: 100, amountPaid: 0, dueDate: null }, "2026-10-01").label).toBe("Owed");
    expect(invoiceStatus({ status: "PAID", total: 100, amountPaid: 100, dueDate: due }, "2026-10-14")).toEqual({ label: "Paid", tone: "success" });
  });
});

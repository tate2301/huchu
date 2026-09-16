import { describe, expect, it } from "vitest";

import {
  isPeekable,
  parseRecordHref,
  recordHref,
  recordSummaryPath,
  sameRecord,
} from "@/lib/crm/record-ref";

describe("parseRecordHref", () => {
  it("reads each entity out of its own path segment", () => {
    expect(parseRecordHref("/crm/leads/a")).toEqual({ entity: "lead", id: "a" });
    expect(parseRecordHref("/crm/deals/b")).toEqual({ entity: "deal", id: "b" });
    expect(parseRecordHref("/crm/companies/c")).toEqual({ entity: "company", id: "c" });
    expect(parseRecordHref("/crm/people/d")).toEqual({ entity: "person", id: "d" });
    expect(parseRecordHref("/crm/sites/e")).toEqual({ entity: "site", id: "e" });
    expect(parseRecordHref("/crm/reps/f")).toEqual({ entity: "rep", id: "f" });
  });

  it("ignores which section of the record the link opens", () => {
    // The peek summarises the record, and `?section=` chooses a tab on the
    // full page — the same record either way.
    expect(parseRecordHref("/crm/deals/b?section=documents")).toEqual({
      entity: "deal",
      id: "b",
    });
    expect(parseRecordHref("/crm/deals/b#notes")).toEqual({ entity: "deal", id: "b" });
  });

  it("refuses anything that is not exactly one record", () => {
    // A list, a nested page, another module, an absolute URL, a bare anchor.
    // Each of these has to stay an ordinary link.
    expect(parseRecordHref("/crm/deals")).toBeNull();
    expect(parseRecordHref("/crm/deals/b/edit")).toBeNull();
    expect(parseRecordHref("/crm/quotes/b")).toBeNull();
    expect(parseRecordHref("/stores/items/b")).toBeNull();
    expect(parseRecordHref("https://example.com/crm/deals/b")).toBeNull();
    expect(parseRecordHref("#top")).toBeNull();
    expect(parseRecordHref("")).toBeNull();
    expect(parseRecordHref(null)).toBeNull();
    expect(parseRecordHref(undefined)).toBeNull();
  });

  it("decodes an id that arrived encoded", () => {
    expect(parseRecordHref("/crm/people/a%20b")).toEqual({ entity: "person", id: "a b" });
  });
});

describe("recordHref", () => {
  it("round-trips", () => {
    const ref = { entity: "company", id: "abc" } as const;
    expect(parseRecordHref(recordHref(ref))).toEqual(ref);
  });

  it("drops the section, so 'open in full' lands on the record itself", () => {
    const ref = parseRecordHref("/crm/deals/b?section=history")!;
    expect(recordHref(ref)).toBe("/crm/deals/b");
  });
});

describe("sameRecord", () => {
  it("is true only for the same entity and id", () => {
    const deal = { entity: "deal", id: "a" } as const;
    expect(sameRecord(deal, { entity: "deal", id: "a" })).toBe(true);
    expect(sameRecord(deal, { entity: "deal", id: "b" })).toBe(false);
    // Ids are uuids in practice, but nothing guarantees two tables cannot
    // share one — the entity has to be part of the comparison.
    expect(sameRecord(deal, { entity: "lead", id: "a" })).toBe(false);
    expect(sameRecord(deal, null)).toBe(false);
    expect(sameRecord(null, null)).toBe(false);
  });
});

describe("records outside the CRM module", () => {
  it("recognises a pupil, which the CRM-only parser could not", () => {
    expect(parseRecordHref("/schools/students/abc")).toEqual({
      entity: "student",
      id: "abc",
    });
  });

  it("recognises a type whose page is nested deeper than three segments", () => {
    // A class lives under master data, four segments in. The old rule was
    // "exactly three parts", which refused it on shape alone.
    expect(parseRecordHref("/management/master-data/schools/classes/f4")).toEqual({
      entity: "class",
      id: "f4",
    });
  });

  it("still refuses a list page and a sub-page of a record", () => {
    expect(parseRecordHref("/schools/students")).toBeNull();
    expect(parseRecordHref("/schools/students/abc/edit")).toBeNull();
  });

  it("round-trips a school record through recordHref", () => {
    const ref = parseRecordHref("/schools/guardians/g1?section=children")!;
    expect(recordHref(ref)).toBe("/schools/guardians/g1");
  });
});

describe("isPeekable", () => {
  it("separates knowing what a link points at from being able to describe it", () => {
    // Every registered type can be described without travelling to it now that
    // both modules answer, but the question is still a separate one: a type
    // added to the registry without a summary endpoint parses and navigates.
    expect(isPeekable(parseRecordHref("/crm/deals/a"))).toBe(true);
    expect(isPeekable(parseRecordHref("/schools/students/abc"))).toBe(true);
    expect(isPeekable(parseRecordHref("/schools/students"))).toBe(false);
    expect(isPeekable(null)).toBe(false);
  });

  it("sends each record to its own module's summary endpoint", () => {
    expect(recordSummaryPath(parseRecordHref("/crm/deals/a")!)).toBe(
      "/api/v2/crm/records/deal/a/summary",
    );
    expect(recordSummaryPath(parseRecordHref("/schools/students/abc")!)).toBe(
      "/api/v2/schools/records/student/abc/summary",
    );
    expect(
      recordSummaryPath(parseRecordHref("/management/master-data/schools/classes/f4")!),
    ).toBe("/api/v2/schools/records/class/f4/summary");
  });
});

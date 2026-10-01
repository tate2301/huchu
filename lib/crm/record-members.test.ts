import { describe, expect, it } from "vitest";

import { entryLine, entryRecord, recordMembers, type TimelineEntry } from "./record-members";

const entry = (overrides: Partial<TimelineEntry>): TimelineEntry => ({
  type: "NOTE",
  subject: "Spoke to the site manager",
  metadata: null,
  leadId: null,
  dealId: null,
  clientId: null,
  personId: null,
  ...overrides,
});

describe("entryRecord", () => {
  it("takes the record a field edit names, which is how a site's entries are found", () => {
    expect(
      entryRecord(entry({ type: "SYSTEM", metadata: { kind: "FIELD_CHANGE", entity: "SITE", recordId: "s1" } })),
    ).toEqual({ entity: "SITE", recordId: "s1" });
  });

  it("otherwise picks the most specific record: a quote on a deal is about the deal", () => {
    expect(entryRecord(entry({ dealId: "d1", clientId: "c1" }))).toEqual({ entity: "DEAL", recordId: "d1" });
    expect(entryRecord(entry({ clientId: "c1" }))).toEqual({ entity: "COMPANY", recordId: "c1" });
    expect(entryRecord(entry({}))).toBeNull();
  });
});

describe("entryLine", () => {
  it("names what was logged", () => {
    expect(entryLine(entry({ type: "CALL", subject: "Agreed the visit" }))).toBe("Call: Agreed the visit");
    expect(entryLine(entry({ type: "DOCUMENT_SENT", subject: "Emailed to a@b.example" }))).toBe(
      "Emailed to a@b.example",
    );
  });

  it("lists each edited field with its new value", () => {
    expect(
      entryLine(
        entry({
          type: "SYSTEM",
          metadata: {
            kind: "FIELD_CHANGE",
            changes: [
              { label: "Value", to: 4200 },
              { label: "Close date", to: null },
            ],
          },
        }),
      ),
    ).toBe("Value: 4200\nClose date cleared");
  });
});

describe("recordMembers", () => {
  it("is the followers and the owner, once each, without whoever did it", () => {
    expect(recordMembers({ followerIds: ["a", "b", "o"], ownerId: "o", actorId: "a" }).sort()).toEqual(["b", "o"]);
    expect(recordMembers({ followerIds: [], ownerId: null, actorId: "a" })).toEqual([]);
  });
});

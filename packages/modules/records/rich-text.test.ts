import { describe, it, expect } from "vitest";

import {
  activeReferenceQuery,
  extractMentionedUserIds,
  extractReferences,
  insertReference,
  parseInline,
  segmentRichText,
  toPlainText,
  togglePrefix,
  toggleMarker,
} from "./rich-text";

const USER = "11111111-1111-4111-8111-111111111111";
const DEAL = "22222222-2222-4222-8222-222222222222";

describe("segmentRichText", () => {
  it("still reads the mentions already in the database", () => {
    // These rows exist and notified somebody. A prefix migration buys nothing.
    const segments = segmentRichText(`Ping @[Ada Lovelace](${USER}) about it`);
    expect(segments[1]).toEqual({
      kind: "reference",
      reference: { kind: "user", id: USER, label: "Ada Lovelace" },
    });
  });

  it("reads a record reference", () => {
    const segments = segmentRichText(`Blocked on @[Roof job](deal:${DEAL})`);
    expect(segments[1]).toEqual({
      kind: "reference",
      reference: { kind: "deal", id: DEAL, label: "Roof job" },
    });
  });

  it("treats an unknown prefix as a person rather than dropping the token", () => {
    const segments = segmentRichText(`See @[Someone](wombat:${USER})`);
    expect(segments[1]).toMatchObject({ kind: "reference" });
  });

  it("leaves prose alone", () => {
    expect(segmentRichText("just words")).toEqual([{ kind: "text", text: "just words" }]);
  });
});

describe("extractReferences", () => {
  it("deduplicates the same record referred to twice", () => {
    const body = `@[Roof job](deal:${DEAL}) and again @[Roof job](deal:${DEAL})`;
    expect(extractReferences(body)).toHaveLength(1);
  });

  it("separates people from records, because only people get notified", () => {
    const body = `@[Ada](${USER}) look at @[Roof job](deal:${DEAL})`;
    expect(extractMentionedUserIds(body)).toEqual([USER]);
    expect(extractReferences(body)).toHaveLength(2);
  });
});

describe("toPlainText", () => {
  it("reads back the way somebody would say it", () => {
    expect(toPlainText(`**Urgent** — ping @[Ada](${USER})`)).toBe("Urgent — ping @Ada");
  });
});

describe("insertReference", () => {
  it("replaces the half-typed query rather than appending to it", () => {
    const body = "ping @ad";
    const result = insertReference(body, body.length, "ad", {
      kind: "user",
      id: USER,
      label: "Ada",
    });
    expect(result.body).toBe(`ping @[Ada](${USER}) `);
    expect(result.caret).toBe(result.body.length);
  });
});

describe("activeReferenceQuery", () => {
  it("opens on a bare @", () => {
    expect(activeReferenceQuery("hello @", 7)).toBe("");
  });

  it("stays shut once the word has a space in it", () => {
    expect(activeReferenceQuery("mail me @ the office", 20)).toBeNull();
  });

  it("stays shut on a finished reference", () => {
    expect(activeReferenceQuery(`@[Ada](${USER})`, 6)).toBeNull();
  });
});

describe("toggleMarker", () => {
  it("wraps a selection", () => {
    expect(toggleMarker("make this bold", 10, 14, "**").body).toBe("make this **bold**");
  });

  it("unwraps rather than doubling up", () => {
    const wrapped = "make this **bold**";
    expect(toggleMarker(wrapped, 12, 16, "**").body).toBe("make this bold");
  });

  it("leaves the caret between the markers when nothing is selected", () => {
    const result = toggleMarker("", 0, 0, "**");
    expect(result.body).toBe("****");
    expect(result.start).toBe(2);
  });
});

describe("togglePrefix", () => {
  it("bullets every selected line", () => {
    expect(togglePrefix("one\ntwo", 0, 7, "- ").body).toBe("- one\n- two");
  });

  it("removes the prefix when every line already has it", () => {
    expect(togglePrefix("- one\n- two", 0, 11, "- ").body).toBe("one\ntwo");
  });
});

describe("parseInline", () => {
  it("reads bold, italic and code", () => {
    expect(parseInline("**a** *b* `c`").filter((token) => token.kind !== "text")).toEqual([
      { kind: "bold", text: "a" },
      { kind: "italic", text: "b" },
      { kind: "code", text: "c" },
    ]);
  });

  it("does not run emphasis across a line break", () => {
    expect(parseInline("*not\nitalic*").every((token) => token.kind === "text")).toBe(true);
  });
});

// Where a reference sends the reader is the record registry's answer, and the
// registry is filled by a host's manifests; the href cases live in the host
// (`apps/enterprise/lib/host/rich-text-references.test.ts`).
describe("references", () => {
  it("reads a school reference somebody typed", () => {
    const segments = segmentRichText(`Sat with @[Form 2 Blue](class:${USER})`);
    expect(segments[1]).toEqual({
      kind: "reference",
      reference: { kind: "class", id: USER, label: "Form 2 Blue" },
    });
  });
});

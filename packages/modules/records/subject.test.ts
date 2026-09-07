/**
 * The subject pair, while both schemes are live.
 *
 * The risk in S-4.2 is not the new columns. It is the window in which a row may
 * carry the pair, the old columns, or both — so these tests are mostly about
 * reading a row correctly whichever state it is in, and about a filter that
 * finds it either way.
 */
import { describe, expect, it } from "vitest";

import {
  isValidReplyParent,
  subjectData,
  subjectFromEntity,
  subjectFromFileOwner,
  subjectOf,
  subjectWhere,
  SUBJECT_TYPES,
} from "./subject";

describe("reading a row's subject", () => {
  it("prefers the pair", () => {
    expect(
      subjectOf({ subjectType: "STUDENT", subjectId: "s1", dealId: "d1" }),
    ).toEqual({ type: "STUDENT", id: "s1" });
  });

  it("falls back to a legacy column for a row written before the backfill", () => {
    expect(subjectOf({ personId: "p1" })).toEqual({ type: "PERSON", id: "p1" });
    expect(subjectOf({ clientId: "c1" })).toEqual({ type: "COMPANY", id: "c1" });
    expect(subjectOf({ userId: "u1" })).toEqual({ type: "REP", id: "u1" });
  });

  it("resolves a multi-subject row to the narrowest column", () => {
    // CrmTask's schema comment says several may be set — "filed against a deal
    // and its site". The deal is what the task is about; the site is context.
    expect(subjectOf({ dealId: "d1", siteId: "s1" })).toEqual({ type: "DEAL", id: "d1" });
    expect(subjectOf({ leadId: "l1", clientId: "c1" })).toEqual({ type: "LEAD", id: "l1" });
  });

  it("returns null for a row that names nothing, which the old schema allowed", () => {
    expect(subjectOf({})).toBeNull();
    expect(subjectOf({ subjectType: "PERSON", subjectId: null })).toBeNull();
  });
});

describe("writing a row", () => {
  it("dual-writes the pair and the legacy column for a CRM subject", () => {
    expect(subjectData("comment", { type: "COMPANY", id: "c1" })).toEqual({
      subjectType: "COMPANY",
      subjectId: "c1",
      clientId: "c1",
    });
  });

  it("writes only the pair for a school subject, which has no column", () => {
    expect(subjectData("task", { type: "STUDENT", id: "s1" })).toEqual({
      subjectType: "STUDENT",
      subjectId: "s1",
    });
  });

  it("does not write userId on a table that has no such column", () => {
    // Only CrmRecordFile has `userId`. A task or comment about a rep gets the
    // pair alone rather than a write to a column that does not exist.
    expect(subjectData("file", { type: "REP", id: "u1" })).toEqual({
      subjectType: "REP",
      subjectId: "u1",
      userId: "u1",
    });
    expect(subjectData("task", { type: "REP", id: "u1" })).toEqual({
      subjectType: "REP",
      subjectId: "u1",
    });
  });
});

describe("finding a subject's rows", () => {
  it("matches either scheme for a CRM subject", () => {
    const where = subjectWhere("comment", { type: "DEAL", id: "d1" }) as unknown as {
      OR: Record<string, unknown>[];
    };
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0]).toEqual({ subjectType: "DEAL", subjectId: "d1" });
    // The legacy arm pins the others to null, which is what stops a row with two
    // columns set appearing under both of them.
    expect(where.OR[1]).toEqual({
      leadId: null,
      dealId: "d1",
      clientId: null,
      personId: null,
      siteId: null,
    });
  });

  it("has only the pair arm for a school subject", () => {
    const where = subjectWhere("task", { type: "STUDENT", id: "s1" }) as unknown as {
      OR: Record<string, unknown>[];
    };
    expect(where.OR).toEqual([{ subjectType: "STUDENT", subjectId: "s1" }]);
  });

  it("includes userId in a file's legacy arm and not a comment's", () => {
    const file = subjectWhere("file", { type: "PERSON", id: "p1" }) as unknown as {
      OR: Record<string, unknown>[];
    };
    expect(Object.keys(file.OR[1])).toContain("userId");
    const comment = subjectWhere("comment", { type: "PERSON", id: "p1" }) as unknown as {
      OR: Record<string, unknown>[];
    };
    expect(Object.keys(comment.OR[1])).not.toContain("userId");
  });
});

describe("replying to a comment", () => {
  const subject = { type: "STUDENT", id: "s1" } as const;

  it("accepts a top-level parent on the same subject", () => {
    expect(
      isValidReplyParent({ subjectType: "STUDENT", subjectId: "s1", parentId: null }, subject),
    ).toBe(true);
  });

  it("refuses a parent on a different subject", () => {
    expect(
      isValidReplyParent({ subjectType: "STUDENT", subjectId: "other", parentId: null }, subject),
    ).toBe(false);
    expect(
      isValidReplyParent({ subjectType: "GUARDIAN", subjectId: "s1", parentId: null }, subject),
    ).toBe(false);
  });

  it("refuses a reply to a reply — one level of nesting", () => {
    expect(
      isValidReplyParent(
        { subjectType: "STUDENT", subjectId: "s1", parentId: "another" },
        subject,
      ),
    ).toBe(false);
  });

  it("works when the parent predates the backfill", () => {
    expect(isValidReplyParent({ personId: "p1", parentId: null }, { type: "PERSON", id: "p1" })).toBe(
      true,
    );
  });
});

describe("translating the callers' vocabulary", () => {
  it("maps every file-owner kind, old and new", () => {
    for (const [owner, expected] of [
      ["company", "COMPANY"],
      ["rep", "REP"],
      ["student", "STUDENT"],
      ["hostel", "HOSTEL"],
    ] as const) {
      expect(subjectFromFileOwner(owner, "x")).toEqual({ type: expected, id: "x" });
    }
  });

  it("refuses an owner it does not know rather than guessing", () => {
    expect(subjectFromFileOwner("wombat", "x")).toBeNull();
    expect(subjectFromEntity("WOMBAT", "x")).toBeNull();
  });

  it("accepts a collaboration entity in either case", () => {
    expect(subjectFromEntity("COMPANY", "c1")).toEqual({ type: "COMPANY", id: "c1" });
    expect(subjectFromEntity("student", "s1")).toEqual({ type: "STUDENT", id: "s1" });
  });

  it("covers every subject type from the file-owner side", () => {
    // A type nothing can map to is a type no UI can ever file against.
    const reachable = new Set(
      SUBJECT_TYPES.map((type) => subjectFromFileOwner(type.toLowerCase(), "x")?.type).filter(
        Boolean,
      ),
    );
    expect([...reachable].sort()).toEqual([...SUBJECT_TYPES].sort());
  });
});

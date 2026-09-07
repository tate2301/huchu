import { describe, expect, it } from "vitest";

import {
  FILE_OWNERS,
  ownerColumn,
  ownerWhere,
  recordFileSchema,
} from "./record-files";

describe("ownerColumn", () => {
  it("keeps a rep apart from a customer contact", () => {
    // A rep is somebody who works here, not somebody we sell to. Squeezing
    // both into personId is how a rep's signed policy turns up on a
    // customer's profile.
    expect(ownerColumn("rep")).toBe("userId");
    expect(ownerColumn("person")).toBe("personId");
  });

  it("uses the column the company record actually has", () => {
    // The company record is CrmClient; "company" is what a reader calls it.
    expect(ownerColumn("company")).toBe("clientId");
  });

  /**
   * S-4.2 changed what this function promises. It used to name a column for
   * every owner, because every owner HAD one — that was the design, and it was
   * also the reason a student could not own a file. The subject now lives in
   * `(subjectType, subjectId)`, and the school kinds have no legacy column at
   * all, so `ownerColumn` returns null for them.
   */
  const KINDS_WITH_A_LEGACY_COLUMN = ["lead", "deal", "company", "person", "site", "rep"] as const;

  it("names a column for every owner that has one", () => {
    for (const owner of KINDS_WITH_A_LEGACY_COLUMN) {
      expect(ownerColumn(owner)).toMatch(/Id$/);
    }
  });

  it("names no column for a school owner, which is the point of S-4.2", () => {
    for (const owner of ["student", "guardian", "teacher", "class", "subject", "hostel"] as const) {
      expect(ownerColumn(owner)).toBeNull();
    }
  });

  it("gives every owner that has a column a distinct one", () => {
    const columns = KINDS_WITH_A_LEGACY_COLUMN.map(ownerColumn);
    expect(new Set(columns).size).toBe(columns.length);
  });

  it("still accounts for every accepted owner one way or the other", () => {
    // A kind that is neither in the legacy list nor a school type would fall
    // through `ownerColumn`'s default and silently get no column — which for a
    // CRM kind would mean files that vanish from the page they were filed on.
    const schoolKinds = new Set(["student", "guardian", "teacher", "class", "subject", "hostel"]);
    const legacy = new Set<string>(KINDS_WITH_A_LEGACY_COLUMN);
    for (const owner of FILE_OWNERS) {
      expect(legacy.has(owner) || schoolKinds.has(owner), `${owner} is unaccounted for`).toBe(true);
    }
  });
});

describe("ownerWhere", () => {
  it("sets exactly one column", () => {
    const where = ownerWhere({ kind: "deal", id: "d1" });
    expect(where).toEqual({ dealId: "d1" });
    expect(Object.keys(where)).toHaveLength(1);
  });
});

describe("recordFileSchema", () => {
  const valid = {
    owner: "company" as const,
    ownerId: "0f9d5b6c-1c2a-4b3d-8e7f-1a2b3c4d5e6f",
    name: "Signed contract.pdf",
    url: "https://blob.example.com/signed-contract.pdf",
  };

  it("accepts a file with just a name and a url", () => {
    expect(recordFileSchema.parse(valid)).toMatchObject({ name: "Signed contract.pdf" });
  });

  it("refuses a url that is not one", () => {
    // The url is rendered as a link and opened in a new tab. Anything that is
    // not a real url either does nothing or does something worse.
    expect(() => recordFileSchema.parse({ ...valid, url: "not a url" })).toThrow();
  });

  it("refuses a file with no name to show", () => {
    expect(() => recordFileSchema.parse({ ...valid, name: "   " })).toThrow();
  });

  it("refuses an owner it has no column for", () => {
    expect(() => recordFileSchema.parse({ ...valid, owner: "invoice" })).toThrow();
  });

  it("refuses an owner id that is not an id", () => {
    expect(() => recordFileSchema.parse({ ...valid, ownerId: "42" })).toThrow();
  });

  it("treats a missing size as unknown rather than zero", () => {
    const parsed = recordFileSchema.parse(valid);
    expect(parsed.size).toBeUndefined();
  });
});

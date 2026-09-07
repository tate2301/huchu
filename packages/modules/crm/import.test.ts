import { describe, expect, it } from "vitest";

import { guessMapping, parseCsv, rowToRecord } from "./csv";
import {
  IMPORT_FIELDS,
  buildImportPlan,
  columnPreview,
  importRowKey,
  mappingWarnings,
  parseImportList,
  parseImportNumber,
} from "./import";
import {
  COMPANY_MERGE_FIELDS,
  mergeLists,
  planMerge,
  resolveMerge,
  validateMergePair,
} from "./merge";

describe("parseCsv", () => {
  it("reads a plain file", () => {
    const table = parseCsv("name,email\nAma,ama@example.com\nBen,ben@example.com\n");
    expect(table.headers).toEqual(["name", "email"]);
    expect(table.rows).toEqual([
      ["Ama", "ama@example.com"],
      ["Ben", "ben@example.com"],
    ]);
  });

  it("keeps a newline inside a quoted address in one field", () => {
    // A line-based reader turns this one customer into two broken ones.
    const table = parseCsv('name,address\n"Ama","12 Samora Ave\nHarare"\n');
    expect(table.rows).toEqual([["Ama", "12 Samora Ave\nHarare"]]);
  });

  it("handles commas and escaped quotes inside fields", () => {
    const table = parseCsv('name,note\n"Chi, Ltd","said ""yes"" twice"\n');
    expect(table.rows).toEqual([["Chi, Ltd", 'said "yes" twice']]);
  });

  it("strips the byte-order mark Excel puts on the first column", () => {
    const table = parseCsv("﻿name,email\nAma,a@b.com");
    expect(table.headers[0]).toBe("name");
  });

  it("survives CRLF line endings and a trailing newline", () => {
    const table = parseCsv("name\r\nAma\r\nBen\r\n");
    expect(table.rows).toEqual([["Ama"], ["Ben"]]);
  });

  it("returns nothing for an empty file rather than a phantom row", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});

describe("guessMapping", () => {
  it("matches headers however they were capitalised or spaced", () => {
    const mapping = guessMapping(
      ["First Name", "Surname", "E-mail Address", "Mobile"],
      IMPORT_FIELDS.PERSON,
    );
    expect(mapping.firstName).toBe("First Name");
    expect(mapping.lastName).toBe("Surname");
    expect(mapping.email).toBe("E-mail Address");
    expect(mapping.phone).toBe("Mobile");
  });

  it("leaves a field unmapped rather than guessing wildly", () => {
    const mapping = guessMapping(["column a", "column b"], IMPORT_FIELDS.PERSON);
    expect(mapping.firstName).toBeUndefined();
  });

  it("never claims one column for two fields", () => {
    const mapping = guessMapping(["Name", "Name"], IMPORT_FIELDS.COMPANY);
    expect(Object.values(mapping).length).toBe(new Set(Object.values(mapping)).size);
  });
});

describe("rowToRecord", () => {
  it("drops empty cells so a blank doesn't overwrite a real value", () => {
    const record = rowToRecord(["a", "b"], ["x", ""], { firstName: "a", lastName: "b" });
    expect(record).toEqual({ firstName: "x" });
  });
});

describe("parseImportNumber", () => {
  it("reads the ways spreadsheets write money", () => {
    expect(parseImportNumber("1,250.00")).toBe(1250);
    expect(parseImportNumber("$1250")).toBe(1250);
    expect(parseImportNumber("-40")).toBe(-40);
  });

  it("returns null rather than zero for something that isn't a number", () => {
    // Zero would import as a real deal worth nothing.
    expect(parseImportNumber("about ten")).toBeNull();
    expect(parseImportNumber("")).toBeNull();
    expect(parseImportNumber("-")).toBeNull();
  });
});

describe("parseImportList", () => {
  it("splits a single cell of tags", () => {
    expect(parseImportList("solar; roofing , install")).toEqual(["solar", "roofing", "install"]);
  });
});

describe("buildImportPlan", () => {
  const table = parseCsv(
    "First Name,Surname,Email\nAma,Moyo,ama@example.com\nBen,Ncube,ben@example.com\n,Sibanda,\n",
  );
  const mapping = { entity: "PERSON" as const, mapping: guessMapping(table.headers, IMPORT_FIELDS.PERSON), onDuplicate: "SKIP" as const };

  it("plans a create per valid row and skips the invalid one", () => {
    const plan = buildImportPlan(table, mapping);
    expect(plan.totals).toEqual({ create: 2, update: 0, skip: 1 });
    expect(plan.rows[2].issues[0].message).toContain("First name is required");
  });

  it("numbers rows the way the spreadsheet does, header included", () => {
    const plan = buildImportPlan(table, mapping);
    expect(plan.rows.map((row) => row.line)).toEqual([2, 3, 4]);
  });

  it("flags a row that repeats a contact already in the file", () => {
    const dupes = parseCsv("First Name,Email\nAma,ama@example.com\nAma,AMA@example.com\n");
    const plan = buildImportPlan(dupes, {
      ...mapping,
      mapping: guessMapping(dupes.headers, IMPORT_FIELDS.PERSON),
    });
    expect(plan.rows[1].action).toBe("SKIP");
    expect(plan.rows[1].issues[0].message).toContain("row 2");
  });

  it("skips an existing match by default and updates only when told to", () => {
    const match = () => ({ id: "p-1", label: "Ama Moyo" });
    const skipped = buildImportPlan(table, mapping, match);
    expect(skipped.totals.update).toBe(0);
    expect(skipped.totals.skip).toBe(3);

    const updating = buildImportPlan(table, { ...mapping, onDuplicate: "UPDATE" }, match);
    expect(updating.totals.update).toBe(2);
    expect(updating.rows[0].matchLabel).toBe("Ama Moyo");
  });

  it("names the columns nobody mapped, so nothing is lost quietly", () => {
    const extra = parseCsv("First Name,Loyalty Points\nAma,40\n");
    const plan = buildImportPlan(extra, {
      ...mapping,
      mapping: guessMapping(extra.headers, IMPORT_FIELDS.PERSON),
    });
    expect(plan.unmappedHeaders).toEqual(["Loyalty Points"]);
  });

  it("ignores the blank rows at the bottom of a spreadsheet", () => {
    const padded = parseCsv("First Name,Email\nAma,a@b.com\n,\n,\n");
    const plan = buildImportPlan(padded, {
      ...mapping,
      mapping: guessMapping(padded.headers, IMPORT_FIELDS.PERSON),
    });
    expect(plan.rows).toHaveLength(1);
  });

  it("rejects an address that isn't one", () => {
    const bad = parseCsv("First Name,Email\nAma,not-an-email\n");
    const plan = buildImportPlan(bad, {
      ...mapping,
      mapping: guessMapping(bad.headers, IMPORT_FIELDS.PERSON),
    });
    expect(plan.rows[0].action).toBe("SKIP");
    expect(plan.rows[0].issues[0].message).toContain("doesn't look like an email");
  });
});

describe("importRowKey", () => {
  it("prefers email, then name for companies, then phone", () => {
    expect(importRowKey("PERSON", { email: "A@B.com" })).toBe("email:a@b.com");
    expect(importRowKey("COMPANY", { name: "Chi Ltd" })).toBe("name:chi ltd");
    expect(importRowKey("PERSON", { phone: "+263 77 123 4567" })).toBe("phone:263771234567");
    expect(importRowKey("PERSON", { firstName: "Ama" })).toBeNull();
  });
});

describe("planMerge", () => {
  const survivor = { name: "Chi Ltd", phone: "", city: "Harare", tags: ["vip"] };
  const loser = { name: "Chi Limited", phone: "+263771234567", city: "Harare", tags: ["import"] };

  it("fills the survivor's gaps without overwriting what it has", () => {
    const plans = planMerge(COMPANY_MERGE_FIELDS, survivor, loser);
    const byField = Object.fromEntries(plans.map((plan) => [plan.field, plan]));
    expect(byField.phone.chosen).toBe("LOSER");
    expect(byField.name.chosen).toBe("SURVIVOR");
  });

  it("flags a real disagreement but not an agreement", () => {
    const plans = planMerge(COMPANY_MERGE_FIELDS, survivor, loser);
    const byField = Object.fromEntries(plans.map((plan) => [plan.field, plan]));
    expect(byField.name.conflict).toBe(true);
    expect(byField.city.conflict).toBe(false);
    expect(byField.phone.conflict).toBe(false);
  });

  it("resolves to only the fields the loser wins", () => {
    const plans = planMerge(COMPANY_MERGE_FIELDS, survivor, loser);
    expect(resolveMerge(plans)).toEqual({ phone: "+263771234567" });
    expect(resolveMerge(plans, { name: "LOSER" })).toEqual({
      name: "Chi Limited",
      phone: "+263771234567",
    });
  });
});

describe("mergeLists", () => {
  it("keeps both sides' tags without duplicating them", () => {
    expect(mergeLists(["vip", "solar"], ["solar", "import"]).sort()).toEqual([
      "import",
      "solar",
      "vip",
    ]);
  });
});

describe("validateMergePair", () => {
  it("refuses to fold a record into itself", () => {
    expect(validateMergePair({ id: "a" }, { id: "a" })).toContain("itself");
  });

  it("refuses to build a chain nothing can follow back", () => {
    expect(validateMergePair({ id: "a", mergedIntoId: "b" }, { id: "c" })).toContain(
      "already been merged",
    );
    expect(validateMergePair({ id: "a" }, { id: "c", mergedIntoId: "d" })).toContain(
      "already been merged",
    );
  });

  it("allows a clean pair", () => {
    expect(validateMergePair({ id: "a" }, { id: "b" })).toBeNull();
  });
});

describe("columnPreview", () => {
  const table = {
    headers: ["email", "phone", "notes"],
    rows: [
      ["a@x.com", "0771", "hello"],
      ["b@x.com", "", ""],
      ["a@x.com", "0772", ""],
      ["c@x.com", "", ""],
    ],
  };

  it("shows the first distinct values rather than the first rows", () => {
    // A column whose first three rows repeat one value tells you nothing.
    expect(columnPreview(table, "email")?.samples).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
    ]);
  });

  it("counts the blanks, which is the thing a header cannot tell you", () => {
    expect(columnPreview(table, "notes")).toMatchObject({ blanks: 3, total: 4 });
  });

  it("returns nothing for a column that is not there", () => {
    expect(columnPreview(table, "nope")).toBeNull();
  });
});

describe("mappingWarnings", () => {
  it("catches an email column with no email in it", () => {
    const preview = { samples: ["Acme Ltd", "Beacon"], blanks: 0, total: 2, distinct: 2 };
    expect(mappingWarnings("email", preview).join(" ")).toContain("email");
  });

  it("stays quiet when the column looks right", () => {
    const preview = { samples: ["a@x.com"], blanks: 0, total: 1, distinct: 1 };
    expect(mappingWarnings("email", preview)).toEqual([]);
  });

  it("flags a column that is mostly empty", () => {
    const preview = { samples: ["x"], blanks: 9, total: 10, distinct: 1 };
    expect(mappingWarnings("city", preview).join(" ")).toContain("90%");
  });

  it("says nothing about a field it has no opinion on", () => {
    const preview = { samples: ["anything"], blanks: 0, total: 1, distinct: 1 };
    expect(mappingWarnings("notes", preview)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { renderCsv } from "./csv-renderer";

const BOM = "﻿";

describe("renderCsv", () => {
  it("heads each column with its label, not its key", () => {
    const csv = renderCsv([{ fullName: "Tendai Moyo" }], [{ key: "fullName", label: "Name" }]);
    expect(csv).toBe(`${BOM}Name\r\nTendai Moyo\r\n`);
  });

  it("writes the header even with no rows, so an empty export still says what it is", () => {
    expect(renderCsv([], [{ key: "a", label: "A" }, { key: "b", label: "B" }])).toBe(`${BOM}A,B\r\n`);
  });

  it("falls back to the first row's keys without columns", () => {
    expect(renderCsv([{ a: 1, b: 2 }])).toBe(`${BOM}a,b\r\n1,2\r\n`);
  });

  it("quotes commas, quotes and line breaks", () => {
    const csv = renderCsv(
      [{ v: 'Moyo, "T"' }, { v: "line one\nline two" }, { v: "a\rb" }],
      [{ key: "v", label: "V" }],
    );
    expect(csv).toBe(`${BOM}V\r\n"Moyo, ""T"""\r\n"line one\nline two"\r\n"a\rb"\r\n`);
  });

  it("writes flags, lists and blanks plainly", () => {
    const csv = renderCsv(
      [{ flag: true, off: false, tags: ["vip", "north"], none: null }],
      [
        { key: "flag", label: "Flag" },
        { key: "off", label: "Off" },
        { key: "tags", label: "Tags" },
        { key: "none", label: "None" },
      ],
    );
    expect(csv).toBe(`${BOM}Flag,Off,Tags,None\r\nYes,No,"vip, north",\r\n`);
  });

  it("defuses cells a spreadsheet would run as a formula", () => {
    const rows = ["=HYPERLINK(\"x\")", "@SUM(A1)", "+cmd|' /C calc'!A0", "-2+3+cmd", "\tTAB"].map((v) => ({ v }));
    const lines = renderCsv(rows, [{ key: "v", label: "V" }]).split("\r\n").slice(1, -1);
    for (const line of lines) {
      expect(line.replace(/^"/, "").startsWith("'")).toBe(true);
    }
  });

  it("leaves phone numbers and signed figures alone", () => {
    const csv = renderCsv(
      [{ v: "+263 77 123 4567" }, { v: "-12.50" }, { v: "+1 (555) 010-0000" }, { v: -4 }],
      [{ key: "v", label: "V" }],
    );
    expect(csv).toBe(`${BOM}V\r\n+263 77 123 4567\r\n-12.50\r\n+1 (555) 010-0000\r\n-4\r\n`);
  });
});

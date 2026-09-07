import { describe, it, expect } from "vitest";

import { defaultHidden, type ColumnOption } from "./visible-columns";

const COLUMNS: ColumnOption[] = [
  { id: "name", label: "Name", required: true },
  { id: "owner", label: "Owner" },
  { id: "source", label: "Source", hiddenByDefault: true },
  { id: "locked", label: "Locked", required: true, hiddenByDefault: true },
];

describe("defaultHidden", () => {
  it("starts the opt-in columns hidden", () => {
    expect(defaultHidden(COLUMNS)).toContain("source");
  });

  it("leaves the columns a surface needs alone", () => {
    // A required column marked hiddenByDefault is a contradiction somebody
    // will write eventually; required wins, because a table without its name
    // column is not a table with a preference, it is broken.
    expect(defaultHidden(COLUMNS)).not.toContain("locked");
    expect(defaultHidden(COLUMNS)).not.toContain("name");
  });

  it("shows everything else", () => {
    expect(defaultHidden(COLUMNS)).not.toContain("owner");
  });
});

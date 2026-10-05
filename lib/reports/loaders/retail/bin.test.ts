import { describe, expect, it } from "vitest";

import { toBinRow } from "./bin";

const base = { name: "Nederburg Rosé 750ml", reference: "NEDERBURG-ROSE-750", label: "Product", binnedBy: "Tendai Mhlanga" };

describe("a bin row (80-admin 5.10)", () => {
  it("carries its kind in its id, its 30th day, and Open it for those who may open the record", () => {
    const now = new Date("2026-10-03T10:00:00Z");
    const row = toBinRow({ ...base, kind: "product", id: "p1", binnedAt: new Date("2026-10-03T07:02:00Z") }, "SUPERADMIN", now);
    expect(row).toMatchObject({
      id: "product:p1",
      kind: "product",
      what: "Nederburg Rosé 750ml",
      kindLabel: "Product",
      binnedBy: "Tendai Mhlanga",
      binnedAt: "2026-10-03T07:02:00.000Z",
      goneAt: "2026-11-02T07:02:00.000Z",
      goneTone: null,
      restore: "Restore",
      openable: "yes",
      productId: "p1",
    });
  });

  it("reads the last three days in warn", () => {
    const now = new Date("2026-10-31T08:00:00Z");
    const row = toBinRow({ ...base, kind: "product", id: "p1", binnedAt: new Date("2026-10-03T07:02:00Z") }, "SUPERADMIN", now);
    expect(row.goneTone).toBe("warn");
  });

  it("has no Open it for kinds with no record page, or roles that may not open it", () => {
    const binnedAt = new Date("2026-10-03T07:02:00Z");
    const now = new Date("2026-10-04T00:00:00Z");
    expect(toBinRow({ ...base, kind: "category", id: "c1", binnedAt }, "SUPERADMIN", now)).toMatchObject({ openable: null });
    expect(toBinRow({ ...base, kind: "product", id: "p1", binnedAt }, "NO_SUCH_ROLE", now)).toMatchObject({ openable: null });
  });
});

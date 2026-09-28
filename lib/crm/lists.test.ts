import { describe, expect, it } from "vitest";

import { listIdFilter } from "./lists";

describe("listIdFilter", () => {
  it("narrows to the list's members", () => {
    expect(listIdFilter(["a", "b"])).toEqual({ id: { in: ["a", "b"] } });
  });

  it("matches nothing for an empty list rather than everything", () => {
    // Ignoring the filter would show the whole table, which reads as though
    // the filter had failed rather than as an empty list.
    expect(listIdFilter([])).toEqual({ id: { in: [] } });
  });

  it("applies no filter when there is no list", () => {
    expect(listIdFilter(null)).toBeUndefined();
  });
});

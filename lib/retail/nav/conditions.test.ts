import { describe, expect, it } from "vitest";

import { hiddenRetailNavHrefs } from "./index";

describe("items that wait on a fact about the shop", () => {
  it("hides Transfers until the shop has two open sites", () => {
    expect(hiddenRetailNavHrefs({ "multi-site": false }).has("/retail/stock/transfers")).toBe(true);
    expect(hiddenRetailNavHrefs(null).has("/retail/stock/transfers")).toBe(true);
    expect(hiddenRetailNavHrefs({ "multi-site": true }).has("/retail/stock/transfers")).toBe(false);
  });

  it("never hides an item that waits on nothing", () => {
    const hidden = hiddenRetailNavHrefs(null);
    expect(hidden.has("/retail/stock")).toBe(false);
    expect(hidden.has("/retail/stock/movements")).toBe(false);
  });
});

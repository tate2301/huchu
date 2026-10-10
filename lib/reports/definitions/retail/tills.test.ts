import { describe, expect, it } from "vitest";

import { LIST_ACTION_RUNS } from "@/lib/retail/asks";

import { TILL_REPORTS } from "./tills";

const list = TILL_REPORTS[0]!.list!;

describe("Tills and devices (10-setup 5.5)", () => {
  it("sorts the default site first, then the others by name, then the tills by name", () => {
    expect(list.sorts[0]).toEqual({
      key: "site",
      label: "Site, then name",
      rules: [
        { column: "siteOrder", dir: "asc" },
        { column: "name", dir: "asc" },
      ],
    });
  });

  it("draws Site and State on the toolbar and Device inside Filters", () => {
    const choices = list.filters.filter((filter) => filter.type === "choice");
    expect(choices.map((filter) => [filter.key, Boolean(filter.primary)])).toEqual([
      ["site", true],
      ["state", true],
      ["device", false],
    ]);
  });

  it("leaves Last sale blank before a till's first sale, in mono", () => {
    expect(list.columns.find((column) => column.key === "lastSale")).toMatchObject({ cell: "mono", empty: "blank" });
  });

  it("puts the phone card's meta on two lines", () => {
    expect(list.card).toMatchObject({ meta: "{site} · {device}", meta2: "{lastSaleCard} · {onItNow}" });
  });

  it("unpairs from the row menu through the TillEdit confirm, not a sheet", () => {
    const unpair = list.rowMenu!.find((action) => action.key === "unpair")!;
    expect(unpair.do).toEqual({ run: "unpairtill", endpoint: "/api/v2/retail/tills/{id}/unpair" });
    expect(LIST_ACTION_RUNS.unpairtill?.ask).toBeDefined();
  });
});

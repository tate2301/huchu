import { describe, expect, it } from "vitest";

import { Receipt } from "@/lib/icons";

import { getActiveNavHref, matchesNavHref } from "./sidebar-helpers";

const q = (search: string) => new URLSearchParams(search);

describe("matchesNavHref", () => {
  it("matches a plain item on its path and below it", () => {
    expect(matchesNavHref("/retail/products", "/retail/products/abc", q(""))).toBe(true);
    expect(matchesNavHref("/retail/products", "/retail/productsx", q(""))).toBe(false);
  });

  it("matches a query item on its path and every param it names", () => {
    expect(matchesNavHref("/reports?area=selling", "/reports", q("area=selling&page=2"))).toBe(true);
    expect(matchesNavHref("/reports?area=selling", "/reports", q("area=stock"))).toBe(false);
    expect(matchesNavHref("/reports?area=selling", "/reports/x", q("area=selling"))).toBe(false);
  });
});

describe("getActiveNavHref", () => {
  const sections = [
    {
      id: "s",
      title: "S",
      items: ["/retail", "/retail/stock", "/retail/stock/movements", "/reports", "/reports?area=selling"].map(
        (href) => ({ href, label: href, icon: Receipt }),
      ),
    },
  ];

  it("takes the longest path", () => {
    expect(getActiveNavHref(sections, "/retail/stock/movements", q(""))).toBe("/retail/stock/movements");
    expect(getActiveNavHref(sections, "/retail/stock/counts", q(""))).toBe("/retail/stock");
  });

  it("prefers the query item when its params match", () => {
    expect(getActiveNavHref(sections, "/reports", q("area=selling"))).toBe("/reports?area=selling");
    expect(getActiveNavHref(sections, "/reports", q(""))).toBe("/reports");
  });
});

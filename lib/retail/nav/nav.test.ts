import { describe, expect, it } from "vitest";

import { getActiveNavHref } from "@/lib/nav-match";

import {
  canRoleOpenRetailPath,
  RETAIL_NAV_ITEMS,
  RETAIL_NAV_MODULES,
  retailNavItemForPath,
  roleMeetsRetailRequires,
} from "./index";
import { manageNav } from "./manage";

const q = (search = "") => new URLSearchParams(search);

describe("the retail nav registry (00-foundations 5.3.4)", () => {
  it("lists the modules in rail order, one file each", () => {
    expect(RETAIL_NAV_MODULES.map((module) => module.title)).toEqual([
      "The floor",
      "Products",
      "Stock",
      "Buying",
      "Insights",
      "Reports",
      "Management",
    ]);
  });

  it("says who sees every item, and lists each route once", () => {
    for (const item of RETAIL_NAV_ITEMS) expect(item.requires.length).toBeGreaterThan(0);
    const hrefs = RETAIL_NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("finds a page's item, a record inheriting its list's", () => {
    expect(retailNavItemForPath("/retail/products/abc", q())?.label).toBe("Products");
    expect(retailNavItemForPath("/retail/insights/money", q())?.label).toBe("Money");
    expect(retailNavItemForPath("/retail", q())?.label).toBe("Overview");
    // Overview is the root, not the parent of every retail page.
    expect(retailNavItemForPath("/retail/setup/sites", q())).toBeNull();
  });
});

describe("who may open a retail page", () => {
  it("keeps the cashier to their own floor, the shelf and their requisitions", () => {
    for (const path of ["/retail/shifts", "/retail/sales", "/retail/products", "/retail/buying/requisitions"]) {
      expect(canRoleOpenRetailPath("CASHIER", path, q())).toBe(true);
    }
    for (const path of ["/retail", "/retail/stock", "/retail/manage/tills", "/retail/manage/bin", "/retail/insights/sales"]) {
      expect(canRoleOpenRetailPath("CASHIER", path, q())).toBe(false);
    }
  });

  it("keeps the stock clerk out of the overview and Management", () => {
    expect(canRoleOpenRetailPath("STOCK_CLERK", "/retail/stock/counts", q())).toBe(true);
    expect(canRoleOpenRetailPath("STOCK_CLERK", "/retail/buying/deliveries", q())).toBe(true);
    expect(canRoleOpenRetailPath("STOCK_CLERK", "/retail", q())).toBe(false);
    expect(canRoleOpenRetailPath("STOCK_CLERK", "/retail/manage/till-rules", q())).toBe(false);
  });

  it("keeps the manager off Money and Posting to the books", () => {
    expect(canRoleOpenRetailPath("MANAGER", "/retail/insights/sales", q())).toBe(true);
    expect(canRoleOpenRetailPath("MANAGER", "/retail/insights/money", q())).toBe(false);
    expect(canRoleOpenRetailPath("MANAGER", "/retail/manage/posting", q())).toBe(false);
    expect(canRoleOpenRetailPath("SUPERADMIN", "/retail/manage/posting", q())).toBe(true);
  });
});

describe("the current item", () => {
  const visible = (hrefs: string[]) => [
    { id: "s", title: "S", items: RETAIL_NAV_ITEMS.filter((item) => hrefs.includes(item.href)) },
  ];

  it("lights nothing on a page whose item this person cannot see", () => {
    const manager = visible(["/retail", "/retail/insights/sales"]);
    expect(getActiveNavHref(manager, "/retail/insights/money", q(), RETAIL_NAV_ITEMS)).toBeNull();
    const owner = visible(["/retail", "/retail/stock"]);
    expect(getActiveNavHref(owner, "/retail/stock/transfers", q(), RETAIL_NAV_ITEMS)).toBeNull();
  });

  it("lights the item and its records", () => {
    const owner = visible(["/retail", "/retail/stock", "/retail/products"]);
    expect(getActiveNavHref(owner, "/retail", q(), RETAIL_NAV_ITEMS)).toBe("/retail");
    expect(getActiveNavHref(owner, "/retail/products/abc", q(), RETAIL_NAV_ITEMS)).toBe("/retail/products");
  });
});

describe("the Management panel per role (ADM-01)", () => {
  const panel = (role: string) =>
    manageNav.items.filter((item) => roleMeetsRetailRequires(role, item.requires)).map((item) => item.label);

  it("shows the owner every item", () => {
    expect(panel("SUPERADMIN")).toEqual(manageNav.items.map((item) => item.label));
  });

  it.each(["MANAGER", "SHOP_MANAGER"])("shows the %s all but Posting to the books", (role) => {
    expect(panel(role)).toEqual(["Tills and devices", "Till rules", "Fiscal device", "Bin"]);
  });

  it("shows the bookkeeper the fiscal device and posting", () => {
    expect(panel("FINANCE_OFFICER")).toEqual(["Fiscal device", "Posting to the books"]);
  });

  it.each(["CASHIER", "STOCK_CLERK"])("gives the %s no gear", (role) => {
    expect(panel(role)).toEqual([]);
  });
});

describe("who sees what, from the Roles matrix (00-foundations 5.3.4)", () => {
  const sees = (role: string) =>
    RETAIL_NAV_ITEMS.filter((item) => roleMeetsRetailRequires(role, item.requires)).map((item) => item.href);

  it("gives the bookkeeper the books and the readings, never the till", () => {
    const bookkeeper = sees("FINANCE_OFFICER");
    for (const href of ["/retail", "/retail/sales", "/retail/shifts", "/retail/customers", "/retail/products/categories", "/retail/insights/money"]) {
      expect(bookkeeper).toContain(href);
    }
    expect(bookkeeper).not.toContain("/retail/manage/tills");
  });

  it("gives the cashier and the stock clerk their own requisitions", () => {
    expect(sees("CASHIER")).toContain("/retail/buying/requisitions");
    expect(sees("STOCK_CLERK")).toContain("/retail/buying/requisitions");
    expect(sees("STOCK_CLERK")).not.toContain("/retail/products/categories");
    expect(sees("CASHIER")).toContain("/retail/products/price-lists");
  });
});

import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getActiveNavHref } from "@/lib/nav-match";

import {
  canRoleOpenRetailPath,
  hiddenRetailNavHrefs,
  RETAIL_NAV_ITEMS,
  RETAIL_NAV_MODULES,
  retailNavItemForPath,
  roleMeetsRetailRequires,
} from "./index";
import { reportsNav } from "./reports";
import { setupNav } from "./setup";

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
      "Setup",
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

  it("lets a cashier asked to count reach the phone count, never Counts itself", () => {
    expect(canRoleOpenRetailPath("CASHIER", "/retail/stock/counts/0b0c4f9e-2a0f-4a7e-9a52-0d1f0c0e7a11/count", q())).toBe(true);
    expect(canRoleOpenRetailPath("CASHIER", "/retail/stock/counts", q())).toBe(false);
    expect(canRoleOpenRetailPath("CASHIER", "/retail/stock/counts/0b0c4f9e-2a0f-4a7e-9a52-0d1f0c0e7a11", q())).toBe(false);
  });

  it("keeps the stock clerk out of the overview and Setup", () => {
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

describe("the Setup module per role (ADM-01)", () => {
  const panel = (role: string) =>
    setupNav.items.filter((item) => roleMeetsRetailRequires(role, item.requires)).map((item) => item.label);

  it("shows the owner every item", () => {
    expect(panel("SUPERADMIN")).toEqual(setupNav.items.map((item) => item.label));
    expect(panel("SUPERADMIN")).toEqual([
      "Shop",
      "Sites",
      "Tills and devices",
      "Payments",
      "Till rules",
      "Receipts",
      "Fiscal device",
      "Posting to the books",
      "Staff and PINs",
      "Approvals",
      "Bin",
    ]);
  });

  it("lists every retail settings page that exists, and no Management page", () => {
    const manage = setupNav.items.map((item) => item.href).filter((href) => href.startsWith("/retail/manage/"));
    expect(manage.sort()).toEqual(
      readdirSync(join(process.cwd(), "app/retail/manage"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `/retail/manage/${entry.name}`)
        .sort(),
    );
    expect(RETAIL_NAV_MODULES.map((module) => module.title)).not.toContain("Management");
  });

  it.each(["MANAGER", "SHOP_MANAGER"])("shows the %s all but Posting to the books", (role) => {
    expect(panel(role)).toEqual([
      "Shop",
      "Sites",
      "Tills and devices",
      "Payments",
      "Till rules",
      "Receipts",
      "Fiscal device",
      "Staff and PINs",
      "Approvals",
      "Bin",
    ]);
  });

  it("shows the bookkeeper the shop, the fiscal device, posting and approvals", () => {
    expect(panel("FINANCE_OFFICER")).toEqual([
      "Shop",
      "Sites",
      "Payments",
      "Fiscal device",
      "Posting to the books",
      "Approvals",
    ]);
  });

  it("gives the cashier no Setup", () => {
    expect(panel("CASHIER")).toEqual([]);
  });

  it("gives the stock clerk Sites alone, to read", () => {
    expect(panel("STOCK_CLERK")).toEqual(["Sites"]);
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

describe("the Reports module (70-insights-reports 5.9, C-35)", () => {
  const panel = (role: string) =>
    reportsNav.items.filter((item) => roleMeetsRetailRequires(role, item.requires)).map((item) => item.label);

  it.each(["SUPERADMIN", "MANAGER", "FINANCE_OFFICER"])("gives the %s Every template and the six areas", (role) => {
    expect(panel(role)).toEqual(["Every template", "Selling", "Stock", "Buying", "Customers", "Money", "The floor"]);
  });

  it.each(["CASHIER", "STOCK_CLERK"])("gives the %s no Reports at all", (role) => {
    expect(panel(role)).toEqual([]);
    expect(canRoleOpenRetailPath(role, "/retail/reports", q())).toBe(false);
    expect(canRoleOpenRetailPath(role, "/retail/reports", q("area=stock"))).toBe(false);
  });

  it("files a run page under Reports, and an area's address under its area", () => {
    expect(retailNavItemForPath("/retail/reports/stock-on-hand", q())?.label).toBe("Every template");
    expect(retailNavItemForPath("/retail/reports", q("area=stock"))?.label).toBe("Stock");
    expect(retailNavItemForPath("/retail/reports", q())?.label).toBe("Every template");
    expect(canRoleOpenRetailPath("FINANCE_OFFICER", "/retail/reports/stock-on-hand", q())).toBe(true);
  });

  it("hides an area until its badge counts a template for this person", () => {
    const hidden = hiddenRetailNavHrefs({ "multi-site": true }, { "/retail/reports": "7", "/retail/reports?area=stock": "3" });
    expect(hidden.has("/retail/reports")).toBe(false);
    expect(hidden.has("/retail/reports?area=stock")).toBe(false);
    expect(hidden.has("/retail/reports?area=buying")).toBe(true);
    expect(hiddenRetailNavHrefs({ "multi-site": true }).has("/retail/reports?area=selling")).toBe(true);
  });
});

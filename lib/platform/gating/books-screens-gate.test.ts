import { describe, expect, it } from "vitest";

import { canAccessRouteWithToken, hasEnabledFeature } from "@/lib/platform/gating/enforcer";
import { booksScreensKeyForPath } from "@/lib/platform/gating/route-registry";

const ENGINE_ONLY = ["accounting.core", "accounting.ar", "accounting.ap", "accounting.banking", "accounting.tax", "accounting.zimra.fiscalisation", "retail.core", "retail.shifts", "hr.employees", "hr.payroll", "crm.core"];
const WITH_SCREENS = [...ENGINE_ONLY, "books.screens"];

describe("the Books screens' gate (books-final §1.2, D1)", () => {
  it("covers every Books page and every API only Books' pages call", () => {
    for (const path of ["/books", "/books/invoices", "/books/invoices/abc", "/books/settings/tax", "/api/books/invoices", "/api/books/money", "/api/books/bank/upload"]) {
      expect(booksScreensKeyForPath(path), path).toBe("books.screens");
    }
  });

  it("leaves Takings, the core's undo, the accountant export, Management's reads and the panel's counts open", () => {
    for (const path of ["/books/takings", "/books/takings/day", "/api/books/core/invoice/abc", "/api/books/core/grants", "/api/books/accountant-export", "/api/books/accountant-export/history", "/api/books/money-and-tax", "/api/books/money-accounts/abc", "/api/books/nav"]) {
      expect(booksScreensKeyForPath(path), path).toBeNull();
    }
  });

  it("never touches a module's own money routes or the accounting APIs Management calls", () => {
    for (const path of ["/api/v2/crm/requisitions", "/api/payroll/runs/abc/approve", "/api/accounting/banking/accounts", "/retail/manage/fiscal", "/management/accountant-export", "/bookshelf"]) {
      expect(booksScreensKeyForPath(path), path).toBeNull();
    }
  });

  it("refuses a Books page on the screens' key without them, and passes it with them", () => {
    expect(canAccessRouteWithToken("/books/invoices", ENGINE_ONLY)).toMatchObject({ allowed: false, featureKey: "books.screens" });
    expect(canAccessRouteWithToken("/api/books/invoices", ENGINE_ONLY)).toMatchObject({ allowed: false, featureKey: "books.screens" });
    expect(canAccessRouteWithToken("/books/invoices", WITH_SCREENS)).toMatchObject({ allowed: true });
    expect(canAccessRouteWithToken("/books/takings", ENGINE_ONLY)).toMatchObject({ allowed: true });
    expect(canAccessRouteWithToken("/api/books/accountant-export", ENGINE_ONLY)).toMatchObject({ allowed: true });
    expect(canAccessRouteWithToken("/api/payroll/runs/abc/approve", ENGINE_ONLY).featureKey).not.toBe("books.screens");
  });

  it("keeps the finer keys answering without the screens, for Management and the till", () => {
    expect(hasEnabledFeature(ENGINE_ONLY, "accounting.banking")).toBe(true);
    expect(hasEnabledFeature(ENGINE_ONLY, "accounting.zimra.fiscalisation")).toBe(true);
  });
});

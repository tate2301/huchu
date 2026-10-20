import { describe, expect, it } from "vitest";

import { booksPlanOf, booksTierForPath, booksTierForView, booksTierRows, BOOKS_TIER_KEY } from "@/lib/books/tiers";
import { canAccessRouteWithToken } from "@/lib/platform/gating/enforcer";
import { booksTierKeyForPath } from "@/lib/platform/gating/route-registry";

/** A workspace that never bought Books: the engine and the modules it runs. */
const ENGINE_ONLY = ["accounting.core", "retail.core", "retail.shifts", "hr.employees", "hr.payroll", "crm.core"];
const WITH_SCREENS = [...ENGINE_ONLY, "books.screens"];
const WITH_ADVANCED = [...WITH_SCREENS, BOOKS_TIER_KEY.advanced];

/** A page or API under each row of the map, the row itself and one below it. */
const addresses = (prefix: string) => [prefix, `${prefix}/abc`];

describe("the Books tiers (design/books/NOTES.md §1)", () => {
  it("opens every free address with the engine only: nothing a business trades with waits on a plan", () => {
    for (const row of booksTierRows().filter((row) => row.tier === "free")) {
      for (const path of addresses(row.prefix)) {
        // A row below a free prefix can be a paid one of its own (bank entries under the bank); read its own tier.
        if (booksTierForPath(path) !== "free") continue;
        const decision = canAccessRouteWithToken(path, ENGINE_ONLY);
        expect(decision.allowed, path).toBe(true);
      }
    }
  });

  it("refuses every $10 address without the screens and opens it with them", () => {
    for (const row of booksTierRows().filter((row) => row.tier === "screens")) {
      expect(canAccessRouteWithToken(row.prefix, ENGINE_ONLY), row.prefix).toMatchObject({ allowed: false, featureKey: "books.screens" });
      expect(canAccessRouteWithToken(row.prefix, WITH_SCREENS).allowed, row.prefix).toBe(true);
    }
  });

  it("refuses every $99 address below the advanced plan", () => {
    for (const row of booksTierRows().filter((row) => row.tier === "advanced")) {
      expect(canAccessRouteWithToken(row.prefix, ENGINE_ONLY).allowed, row.prefix).toBe(false);
      expect(booksTierKeyForPath(row.prefix), row.prefix).toBe(BOOKS_TIER_KEY.advanced);
      expect(canAccessRouteWithToken(row.prefix, WITH_ADVANCED).allowed, row.prefix).toBe(true);
    }
  });

  it("puts the line where the owner drew it", () => {
    const free = ["/books/invoices", "/books/invoices/abc", "/books/quotes", "/books/payments", "/books/credit-notes", "/books/customers/abc", "/books/statements", "/books/bills/new", "/books/payments-made/new", "/books/orders", "/books/requisitions/abc", "/books/claims/new", "/books/suppliers", "/books/accounts/abc", "/books/takings", "/api/books/bank/entries", "/api/books/core/invoice/abc", "/api/books/accountant-export"];
    const screens = ["/books", "/books/expenses", "/books/bank", "/books/reconciliations/abc", "/books/rates", "/books/settings/numbering", "/api/books/money", "/api/books/bank/statements"];
    const advanced = ["/books/tax", "/books/vat", "/books/withholding", "/books/provisional-tax", "/books/fiscal", "/books/periods", "/books/needs-posting", "/books/year-end", "/books/journals", "/books/trial-balance", "/books/ledger", "/books/audit"];
    for (const path of free) expect(booksTierForPath(path), path).toBe("free");
    for (const path of screens) expect(booksTierForPath(path), path).toBe("screens");
    for (const path of advanced) expect(booksTierForPath(path), path).toBe("advanced");
    expect(booksTierForPath("/bookshelf")).toBeNull();
    expect(booksTierForPath("/api/v2/crm/requisitions")).toBeNull();
  });

  it("holds the views by age back for the screens on otherwise free pages", () => {
    expect(booksTierForView("/books/customers", "by-age")).toBe("screens");
    expect(booksTierForView("/api/books/suppliers", "by-age")).toBe("screens");
    expect(booksTierForView("/books/customers", null)).toBeNull();
    expect(booksTierForView("/books/invoices", "by-age")).toBeNull();
  });

  it("reads a workspace's plan from its features", () => {
    expect(booksPlanOf(ENGINE_ONLY)).toBe("free");
    expect(booksPlanOf(WITH_SCREENS)).toBe(BOOKS_TIER_KEY.advanced === "books.screens" ? "advanced" : "screens");
    expect(booksPlanOf(WITH_ADVANCED)).toBe("advanced");
  });
});

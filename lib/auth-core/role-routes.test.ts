import { describe, expect, it } from "vitest";

import { isRouteAllowedForRole, landingPathForRole } from "@/lib/auth-core/role-routes";

describe("role route allowlist", () => {
  it("pins SALES_REP to the CRM and shared prefixes", () => {
    expect(isRouteAllowedForRole("SALES_REP", "/crm")).toBe(true);
    expect(isRouteAllowedForRole("SALES_REP", "/crm/leads/123")).toBe(true);
    expect(isRouteAllowedForRole("SALES_REP", "/api/v2/crm/leads")).toBe(true);
    expect(isRouteAllowedForRole("SALES_REP", "/help")).toBe(true);
    expect(isRouteAllowedForRole("SALES_REP", "/api/notifications")).toBe(true);
    // Their own exports' progress and files.
    expect(isRouteAllowedForRole("SALES_REP", "/api/documents/render-jobs/abc")).toBe(true);
    expect(isRouteAllowedForRole("SALES_REP", "/api/documents/artifacts/abc")).toBe(true);
  });

  it("blocks SALES_REP from other modules", () => {
    expect(isRouteAllowedForRole("SALES_REP", "/accounting")).toBe(false);
    expect(isRouteAllowedForRole("SALES_REP", "/people")).toBe(false);
    expect(isRouteAllowedForRole("SALES_REP", "/api/v2/autos/leads")).toBe(false);
    expect(isRouteAllowedForRole("SALES_REP", "/api/accounting/sales/invoices")).toBe(false);
    // Rendering in general stays out of reach; CRM lists export from the CRM.
    expect(isRouteAllowedForRole("SALES_REP", "/api/documents/render")).toBe(false);
    expect(isRouteAllowedForRole("SALES_REP", "/")).toBe(false);
  });

  it("does not restrict unlisted roles", () => {
    expect(isRouteAllowedForRole("MANAGER", "/accounting")).toBe(true);
    expect(isRouteAllowedForRole("SUPERADMIN", "/people")).toBe(true);
  });

  it("does not treat /crm-foo as within /crm", () => {
    expect(isRouteAllowedForRole("SALES_REP", "/crmx")).toBe(false);
  });

  it("landing path is /crm for SALES_REP and null for others", () => {
    expect(landingPathForRole("SALES_REP")).toBe("/crm");
    expect(landingPathForRole("MANAGER")).toBeNull();
  });

  it("keeps the cashier out of the stores module and its unguarded handlers", () => {
    for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
      expect(isRouteAllowedForRole("CASHIER", "/api/inventory/items", method)).toBe(false);
      expect(isRouteAllowedForRole("CASHIER", "/api/inventory/items/abc", method)).toBe(false);
      expect(isRouteAllowedForRole("CASHIER", "/api/inventory/movements", method)).toBe(false);
      expect(isRouteAllowedForRole("CASHIER", "/api/stock-locations", method)).toBe(false);
      expect(isRouteAllowedForRole("CASHIER", "/api/v2/inventory/products", method)).toBe(false);
      expect(isRouteAllowedForRole("POS_CASHIER", "/api/inventory/items", method)).toBe(false);
    }
    expect(isRouteAllowedForRole("CASHIER", "/stores/inventory")).toBe(false);
    // Retail's own routes are the matrix's to decide.
    expect(isRouteAllowedForRole("CASHIER", "/retail/shifts")).toBe(true);
    expect(isRouteAllowedForRole("CASHIER", "/api/v2/retail/catalog", "GET")).toBe(true);
    expect(isRouteAllowedForRole("CASHIER", "/api/inventory-reports")).toBe(true);
  });

  it("lets the stock clerk read the stock module's items, locations and movements, never write them", () => {
    expect(isRouteAllowedForRole("STOCK_CLERK", "/api/inventory/items", "GET")).toBe(true);
    expect(isRouteAllowedForRole("STOCK_CLERK", "/api/inventory/movements", "GET")).toBe(true);
    expect(isRouteAllowedForRole("STOCK_CLERK", "/api/stock-locations", "GET")).toBe(true);
    expect(isRouteAllowedForRole("STOCK_CLERK", "/api/inventory/items", "POST")).toBe(false);
    expect(isRouteAllowedForRole("STOCK_CLERK", "/api/inventory/items/abc", "PATCH")).toBe(false);
    expect(isRouteAllowedForRole("STOCK_CLERK", "/api/inventory/items/abc", "DELETE")).toBe(false);
    expect(isRouteAllowedForRole("STOCK_CLERK", "/api/inventory/movements", "POST")).toBe(false);
    expect(isRouteAllowedForRole("STOCK_CLERK", "/api/stock-locations", "POST")).toBe(false);
    expect(isRouteAllowedForRole("STOCK_CLERK", "/api/v2/inventory/products", "GET")).toBe(false);
    expect(isRouteAllowedForRole("STOCK_CLERK", "/stores/movements")).toBe(false);
    // Retail's stock writes go through the matrix and the ledger.
    expect(isRouteAllowedForRole("STOCK_CLERK", "/api/v2/retail/stock/counts", "POST")).toBe(true);
  });

  it("lets the bookkeeper read stock and the fiscal device, never change them", () => {
    expect(isRouteAllowedForRole("FINANCE_OFFICER", "/api/inventory/items", "GET")).toBe(true);
    expect(isRouteAllowedForRole("FINANCE_OFFICER", "/api/inventory/items/abc", "PATCH")).toBe(false);
    expect(isRouteAllowedForRole("FINANCE_OFFICER", "/api/inventory/movements", "POST")).toBe(false);
    expect(isRouteAllowedForRole("FINANCE_OFFICER", "/stores/inventory")).toBe(false);
    expect(isRouteAllowedForRole("FINANCE_OFFICER", "/retail/shifts")).toBe(true);
    expect(isRouteAllowedForRole("FINANCE_OFFICER", "/api/accounting/fiscalisation/config", "GET")).toBe(true);
    // The config, register, fiscal-day and replay handlers refuse with the
    // matrix's sentence themselves; the two that never ask it stay read only.
    expect(isRouteAllowedForRole("FINANCE_OFFICER", "/api/accounting/fiscalisation/config", "POST")).toBe(true);
    expect(isRouteAllowedForRole("FINANCE_OFFICER", "/api/accounting/fiscalisation/device/register", "POST")).toBe(true);
    expect(isRouteAllowedForRole("FINANCE_OFFICER", "/api/accounting/fiscalisation/issue", "POST")).toBe(false);
    expect(isRouteAllowedForRole("FINANCE_OFFICER", "/api/accounting/fiscalisation/receipts/abc/sync", "POST")).toBe(false);
  });

  it("leaves the stores module to the roles that run it", () => {
    expect(isRouteAllowedForRole("MANAGER", "/api/inventory/items", "POST")).toBe(true);
    expect(isRouteAllowedForRole("CLERK", "/api/inventory/movements", "POST")).toBe(true);
    expect(isRouteAllowedForRole("SUPERADMIN", "/stores/inventory")).toBe(true);
  });
});

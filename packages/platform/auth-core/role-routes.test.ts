import { describe, expect, it } from "vitest";

import {
  isRoleRouteRestricted,
  isRouteAllowedForRole,
  landingPathForRole,
} from "./role-routes";

describe("role route allowlist", () => {
  it("pins SALES_REP to the CRM and shared prefixes", () => {
    expect(isRouteAllowedForRole("SALES_REP", "/crm")).toBe(true);
    expect(isRouteAllowedForRole("SALES_REP", "/crm/leads/123")).toBe(true);
    expect(isRouteAllowedForRole("SALES_REP", "/api/v2/crm/leads")).toBe(true);
    expect(isRouteAllowedForRole("SALES_REP", "/help")).toBe(true);
    expect(isRouteAllowedForRole("SALES_REP", "/api/notifications")).toBe(true);
  });

  it("blocks SALES_REP from other modules", () => {
    expect(isRouteAllowedForRole("SALES_REP", "/accounting")).toBe(false);
    expect(isRouteAllowedForRole("SALES_REP", "/people")).toBe(false);
    expect(isRouteAllowedForRole("SALES_REP", "/api/v2/autos/leads")).toBe(false);
    expect(isRouteAllowedForRole("SALES_REP", "/api/accounting/sales/invoices")).toBe(false);
    expect(isRouteAllowedForRole("SALES_REP", "/")).toBe(false);
  });

  it("does not restrict unlisted roles", () => {
    expect(isRouteAllowedForRole("MANAGER", "/accounting")).toBe(true);
    expect(isRouteAllowedForRole("SUPERADMIN", "/people")).toBe(true);
    expect(isRoleRouteRestricted("MANAGER")).toBe(false);
    expect(isRoleRouteRestricted("SALES_REP")).toBe(true);
  });

  it("does not treat /crm-foo as within /crm", () => {
    expect(isRouteAllowedForRole("SALES_REP", "/crmx")).toBe(false);
  });

  it("landing path is /crm for SALES_REP and null for others", () => {
    expect(landingPathForRole("SALES_REP")).toBe("/crm");
    expect(landingPathForRole("MANAGER")).toBeNull();
  });
});

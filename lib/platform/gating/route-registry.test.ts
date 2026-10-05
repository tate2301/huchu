import { describe, expect, it } from "vitest";

import { resolveFeatureKeyForPath } from "./route-registry";

/** The retail modules' prefixes (00-foundations 5.3.4). */
describe("retail page prefixes", () => {
  it.each([
    ["/retail", "retail.core"],
    ["/retail/products", "retail.catalog"],
    ["/retail/products/abc", "retail.catalog"],
    ["/retail/products/categories", "retail.catalog"],
    ["/retail/products/price-lists", "retail.promotions"],
    ["/retail/products/promotions", "retail.promotions"],
    ["/retail/products/bundles", "retail.promotions"],
    ["/retail/products/vouchers", "retail.promotions"],
    ["/retail/stock", "retail.core"],
    ["/retail/stock/counts", "retail.core"],
    ["/retail/stock/movements", "stores.movements"],
    ["/retail/buying/orders", "retail.purchasing"],
    ["/retail/buying/requisitions/1", "retail.purchasing"],
    ["/retail/sales", "retail.pos"],
    ["/retail/laybys", "retail.pos"],
    ["/retail/shifts", "retail.shifts"],
    ["/retail/end-of-day", "retail.shifts"],
    ["/retail/customers", "crm.customers"],
    ["/retail/accounts", "crm.customers"],
    ["/retail/insights/sales", "retail.reports"],
    ["/retail/manage/fiscal", "accounting.zimra.fiscalisation"],
    ["/retail/manage/tills", "retail.core"],
    ["/retail/setup", "retail.core"],
  ])("%s is gated on %s", (path, key) => {
    expect(resolveFeatureKeyForPath(path)).toBe(key);
  });

  it("no longer names the old retail paths", () => {
    // They fall through to the bare `/retail` row and answer 404 as pages.
    for (const path of ["/retail/catalog", "/retail/purchasing/orders", "/retail/merchandising/pricing"]) {
      expect(resolveFeatureKeyForPath(path)).toBe("retail.core");
    }
  });
});

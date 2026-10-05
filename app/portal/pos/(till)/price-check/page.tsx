import { PosPriceCheckView } from "@/components/retail/portal/pos-price-check-view";
import { PosPortalAuthGuard } from "@/components/retail/portal/pos-auth-guard";
import { priceCheckSiteForPage } from "../../device-page";

/**
 * This page was a `redirect("/portal/pos")`.
 *
 * `PosPriceCheckView` has existed and been complete the whole time; the route
 * that should have rendered it threw the cashier back to checkout instead. The
 * 2026-08-17 stock-take recorded price check as "built, not in the nav rail",
 * which was too kind — adding the rail entry alone would have shipped a button
 * that bounced.
 *
 * It works before pairing (10-setup W-04 step 5): the site is the till's, or
 * the shop's default site on a device that is not a till yet.
 */
export default async function PosPortalPriceCheckPage() {
  const siteId = await priceCheckSiteForPage();
  return (
    <PosPortalAuthGuard pathname="/portal/pos/price-check">
      <PosPriceCheckView siteId={siteId} />
    </PosPortalAuthGuard>
  );
}

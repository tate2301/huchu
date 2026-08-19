import { PosPriceCheckView } from "@/components/retail/portal/pos-price-check-view";
import { PosPortalAuthGuard } from "@/components/retail/portal/pos-auth-guard";

/**
 * This page was a `redirect("/portal/pos")`.
 *
 * `PosPriceCheckView` has existed and been complete the whole time; the route
 * that should have rendered it threw the cashier back to checkout instead. The
 * 2026-08-17 stock-take recorded price check as "built, not in the nav rail",
 * which was too kind — adding the rail entry alone would have shipped a button
 * that bounced.
 */
export default async function PosPortalPriceCheckPage() {
  return (
    <PosPortalAuthGuard pathname="/portal/pos/price-check">
      <PosPriceCheckView />
    </PosPortalAuthGuard>
  );
}

/**
 * Scrap metal's names for the shared mobile list card.
 *
 * R-4.5 needed this shape for retail, and it was never scrap-specific — the
 * prefix on the names was the only module-specific thing about it. The
 * implementation moved to `components/ui/mobile-list-card.tsx` and this stays
 * so the ten scrap screens that import `ScrapMobileCard` keep working.
 *
 * A re-export rather than a rename across those ten files: renaming is churn in
 * a module nobody is working on, and the thing worth avoiding was two
 * implementations, not two names.
 */

export {
  MobileListCard as ScrapMobileCard,
  MobileListCardActions as ScrapMobileCardActions,
  MobileListCardHeader as ScrapMobileCardHeader,
  MobileListMetricStrip as ScrapMobileMetricStrip,
} from "@/components/ui/mobile-list-card";

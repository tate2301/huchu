"use client";

/**
 * Kept so the nineteen pages that register actions this way keep working. The
 * context now carries the page's identity as well, and lives in `page-chrome`.
 */
export {
  PageChromeProvider as PageActionsProvider,
  PageActions,
  usePageChrome as usePageActions,
} from "@/components/layout/page-chrome";

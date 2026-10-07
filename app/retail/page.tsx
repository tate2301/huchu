import { Suspense } from "react";

import { OverviewPage } from "@/components/retail/floor/overview-page";

/** Overview (50-floor W-51, FLR-08; board Floor): the retail home, a page in the shell. */
export default function RetailOverviewRoute() {
  return (
    <Suspense>
      <OverviewPage />
    </Suspense>
  );
}

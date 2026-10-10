import { Suspense } from "react";

import { EndOfDayPage } from "@/components/retail/floor/end-of-day-page";

/** End of day (50-floor W-43, FLR-07; board EndOfDay): a page in the shell, panel item "End of day". */
export default function EndOfDayRoute() {
  return (
    <Suspense>
      <EndOfDayPage />
    </Suspense>
  );
}

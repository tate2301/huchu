import { Suspense } from "react";

import { EndOfDayPage } from "@/components/retail/floor/end-of-day-page";

/**
 * Books → Takings (spec/routes.md §0): the tills' takings, counted and banked
 * at the end of the day — the floor's End of day, at a Books address so it
 * keeps Books' panel.
 */
export default function BooksTakingsRoute() {
  return (
    <Suspense>
      <EndOfDayPage basePath="/books/takings" />
    </Suspense>
  );
}

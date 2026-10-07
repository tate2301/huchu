import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Past days (50-floor, DaysList board; FLR-07): every site's trading days,
 * closed or not, with what each took and banked, from the `retail-days`
 * source. A row opens its day on End of day, read-only once closed.
 */
export default function PastDaysPage() {
  return (
    <Suspense>
      <ListFrame source="retail-days" title="Past days" back={{ href: "/retail/end-of-day", label: "End of day" }} />
    </Suspense>
  );
}

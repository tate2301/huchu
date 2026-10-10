import { Suspense } from "react";

import { ShiftClosePage } from "@/components/retail/floor/shift-close-page";

/** Count and close (50-floor W-39, FLR-04; board ShiftClose): a page in the shell, under Shifts. */
export default function CountAndClosePage() {
  return (
    <Suspense>
      <ShiftClosePage />
    </Suspense>
  );
}

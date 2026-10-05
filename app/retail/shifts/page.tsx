import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Shifts (00-foundations 5.5): the reference list. Every drawer the tills
 * have opened, drawn by ListFrame from the `retail-shifts` source — its
 * filters, totals and actions are the source's. "+ Open shift" opens the
 * `shift-open` sheet over it (`?sheet=shift-open`, from the shell's host).
 */
export default function ShiftsPage() {
  return (
    <Suspense>
      <ListFrame source="retail-shifts" title="Shifts" />
    </Suspense>
  );
}

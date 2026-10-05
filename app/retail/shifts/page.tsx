import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

import { OpenShiftSheet } from "./open-shift-sheet";

/**
 * Shifts (00-foundations 5.5): the reference list. Every drawer the tills
 * have opened, drawn by ListFrame from the `retail-shifts` source — its
 * filters, totals and actions are the source's — and "+ Open shift" over it
 * at `?sheet=shift-open`.
 */
export default function ShiftsPage() {
  return (
    <Suspense>
      <ListFrame source="retail-shifts" title="Shifts" />
      <OpenShiftSheet />
    </Suspense>
  );
}

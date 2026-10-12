import "@/components/list-frame/list-frame.css";

import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Buying › Requisitions (40-buying 5.8, W-31, W-32): money asked for, to
 * approve, to pay out and to account for, drawn by ListFrame from the
 * `retail-requisitions` source; "+ Ask for money" opens the `req-new` sheet.
 */
export default function RetailRequisitionsPage() {
  return (
    <Suspense>
      <ListFrame source="retail-requisitions" title="Requisitions" />
    </Suspense>
  );
}

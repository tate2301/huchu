"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import { RecordFrame } from "@/components/record-frame/record-frame";
import { requisitionKind } from "@/lib/retail/record-kinds";

/**
 * A requisition (40-buying 5.9, W-31, W-32, W-72) on RecordFrame: approve it,
 * a different amount, reject it, ask a question, cancel it (asked first, its
 * words built from the record), or change it and ask again once rejected.
 */
export default function RequisitionPage() {
  return (
    <Suspense>
      <Requisition />
    </Suspense>
  );
}

function Requisition() {
  const params = useParams<{ id: string }>();
  return <RecordFrame kind={requisitionKind} id={params?.id ?? ""} />;
}

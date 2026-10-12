"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import { RecordFrame } from "@/components/record-frame/record-frame";
import { deliveryKind } from "@/lib/retail/record-kinds";

/**
 * A delivery (40-buying 5.6, W-33) on RecordFrame: what came against the
 * note, its lines and Activity; a counted one is checked and posted here by
 * an owner or manager ("Post to stock").
 */
export default function DeliveryPage() {
  return (
    <Suspense>
      <Delivery />
    </Suspense>
  );
}

function Delivery() {
  const params = useParams<{ id: string }>();
  return <RecordFrame kind={deliveryKind} id={params?.id ?? ""} />;
}

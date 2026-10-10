"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import { RecordFrame } from "@/components/record-frame/record-frame";
import { supplierKind } from "@/lib/retail/record-kinds";

/**
 * A supplier (40-buying 5.2, W-29): its terms, figures and people on
 * RecordFrame, every detail changed in place from the rail.
 */
export default function SupplierPage() {
  return (
    <Suspense>
      <Supplier />
    </Suspense>
  );
}

function Supplier() {
  const params = useParams<{ id: string }>();
  return <RecordFrame kind={supplierKind} id={params?.id ?? ""} />;
}

"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import { RecordFrame } from "@/components/record-frame/record-frame";
import { productKind } from "@/lib/retail/record-kinds";

/**
 * A product (00-foundations 5.6.10, Product board): on RecordFrame, its
 * details edited in place in the rail, and its sheets over it — Edit a
 * product, Adjust stock and Break a case.
 */
export default function ProductPage() {
  return (
    <Suspense>
      <Product />
    </Suspense>
  );
}

function Product() {
  const params = useParams<{ id: string }>();
  return <RecordFrame kind={productKind} id={params?.id ?? ""} />;
}

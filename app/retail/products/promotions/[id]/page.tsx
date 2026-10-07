"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import { RecordFrame } from "@/components/record-frame/record-frame";
import { promotionKind } from "@/lib/retail/record-kinds";

/**
 * A promotion (PRD-09, `PromotionRecord.png`): on RecordFrame, what it sold
 * and gave away against the weeks before it, its products and sales, and its
 * rules edited in place; Edit rules opens `promotion-edit` over it.
 */
export default function PromotionPage() {
  return (
    <Suspense>
      <Promotion />
    </Suspense>
  );
}

function Promotion() {
  const params = useParams<{ id: string }>();
  return <RecordFrame kind={promotionKind} id={params?.id ?? ""} />;
}

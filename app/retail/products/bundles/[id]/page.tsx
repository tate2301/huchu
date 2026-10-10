"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import { RecordFrame } from "@/components/record-frame/record-frame";
import { bundleKind } from "@/lib/retail/record-kinds";

/**
 * A bundle or buy-more deal (PRD-08, `BundleRecord.png`): on RecordFrame,
 * its rail edited in place, Change the bundle opening `bundle-edit` over it.
 */
export default function BundlePage() {
  return (
    <Suspense>
      <Bundle />
    </Suspense>
  );
}

function Bundle() {
  const params = useParams<{ id: string }>();
  return <RecordFrame kind={bundleKind} id={params?.id ?? ""} />;
}

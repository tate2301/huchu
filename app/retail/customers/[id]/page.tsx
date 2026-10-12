"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import { RecordFrame } from "@/components/record-frame/record-frame";
import { customerKind } from "@/lib/retail/record-kinds";

/**
 * A customer (60-customers 5.3, CustomerRecord board, CUS-03): on
 * RecordFrame, their contact details changed in place in the rail, and
 * Edit everything, Add a note and Message on WhatsApp as sheets over it.
 */
export default function CustomerPage() {
  return (
    <Suspense>
      <Customer />
    </Suspense>
  );
}

function Customer() {
  const params = useParams<{ id: string }>();
  return <RecordFrame kind={customerKind} id={params?.id ?? ""} />;
}

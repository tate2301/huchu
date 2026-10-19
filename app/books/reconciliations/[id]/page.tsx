"use client";

import * as React from "react";
import { useParams } from "next/navigation";

import { ReconciliationsFallback, ReconciliationsScreen } from "@/components/books/bk-reconciliations-page";

function OneReconciliation() {
  const { id } = useParams<{ id: string }>();
  return <ReconciliationsScreen selectedId={id} />;
}

/** One reconciliation: the Reconciliations page with it selected and its figures in the rail (BkReconciliation). */
export default function BooksReconciliationPage() {
  return (
    <React.Suspense fallback={<ReconciliationsFallback />}>
      <OneReconciliation />
    </React.Suspense>
  );
}

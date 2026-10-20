"use client";

import * as React from "react";

import { ReconciliationsFallback, ReconciliationsScreen } from "@/components/books/bk-reconciliations-page";

/** Books → Bank & cash → Reconciliations (design/core-modules/boards/view/BkReconciliation.html). */
export default function BooksReconciliationsPage() {
  return (
    <React.Suspense fallback={<ReconciliationsFallback />}>
      <ReconciliationsScreen selectedId={null} />
    </React.Suspense>
  );
}

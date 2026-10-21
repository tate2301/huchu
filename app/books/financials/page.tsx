"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { BkFinancialsView, ExportAction } from "@/components/books/bk-ledger-views";
import { useListQuery } from "@/components/books/bk-list";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchJson } from "@/lib/api-client";
import type { FinancialsPage, FinancialsQuery } from "@/lib/books/ledger-pages";

/** Books → Ledger → Financial statements (design/core-modules/boards/view/BkFinancials.html). */
function Page() {
  const { search, onQuery, exportHref } = useListQuery<FinancialsQuery>({ tab: "pl", compare: "both", cc: "" });
  const query = useQuery({ queryKey: ["books", "financials", search], queryFn: () => fetchJson<FinancialsPage>(`/api/books/financials${search ? `?${search}` : ""}`), placeholderData: (previous) => previous });
  return (
    <>
      <PageChrome title="Financial statements">
        <ExportAction href={exportHref("/api/books/financials")} />
      </PageChrome>
      <BooksPage screen="bk-b">
        {query.data ? (
          <BkFinancialsView data={query.data} onQuery={onQuery} />
        ) : query.isError ? (
          <BooksError what="The statements" error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
    </>
  );
}

/** Books → Ledger → Financial statements (design/core-modules/boards/view/BkFinancials.html). */
export default function BooksLedgerPage() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <Page />
    </React.Suspense>
  );
}

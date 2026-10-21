"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { BkLedgerView, ExportAction } from "@/components/books/bk-ledger-views";
import { useListQuery } from "@/components/books/bk-list";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchJson } from "@/lib/api-client";
import { dayOf } from "@/lib/books/format";
import type { LedgerPage, LedgerQuery } from "@/lib/books/ledger-pages";

/** Books → Ledger → General ledger (design/core-modules/boards/view/BkLedger.html). */
function Page() {
  const { search, onQuery, exportHref } = useListQuery<LedgerQuery>({ cc: "" });
  const query = useQuery({ queryKey: ["books", "ledger", search], queryFn: () => fetchJson<LedgerPage>(`/api/books/ledger${search ? `?${search}` : ""}`), placeholderData: (previous) => previous });
  const today = dayOf(new Date());
  return (
    <>
      <PageChrome title={query.data?.account ? `${query.data.account.code} ${query.data.account.name}` : "General ledger"}>
        <ExportAction href={exportHref("/api/books/ledger")} />
      </PageChrome>
      <BooksPage screen="bk-b">
        {query.data ? (
          <BkLedgerView data={query.data} onQuery={onQuery} today={today} />
        ) : query.isError ? (
          <BooksError what="The general ledger" error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
    </>
  );
}

/** Books → Ledger → General ledger (design/core-modules/boards/view/BkLedger.html). */
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

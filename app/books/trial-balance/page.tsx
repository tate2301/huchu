"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { BkTrialBalanceView, ExportAction } from "@/components/books/bk-ledger-views";
import { useListQuery } from "@/components/books/bk-list";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchJson } from "@/lib/api-client";
import { dayOf } from "@/lib/books/format";
import type { TrialBalancePage, TrialBalanceQuery } from "@/lib/books/ledger-pages";

/** Books → Ledger → Trial balance (design/core-modules/boards/view/BkTrialBalance.html). */
function Page() {
  const { search, onQuery } = useListQuery<TrialBalanceQuery>({ view: "month", cc: "" });
  // Every account is listed, the ones with nothing too, as the design draws it.
  const asked = new URLSearchParams(search);
  if (!asked.has("zero")) asked.set("zero", "show");
  const read = asked.toString();
  const query = useQuery({ queryKey: ["books", "trial-balance", read], queryFn: () => fetchJson<TrialBalancePage>(`/api/books/trial-balance?${read}`), placeholderData: (previous) => previous });
  const today = dayOf(new Date());
  return (
    <>
      <PageChrome title="Trial balance">
        <ExportAction href={`/api/books/trial-balance?${new URLSearchParams([...asked.entries(), ["format", "csv"]]).toString()}`} />
      </PageChrome>
      <BooksPage screen="bk-b">
        {query.data ? (
          <BkTrialBalanceView data={query.data} onQuery={onQuery} today={today} />
        ) : query.isError ? (
          <BooksError what="The trial balance" error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
    </>
  );
}

/** Books → Ledger → Trial balance (design/core-modules/boards/view/BkTrialBalance.html). */
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

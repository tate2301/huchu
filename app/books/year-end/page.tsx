"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { BkYearEndView } from "@/components/books/bk-settings-views";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchJson } from "@/lib/api-client";
import type { YearEndPage } from "@/lib/books/settings-pages";

/** Books → Close the month → Year end (BkYearEnd): the steps to the year's end, read from the books; nothing changes here. */
function YearEnd() {
  const query = useQuery({ queryKey: ["books", "year-end"], queryFn: () => fetchJson<YearEndPage>("/api/books/year-end") });
  const data = query.data;
  return (
    <>
      <PageChrome title="Year end" />
      <BooksPage screen="bk-b">
        {data ? (
          <BkYearEndView data={data} exportHref={`/api/books/accountant-export?from=${data.exportFrom}&to=${data.exportTo}`} />
        ) : query.isError ? (
          <BooksError what="Year end" error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
    </>
  );
}

/** Books → Close the month → Year end (design/core-modules/boards/view/BkYearEnd.html). */
export default function YearEndPageRoute() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <YearEnd />
    </React.Suspense>
  );
}

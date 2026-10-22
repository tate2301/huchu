"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { BkAuditView } from "@/components/books/bk-audit-view";
import { useListQuery } from "@/components/books/bk-list";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchJson } from "@/lib/api-client";
import type { AuditPage, AuditQuery } from "@/lib/books/audit";

/** Books → Ledger → Audit trail (BkAudit): look only; nothing here changes the books. */
function Audit() {
  const { search, onQuery, exportHref } = useListQuery<AuditQuery>({ q: "", kind: "all", dates: "this-month", event: "" });
  const query = useQuery({ queryKey: ["books", "audit", search], queryFn: () => fetchJson<AuditPage>(`/api/books/audit${search ? `?${search}` : ""}`), placeholderData: (previous) => previous });
  return (
    <>
      <PageChrome title="Audit trail" />
      <BooksPage screen="bk-b">
        {query.data ? (
          <BkAuditView data={query.data} onQuery={onQuery} exportHref={exportHref("/api/books/audit")} />
        ) : query.isError ? (
          <BooksError what="The audit trail" error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
    </>
  );
}

/** Books → Ledger → Audit trail (design/core-modules/boards/view/BkAudit.html). */
export default function AuditPageRoute() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <Audit />
    </React.Suspense>
  );
}

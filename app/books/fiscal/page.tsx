"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { BkFiscalView } from "@/components/books/bk-fiscal-view";
import { useListQuery } from "@/components/books/bk-list";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { FiscalTab } from "@/lib/books/fiscal-labels";
import type { FiscalPage, FiscalRow } from "@/lib/books/fiscal-page";

type Query = { tab: FiscalTab; q: string; kind: string | null; status: string | null; page: number };

/**
 * Books → Tax → Fiscal register (BkFiscal). Retry the failed (R) sends every
 * failed document to the device again; a row's Retry sends one. Setting up the
 * device is Management's (Shop › Fiscal device).
 */
function BooksFiscal() {
  const router = useRouter();
  const client = useQueryClient();
  const { toast } = useToast();
  const { search, params, onQuery, exportHref } = useListQuery<Query>({ tab: "documents", q: "", page: 1 });
  const query = useQuery({ queryKey: ["books", "fiscal", search], queryFn: () => fetchJson<FiscalPage>(`/api/books/fiscal${search ? `?${search}` : ""}`), placeholderData: (previous) => previous });
  const retry = useMutation({
    mutationFn: (row: FiscalRow | null) => fetchJson<{ tried: number; signed: number; failed: number; error: string | null }>("/api/books/fiscal", { method: "POST", body: JSON.stringify({ receiptId: row?.id ?? null }) }),
    onSuccess: (result) => {
      toast(
        result.failed === 0
          ? { title: result.tried === 0 ? "Nothing was waiting" : `${result.signed} signed`, variant: "success" }
          : { title: `${result.failed} still not signed`, description: result.error ?? "The device did not answer. It is tried again later.", variant: "destructive" },
      );
      client.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (error) => toast({ title: "Not sent again", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });
  const data = query.data;
  return (
    <>
      <PageChrome title="Fiscal register" primary={{ label: "Retry the failed", icon: "arrow", shortcut: "R", onClick: () => retry.mutate(null), disabled: data && data.sums.failed === 0 ? "Nothing failed" : undefined }} />
      <BooksPage screen="bk-b">
        {data ? (
          <BkFiscalView
            data={data}
            q={params.get("q") ?? ""}
            kind={params.get("kind")}
            status={params.get("status")}
            onQuery={(next) => onQuery(next as Partial<Query>)}
            onRetry={(row) => retry.mutate(row)}
            retrying={retry.isPending ? (retry.variables?.id ?? "all") : null}
            more={(row) => [
              { key: "open", icon: "arrow", label: "Open the document", onSelect: () => router.push(row.kind === "Credit note" ? `/books/credit-notes?q=${encodeURIComponent(row.number)}` : `/books/invoices?q=${encodeURIComponent(row.number)}`) },
              { key: "device", icon: "fiscal", label: "Fiscal device, in Management", onSelect: () => router.push("/retail/manage/fiscal") },
            ]}
            exportHref={exportHref("/api/books/fiscal")}
          />
        ) : query.isError ? (
          <BooksError what="The fiscal register" onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
    </>
  );
}

/** Books → Tax → Fiscal register (design/core-modules/boards/view/BkFiscal.html). */
export default function BooksFiscalPage() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <BooksFiscal />
    </React.Suspense>
  );
}

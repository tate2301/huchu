"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { NeedsPostingPageView, type NeedsPostingData } from "@/components/books/needs-posting-view";
import { Empty } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { NeedsPostingQuery } from "@/lib/books/needs-posting";

type RetrySummary = { tried: number; posted: number; failed: number; held: number };

const AGAIN = "Check the connection and try again.";

/** "2 posted. 1 still can't post." */
function outcome(summary: RetrySummary): string {
  const parts = [`${summary.posted} posted.`];
  if (summary.failed) parts.push(`${summary.failed} still can’t post.`);
  if (summary.held) parts.push(`${summary.held} ${summary.held === 1 ? "is" : "are"} in a closed month.`);
  return parts.join(" ");
}

function NeedsPosting() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const client = useQueryClient();
  const { toast } = useToast();
  const selected = params.get("event");
  const listParams = new URLSearchParams(params.toString());
  listParams.delete("event");
  const search = listParams.toString();

  const view = useQuery({
    queryKey: ["books", "needs-posting", search],
    queryFn: () => fetchJson<NeedsPostingData>(`/api/books/needs-posting${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });

  const replace = React.useCallback(
    (merged: URLSearchParams) => {
      const query = merged.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router],
  );
  const onQuery = React.useCallback(
    (next: Partial<NeedsPostingQuery>) => {
      const merged = new URLSearchParams(params.toString());
      merged.delete("event");
      for (const [key, value] of Object.entries(next)) {
        if (value === "" || (key === "tab" && value === "failed")) merged.delete(key);
        else merged.set(key, String(value));
      }
      replace(merged);
    },
    [params, replace],
  );
  const select = (id: string) => {
    const merged = new URLSearchParams(params.toString());
    merged.set("event", id);
    replace(merged);
  };

  const refresh = () => client.invalidateQueries({ queryKey: ["books"] });
  const done = (summary: RetrySummary) => {
    toast({ title: summary.posted ? "Posted" : "Not posted yet", description: outcome(summary) });
    refresh();
  };
  const failed = (title: string) => (error: unknown) => toast({ title, description: getApiErrorMessage(error, AGAIN), variant: "destructive" });

  const retry = useMutation({
    mutationFn: (ids: string[] | null) => fetchJson<RetrySummary>("/api/books/needs-posting", { method: "POST", body: JSON.stringify(ids ? { ids } : {}) }),
    onSuccess: done,
    onError: failed("The retry did not run"),
  });
  const change = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      fetchJson<RetrySummary>(`/api/books/needs-posting/${id}`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: done,
    onError: failed("The posting was not changed"),
  });

  const data = view.data;
  const forbidden = view.error instanceof ApiError && view.error.status === 403;
  const nothing = !data || data.counts.failed + data.counts.waiting === 0;
  return (
    <>
      <PageChrome
        title="Needs posting"
        primary={
          data?.can.retry
            ? {
                label: "Retry all",
                icon: "arrow",
                shortcut: "R",
                disabled: nothing ? "Nothing is waiting to post" : undefined,
                onClick: () => retry.mutate(null),
              }
            : null
        }
      />
      <BooksPage screen="books-needs-posting">
        {data ? (
          <NeedsPostingPageView
            data={data}
            selectedId={selected}
            busy={retry.isPending || change.isPending}
            exportHref={`/api/books/needs-posting?${new URLSearchParams([...listParams.entries(), ["format", "csv"]]).toString()}`}
            onQuery={onQuery}
            onSelect={select}
            onRetry={(ids) => retry.mutate(ids)}
            onMap={(id, accountId) => change.mutate({ id, body: { action: "map", accountId } })}
            onRedate={(id) => change.mutate({ id, body: { action: "this-month" } })}
          />
        ) : forbidden ? (
          <Empty icon="lock" title="Needs posting is for the people who keep the books">
            The owner, a manager or the accountant sees what has not reached the ledger. Ask one of them.
          </Empty>
        ) : view.isError ? (
          <BooksError what="Needs posting" onRetry={() => view.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
    </>
  );
}

/** Close the month → Needs posting (design/core-modules/boards/view/BkNeedsPosting.html). */
export default function NeedsPostingPage() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="books-needs-posting">
          <BooksLoading />
        </BooksPage>
      }
    >
      <NeedsPosting />
    </React.Suspense>
  );
}

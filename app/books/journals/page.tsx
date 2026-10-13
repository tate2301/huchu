"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { JournalAside, JournalsPageView } from "@/components/books/journals-view";
import { NewJournalDrawer } from "@/components/books/new-journal-drawer";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { JournalDetail, JournalQuery, JournalsView } from "@/lib/books/journals";

const AGAIN = "Check the connection and try again.";

function Journals() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const client = useQueryClient();
  const { toast } = useToast();
  // `?action=new-journal` (the old overview's New journal) opens the drawer.
  const [creating, setCreating] = React.useState(() => params.get("action") === "new-journal");
  const selected = params.get("journal");
  const listParams = new URLSearchParams(params.toString());
  listParams.delete("journal");
  const search = listParams.toString();

  const journals = useQuery({
    queryKey: ["books", "journals", search],
    queryFn: () => fetchJson<JournalsView>(`/api/books/journals${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });
  const journal = useQuery({
    queryKey: ["books", "journal", selected],
    queryFn: () => fetchJson<JournalDetail>(`/api/books/journals/${selected}`),
    enabled: Boolean(selected),
  });

  const replace = React.useCallback(
    (merged: URLSearchParams) => {
      const query = merged.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router],
  );
  const onQuery = React.useCallback(
    (next: Partial<JournalQuery>) => {
      const merged = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === "" || (key === "tab" && value === "all") || (key === "page" && value === 1)) merged.delete(key);
        else merged.set(key, String(value));
      }
      replace(merged);
    },
    [params, replace],
  );
  const select = (id: string | null) => {
    const merged = new URLSearchParams(params.toString());
    if (id) merged.set("journal", id);
    else merged.delete("journal");
    replace(merged);
  };

  const refresh = () => client.invalidateQueries({ queryKey: ["books"] });
  const act = useMutation({
    mutationFn: ({ kind, reason }: { kind: "post" | "reverse"; reason?: string }) =>
      fetchJson(`/api/accounting/journals/${selected}/${kind}`, {
        method: "POST",
        body: JSON.stringify(kind === "post" ? { periodOverrideReason: reason } : { reason }),
      }),
    onSuccess: (_, { kind }) => {
      toast({ title: kind === "post" ? "Journal posted" : "Journal reversed" });
      refresh();
    },
    onError: (error, { kind }) =>
      toast({ title: kind === "post" ? "The journal did not post" : "The journal was not reversed", description: getApiErrorMessage(error, AGAIN), variant: "destructive" }),
  });

  return (
    <>
      <PageChrome title="Journals" primary={{ label: "New journal", icon: "plus", onClick: () => setCreating(true) }} />
      <BooksPage screen="books-journals">
        {journals.data ? (
          <JournalsPageView
            data={journals.data}
            selectedId={selected}
            onQuery={onQuery}
            onSelect={(id) => select(id)}
            exportHref={`/api/books/journals?${new URLSearchParams([...listParams.entries(), ["format", "csv"]]).toString()}`}
            aside={
              selected && journal.data ? (
                <JournalAside
                  journal={journal.data}
                  busy={act.isPending}
                  onClose={() => select(null)}
                  onPost={(reason) => act.mutate({ kind: "post", reason })}
                  onReverse={(reason) => act.mutate({ kind: "reverse", reason })}
                />
              ) : null
            }
          />
        ) : journals.isError ? (
          <BooksError what="Journals" onRetry={() => journals.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <NewJournalDrawer open={creating} onOpenChange={setCreating} onSaved={refresh} />
    </>
  );
}

/** Books → Journals (design/core-modules/boards/view/PageBooksJournals.html). */
export default function JournalsPage() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="books-journals">
          <BooksLoading />
        </BooksPage>
      }
    >
      <Journals />
    </React.Suspense>
  );
}

"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useListQuery } from "@/components/books/bk-list";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { JournalDrawer, JournalsPageView } from "@/components/books/journals-view";
import { NewJournalDrawer } from "@/components/books/new-journal-drawer";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { JournalDetail, JournalQuery, JournalRow, JournalsView } from "@/lib/books/journals";

const AGAIN = "Check the connection and try again.";
const WORD = { draft: "is saved as a draft", "to-approve": "waits for a second person", posted: "is posted" } as const;

/**
 * Books → Ledger → Journals (BkJournals, BkJournalNew). New journal (J) opens
 * the drawer; a row opens its lines, with Post, Approve and post, Send back,
 * Delete the draft or Reverse by its state. `?action=new-journal` (the old
 * overview's link) opens New journal; `?journal=<id>` opens one.
 */
function Journals() {
  const client = useQueryClient();
  const { toast } = useToast();
  const { search, params, onQuery, exportHref } = useListQuery<JournalQuery & { journal: string }>({ tab: "all", q: "", sort: "needs", source: "", period: "any", by: "" });
  const [creating, setCreating] = React.useState(() => params.get("action") === "new-journal");
  const selected = params.get("journal");
  const listParams = new URLSearchParams(search);
  listParams.delete("journal");
  listParams.delete("action");
  const list = listParams.toString();

  const journals = useQuery({ queryKey: ["books", "journals", list], queryFn: () => fetchJson<JournalsView>(`/api/books/journals${list ? `?${list}` : ""}`), placeholderData: (previous) => previous });
  const journal = useQuery({ queryKey: ["books", "journal", selected], queryFn: () => fetchJson<JournalDetail>(`/api/books/journals/${selected}`), enabled: Boolean(selected) });
  const refresh = () => client.invalidateQueries({ queryKey: ["books"] });

  const act = useMutation({
    mutationFn: async ({ action, input }: { action: "post" | "approve" | "withdraw" | "reverse" | "delete"; input: { reason?: string; periodOverrideReason?: string } }) => {
      if (action === "delete") return fetchJson<{ ref: string | null; state?: string }>(`/api/books/journals/${selected}`, { method: "DELETE" });
      return fetchJson<{ ref: string | null; state: string }>(`/api/books/journals/${selected}`, { method: "POST", body: JSON.stringify({ action, ...input }) });
    },
    onSuccess: (result, { action }) => {
      const title =
        action === "delete" ? "The draft is deleted" : action === "reverse" ? `Reversed by ${result.ref}` : action === "withdraw" ? "It is a draft again" : result.state === "to-approve" ? "Sent to a second person" : `${result.ref} is posted`;
      toast({ title, variant: "success" });
      if (action === "delete") onQuery({ journal: "" });
      refresh();
    },
    onError: (error) => toast({ title: "The journal was not changed", description: getApiErrorMessage(error, AGAIN), variant: "destructive" }),
  });

  const postMany = async (rows: JournalRow[]) => {
    let posted = 0;
    const refused: string[] = [];
    for (const row of rows) {
      try {
        await fetchJson(`/api/books/journals/${row.id}`, { method: "POST", body: JSON.stringify({ action: "post" }) });
        posted += 1;
      } catch (error) {
        refused.push(getApiErrorMessage(error, AGAIN));
      }
    }
    toast({ title: `${posted} of ${rows.length} posted`, description: refused[0], variant: refused.length ? "destructive" : "success" });
    refresh();
  };

  return (
    <>
      <PageChrome title="Journals" primary={{ label: "New journal", icon: "plus", shortcut: "J", onClick: () => setCreating(true), disabled: journals.data && !journals.data.can.create ? "Your role cannot make journals" : undefined }} />
      <BooksPage screen="bk-b">
        {journals.data ? (
          <JournalsPageView data={journals.data} onQuery={onQuery} onOpen={(id) => onQuery({ journal: id })} onPost={(rows) => void postMany(rows)} exportHref={exportHref("/api/books/journals")} />
        ) : journals.isError ? (
          <BooksError what="Journals" error={journals.error} onRetry={() => journals.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <JournalDrawer
        open={Boolean(selected)}
        onOpenChange={(open) => !open && onQuery({ journal: "" })}
        journal={journal.data ?? null}
        busy={act.isPending}
        can={journals.data?.can ?? null}
        onAct={(action, input) => act.mutate({ action, input })}
      />
      <NewJournalDrawer
        open={creating}
        onOpenChange={setCreating}
        onSaved={(outcome) => {
          toast({ title: `${outcome.ref ?? "The journal"} ${WORD[outcome.state]}`, variant: "success" });
          refresh();
        }}
      />
    </>
  );
}

/** Books → Ledger → Journals (design/core-modules/boards/view/BkJournals.html). */
export default function JournalsPage() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <Journals />
    </React.Suspense>
  );
}

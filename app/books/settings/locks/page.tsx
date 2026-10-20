"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ReasonDrawer } from "@/components/books/bk-reason-drawer";
import { BkLocksView } from "@/components/books/bk-settings-views";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { LockPolicy, LocksPage } from "@/lib/books/settings-pages";

const AGAIN = "Check the connection and try again.";

/**
 * Books → Settings → Locks & periods: the lock policy and the freeze date
 * (the owner's), and each month; Reopen is the owner's, with a reason. A month
 * is closed from the checklist. Moved from `/accounting/periods`' controls.
 */
function Locks() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [reopening, setReopening] = React.useState<{ id: string; month: string } | null>(null);
  const query = useQuery({ queryKey: ["books", "locks"], queryFn: () => fetchJson<LocksPage>("/api/books/settings/locks") });
  const refresh = () => client.invalidateQueries({ queryKey: ["books"] });
  const controls = useMutation({
    mutationFn: (body: { periodLockPolicy?: LockPolicy; freezeBeforeDate?: string | null }) => fetchJson("/api/accounting/closing/freeze", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Saved", variant: "success" });
      refresh();
    },
    onError: (error) => toast({ title: "Not saved", description: getApiErrorMessage(error, AGAIN), variant: "destructive" }),
  });
  const data = query.data;
  return (
    <>
      <PageChrome title="Locks & periods" />
      <BooksPage screen="bk-b">
        {data ? (
          <BkLocksView data={data} busy={controls.isPending} onPolicy={(periodLockPolicy) => controls.mutate({ periodLockPolicy })} onFreeze={(freezeBeforeDate) => controls.mutate({ freezeBeforeDate })} onReopen={(id, month) => setReopening({ id, month })} />
        ) : query.isError ? (
          <BooksError what="Locks & periods" error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <ReasonDrawer
        open={Boolean(reopening)}
        onOpenChange={(open) => !open && setReopening(null)}
        title={`Reopen ${reopening?.month ?? ""}`}
        what="Posting into it is allowed again until it is closed from the checklist. The reason is kept with the month and in the audit trail."
        label="Why it reopens"
        icon="history"
        danger={false}
        onConfirm={async (reason) => {
          await fetchJson("/api/accounting/closing/period-reopen", { method: "POST", body: JSON.stringify({ periodId: reopening!.id, reason }) });
          toast({ title: `${reopening!.month} is open again`, variant: "success" });
          refresh();
        }}
      />
    </>
  );
}

/** Books → Settings → Locks & periods. */
export default function LocksPageRoute() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <Locks />
    </React.Suspense>
  );
}

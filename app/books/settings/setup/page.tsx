"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { OpeningDrawer } from "@/components/books/bk-opening-drawer";
import { BkSetupView } from "@/components/books/bk-settings-views";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { SetupPage } from "@/lib/books/settings-pages";

/**
 * Books → Settings → Set up the books (BkSetup): each step and where it is
 * done, the Zimbabwe pack for a workspace with no chart (the old Accounting
 * overview's seed pack), and the opening balances.
 */
function Setup() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [csv, setCsv] = React.useState(false);
  const query = useQuery({ queryKey: ["books", "setup"], queryFn: () => fetchJson<SetupPage>("/api/books/settings/setup") });
  const refresh = () => client.invalidateQueries({ queryKey: ["books"] });
  const seed = useMutation({
    mutationFn: () => fetchJson("/api/accounting/setup/seed-pack", { method: "POST", body: JSON.stringify({ mode: "APPLY" }) }),
    onSuccess: () => {
      toast({ title: "The chart, tax codes and posting rules are set up", variant: "success" });
      refresh();
    },
    onError: (error) => toast({ title: "The books were not set up", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });
  const data = query.data;
  return (
    <>
      <PageChrome title="Set up the books" />
      <BooksPage screen="bk-b">
        {data ? (
          <BkSetupView
            data={data}
            seeding={seed.isPending}
            onSeed={() => seed.mutate()}
            onRevise={() => {
              setCsv(false);
              setOpen(true);
            }}
            onCsv={() => {
              setCsv(true);
              setOpen(true);
            }}
          />
        ) : query.isError ? (
          <BooksError what="Set up the books" error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <OpeningDrawer
        open={open}
        csv={csv}
        onOpenChange={setOpen}
        onSaved={() => {
          toast({ title: "The opening balances are posted", variant: "success" });
          refresh();
        }}
      />
    </>
  );
}

/** Books → Settings → Set up the books (design/core-modules/boards/view/BkSetup.html). */
export default function SetupPageRoute() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <Setup />
    </React.Suspense>
  );
}

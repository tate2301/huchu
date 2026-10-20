"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { OpeningDrawer } from "@/components/books/bk-opening-drawer";
import { OpeningSection } from "@/components/books/bk-settings-views";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksFinding, BooksPage } from "@/components/books/figures";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson } from "@/lib/api-client";
import { money } from "@/lib/books/format";
import type { OpeningBalances } from "@/lib/books/settings-pages";

/**
 * Books → Settings → Opening balances: what the books started with, as Set up
 * the books draws it, with Add or Revise (the owner or the accountant; a
 * revision reverses the old journal and keeps it in the audit trail) and a
 * trial balance brought in from a CSV.
 */
function Opening() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [csv, setCsv] = React.useState(false);
  const query = useQuery({ queryKey: ["books", "opening-balances"], queryFn: () => fetchJson<OpeningBalances & { can: { change: boolean } }>("/api/books/settings/opening-balances") });
  const data = query.data;
  const start = (fromCsv: boolean) => {
    setCsv(fromCsv);
    setOpen(true);
  };
  return (
    <>
      <PageChrome title="Opening balances" primary={data?.can.change ? { label: data.posted ? "Revise the opening balances" : "Add the opening balances", icon: "edit", shortcut: "E", onClick: () => start(false) } : null} />
      <BooksPage screen="bk-b">
        {data ? (
          <div className="bk-body">
            <div className="bk-col">
              <BooksFinding
                finding={
                  data.posted
                    ? { fact: `The books opened on ${data.dateLabel} with ${money(data.debit)} on each side.`, rest: `${data.lines.length} accounts, posted ${data.posted.on}.` }
                    : { fact: "The books started from nothing.", rest: "Add what each account held the day before they started." }
                }
              />
              <OpeningSection opening={data} canChange={data.can.change} headed={false} revise={false} onRevise={() => start(false)} onCsv={() => start(true)} />
            </div>
          </div>
        ) : query.isError ? (
          <BooksError what="Opening balances" error={query.error} onRetry={() => query.refetch()} />
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
          client.invalidateQueries({ queryKey: ["books"] });
        }}
      />
    </>
  );
}

/** Books → Settings → Opening balances. */
export default function OpeningBalancesPageRoute() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <Opening />
    </React.Suspense>
  );
}

"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { BkClaimsView, type ClaimMoves } from "@/components/books/bk-claims-view";
import { useBulkUndo } from "@/components/books/undo-dialogs";
import { useListQuery } from "@/components/books/bk-list";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { ButtonLink, Kit } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { bulkWords, eachOf } from "@/lib/books/bulk";
import type { ClaimQuery, ClaimsPage } from "@/lib/books/claims-list";
import { money } from "@/lib/books/format";

const NEW_CLAIM = { label: "New claim", icon: "plus" as const, href: "/books/claims/new", shortcut: "N" };

/**
 * Books → Bills & spending → Claims & petty cash (BkClaims, D13). A claim is
 * approved (not by the claimant; over the limit by the owner), then paid back
 * from a money account; a float is topped up by a transfer for what it spent;
 * a voucher over the holder's limit is approved. Each through its own route
 * in the core; what could not be done says why.
 */
function BooksClaims() {
  const { toast } = useToast();
  const client = useQueryClient();
  // Void and Delete permanently over the selected claims (P4): as this person's role allows; the result row by row.
  const undo = useBulkUndo("claim", () => client.invalidateQueries({ queryKey: ["books"] }));
  const { search, onQuery, exportHref } = useListQuery<ClaimQuery>({ view: "claims", period: "any", sort: "newest" });

  const list = useQuery({
    queryKey: ["books", "claims", search],
    queryFn: () => fetchJson<ClaimsPage>(`/api/books/claims${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });

  const run = async (work: () => Promise<unknown>, done: { title: string; description?: string }) => {
    try {
      await work();
      toast({ ...done, variant: "success" });
    } catch (error) {
      toast({ title: "Nothing was changed", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" });
    }
    await client.invalidateQueries({ queryKey: ["books"] });
  };

  const moves: ClaimMoves = {
    approveClaim: (row) =>
      void run(() => fetchJson(`/api/books/claims/${row.id}`, { method: "PATCH", body: JSON.stringify({ action: "approve" }) }), { title: `${row.number} is approved`, description: `It is posted. Pay ${row.person.name} back when you can.` }),
    payBack: (row, accountId) =>
      void run(() => fetchJson(`/api/books/claims/${row.id}`, { method: "PATCH", body: JSON.stringify({ action: "reimburse", bankAccountId: accountId }) }), { title: `${row.person.name} is paid back ${money(row.amount, row.currency)}`, description: `${row.number} is paid.` }),
    approveVoucher: (row) => void run(() => fetchJson(`/api/books/petty-cash/${row.id}`, { method: "PATCH", body: JSON.stringify({ action: "approve" }) }), { title: `${row.number} is approved`, description: "It is posted from the float." }),
    topUp: (row, accountId) =>
      void run(() => fetchJson("/api/books/petty-cash", { method: "POST", body: JSON.stringify({ action: "top-up", floatId: row.id, fromBankAccountId: accountId }) }), { title: `${row.name} is topped up`, description: `${money(row.spent, row.currency)} back to its imprest.` }),
    approveClaims: async (rows) => {
      const outcome = await eachOf(rows, (row) => row.number, (row) => fetchJson(`/api/books/claims/${row.id}`, { method: "PATCH", body: JSON.stringify({ action: "approve" }) }), (error) => getApiErrorMessage(error, "it did not go through"));
      const words = bulkWords(outcome, "approved", ["claim", "claims"]);
      toast({ title: words.title, description: words.description, variant: words.ok ? "success" : "destructive" });
      await client.invalidateQueries({ queryKey: ["books"] });
    },
  };

  return (
    <>
      <PageChrome title="Claims & petty cash" primary={NEW_CLAIM}>
        <Kit contents>
          <ButtonLink href="/books/claims/new?paid=float" icon="expenses">
            New voucher
          </ButtonLink>
        </Kit>
      </PageChrome>
      <BooksPage screen="bk-a">
        {list.data ? (
          <BkClaimsView
            data={list.data}
            onQuery={onQuery}
            exportHref={exportHref("/api/books/claims")}
            moves={moves}
            undoEntries={(rows) => undo.entries(rows.map((row) => ({ id: row.id, label: row.number, posted: ["APPROVED", "PAID", "VOIDED"].includes(row.status), party: row.person.name, amount: money(row.amount, row.currency) })))}
          />
        ) : list.isError ? (
          <BooksError what="Claims" onRetry={() => list.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      {undo.node}
    </>
  );
}

/** Books → Bills & spending → Claims & petty cash (design/core-modules/boards/view/BkClaims.html). */
export default function BooksClaimsPage() {
  return (
    <React.Suspense fallback={<BooksPage screen="bk-a"><BooksLoading /></BooksPage>}>
      <BooksClaims />
    </React.Suspense>
  );
}

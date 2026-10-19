"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useListQuery } from "@/components/books/bk-list";
import { ReasonDrawer } from "@/components/books/bk-reason-drawer";
import { BkRequisitionsView } from "@/components/books/bk-requisitions-view";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { RaiseRequisitionSheet } from "@/components/crm/money/raise-requisition-sheet";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { bulkWords, type BulkOutcome } from "@/lib/books/bulk";
import type { RequisitionQuery, RequisitionRow, RequisitionsPage } from "@/lib/books/requisitions-list";

/**
 * Books → Bills & spending → Requisitions (BkRequisitions): the CRM's and the
 * shop's as one list. Approve and Reject on a selection go through each one's
 * own module (`/api/books/requisitions/decide`), and say what was skipped and
 * why. Paying out and accounting for one stay where it was asked (the CRM's or
 * the shop's page), which the record links to. New requisition is the CRM's
 * own form.
 */
function BooksRequisitions() {
  const { toast } = useToast();
  const client = useQueryClient();
  const [raising, setRaising] = React.useState(false);
  const [rejecting, setRejecting] = React.useState<RequisitionRow[] | null>(null);
  const { search, params, onQuery, exportHref } = useListQuery<RequisitionQuery>({ view: "to-approve", period: "any", sort: "newest" });

  // Record spending → Requisition, on All spending, lands here with the form open.
  const asked = params.get("new");
  React.useEffect(() => {
    if (asked !== "1") return;
    setRaising(true);
    onQuery({ new: null } as Partial<RequisitionQuery> & { new: null });
  }, [asked, onQuery]);

  const list = useQuery({
    queryKey: ["books", "requisitions", search],
    queryFn: () => fetchJson<RequisitionsPage>(`/api/books/requisitions${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });

  const decide = async (rows: RequisitionRow[], approve: boolean, note?: string) => {
    const outcome = await fetchJson<BulkOutcome>("/api/books/requisitions/decide", { method: "POST", body: JSON.stringify({ ids: rows.map((row) => row.id), approve, note: note ?? null }) });
    const words = bulkWords(outcome, approve ? "approved" : "not approved", ["requisition", "requisitions"]);
    toast({ title: words.title, description: words.description, variant: words.ok ? "success" : "destructive" });
    await client.invalidateQueries({ queryKey: ["books"] });
    return outcome;
  };

  return (
    <>
      <PageChrome
        title="Requisitions"
        primary={list.data && !list.data.can.create ? { label: "New requisition", disabled: "Your role cannot ask for money here." } : { label: "New requisition", icon: "plus", shortcut: "N", onClick: () => setRaising(true) }}
      />
      <BooksPage screen="bk-a">
        {list.data ? (
          <BkRequisitionsView
            data={list.data}
            onQuery={onQuery}
            exportHref={exportHref("/api/books/requisitions")}
            onApprove={(rows) => void decide(rows, true).catch((error) => toast({ title: "Nothing was approved", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }))}
            onReject={setRejecting}
          />
        ) : list.isError ? (
          <BooksError what="Requisitions" onRetry={() => list.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <RaiseRequisitionSheet open={raising} onOpenChange={setRaising} />
      <ReasonDrawer
        open={rejecting !== null}
        onOpenChange={(open) => (open ? undefined : setRejecting(null))}
        title={rejecting?.length === 1 ? `Reject ${rejecting[0].number}` : `Reject ${rejecting?.length ?? 0} requisitions`}
        sub={rejecting?.length === 1 ? `${rejecting[0].askedBy.name}, ${rejecting[0].purpose}` : undefined}
        what="Each requester is told it was not approved, with your reason. Nothing is paid out."
        label="Reject"
        placeholder="Not needed this week"
        onConfirm={async (reason) => {
          await decide(rejecting ?? [], false, reason);
        }}
      />
    </>
  );
}

/** Books → Bills & spending → Requisitions (design/core-modules/boards/view/BkRequisitions.html). */
export default function BooksRequisitionsPage() {
  return (
    <React.Suspense fallback={<BooksPage screen="bk-a"><BooksLoading /></BooksPage>}>
      <BooksRequisitions />
    </React.Suspense>
  );
}

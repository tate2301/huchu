"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ReasonDrawer } from "@/components/books/bk-reason-drawer";
import { BkRequisitionView } from "@/components/books/bk-requisition-view";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { useUndoMenu } from "@/components/books/undo-dialogs";
import { Button, ButtonGroup, Empty, Kit } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PageChrome, type PageMenuItem } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { bulkWords, type BulkOutcome } from "@/lib/books/bulk";
import type { RequisitionRecordPage } from "@/lib/books/requisition-record";

/**
 * One requisition in Books (design/core-modules/boards/view/BkRequisition.html,
 * and BkRequisitionPhone at phone width). Waiting for a yes, Approve (A) is the
 * primary and Reject sits beside it, for whoever may decide (never your own;
 * over its limit only the owner); the phone has both at its foot. Paying out,
 * the slips and closing it are done where it was asked, which ⋯ opens; Print
 * is quiet.
 */
export default function BooksRequisitionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? "";
  const client = useQueryClient();
  const { toast } = useToast();
  const [rejecting, setRejecting] = React.useState(false);

  const query = useQuery({
    queryKey: ["books", "requisition", id],
    queryFn: () => fetchJson<RequisitionRecordPage>(`/api/books/requisitions/${id}`),
    enabled: Boolean(id),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  const record = query.data;

  const decide = useMutation({
    mutationFn: (input: { approve: boolean; note?: string }) =>
      fetchJson<BulkOutcome>("/api/books/requisitions/decide", { method: "POST", body: JSON.stringify({ ids: [id], approve: input.approve, note: input.note ?? null }) }).then((outcome) => ({ outcome, approve: input.approve })),
    onSuccess: async ({ outcome, approve }) => {
      const words = bulkWords(outcome, approve ? "approved" : "not approved", ["requisition", "requisitions"]);
      toast({ title: words.title, description: words.description ?? (approve ? `${record?.paysOut ?? "Whoever pays out"} can pay it out now.` : "The requester is told why."), variant: words.ok ? "success" : "destructive" });
      await client.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (error) => toast({ title: "Nothing was changed", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });

  const notFound = query.error instanceof ApiError && query.error.status === 404;
  const waiting = record?.status === "SUBMITTED";
  const can = record?.can;

  // Void (its payout reversed) and Delete permanently, as the core's undoChoices says (P4); a shop's requisition is Retail's.
  const [initial, setInitial] = React.useState<string | null>(null);
  React.useEffect(() => setInitial(new URLSearchParams(window.location.search).get("do")), []);
  const undo = useUndoMenu("requisition", record?.source === "CRM" ? record.id : null, {
    initial,
    onVoided: async (done) => {
      toast({ title: `${done.label}'s payout is reversed`, description: done.detail, variant: "success" });
      await client.invalidateQueries({ queryKey: ["books"] });
    },
    onDeleted: async (done) => {
      toast({ title: `${done.label} is deleted`, description: "Its snapshot is in the audit trail.", variant: "success" });
      await client.invalidateQueries({ queryKey: ["books"] });
      router.push("/books/requisitions");
    },
  });

  const menu: MenuEntry[] = record
    ? [
        { key: "open", icon: "link", label: record.source === "CRM" ? "Open it in the CRM" : "Open it in the shop", onSelect: () => window.location.assign(record.sourceHref) },
        ...(waiting && can?.decide ? [{ key: "reject", icon: "x" as const, label: "Reject", onSelect: () => setRejecting(true) }] : []),
        ...undo.entries,
      ]
    : [];

  const phoneMenu = React.useMemo<PageMenuItem[] | null>(() => {
    if (!record) return null;
    return [{ key: "open", label: record.source === "CRM" ? "Open it in the CRM" : "Open it in the shop", onSelect: () => window.location.assign(record.sourceHref) }, { key: "print", label: "Print", onSelect: () => window.print() }];
  }, [record]);

  const approve = () => (decide.isPending ? undefined : decide.mutate({ approve: true }));

  return (
    <>
      <PageChrome title={record?.number ?? "Requisition"} backHref="/books/requisitions" backLabel="Requisitions" phoneMenu={phoneMenu}>
        {record ? (
          <Kit contents>
            {waiting && can?.decide ? (
              <ButtonGroup aria-label="Approve, and more">
                <Button variant="primary" icon="check" shortcut="A" busy={decide.isPending} onClick={approve}>
                  Approve
                </Button>
                <MenuButton variant="primary" iconOnly icon="down" iconEnd={undefined} align="end" label="More actions" aria-label="More actions" items={menu} />
              </ButtonGroup>
            ) : (
              <MenuButton iconOnly icon="more" iconEnd={undefined} align="end" label="More actions" aria-label="More actions" items={menu} />
            )}
            <Button variant="quiet" icon="print" onClick={() => window.print()}>
              Print
            </Button>
          </Kit>
        ) : null}
      </PageChrome>
      <BooksPage screen="bk-a">
        {record ? (
          <>
            <BkRequisitionView record={record} />
            {waiting ? (
              // On a phone the decision sits at the foot (BkRequisitionPhone).
              <div className="bk-ph-acts">
                <Button variant="primary" icon="check" shortcut="A" disabled={!can?.decide || decide.isPending} title={can?.why ?? undefined} busy={decide.isPending} onClick={approve}>
                  Approve
                </Button>
                <Button icon="x" disabled={!can?.decide} onClick={() => setRejecting(true)}>
                  Reject
                </Button>
              </div>
            ) : null}
          </>
        ) : notFound ? (
          <Empty icon="hand" title="There is no such requisition here">
            It may have been deleted as a draft, or it belongs to another workspace. Requisitions lists every one.
          </Empty>
        ) : query.isError ? (
          <BooksError what="This requisition" onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      {undo.node}
      {record ? (
        <ReasonDrawer
          open={rejecting}
          onOpenChange={setRejecting}
          title={`Reject ${record.number}`}
          sub={`${record.askedBy.name}, ${record.purpose}`}
          what={`${record.askedBy.name} is told it was not approved, with your reason. Nothing is paid out.`}
          label="Reject"
          danger={false}
          placeholder="Not needed this week"
          onConfirm={async (reason) => {
            await decide.mutateAsync({ approve: false, note: reason });
          }}
        />
      ) : null}
    </>
  );
}

"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { InvoiceRecordView } from "@/components/books/invoice-record-view";
import { Button, Empty, Kit } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { InvoiceRecordPage } from "@/lib/books/invoice-record";

/**
 * One invoice in Books (the PageVaneDraft board). A draft is issued from
 * here (I); a draft Vane made can also be deleted. Nothing is sent or posted
 * until a person presses Issue. On Vane's draft nobody has taken on, Issue is
 * the person confirming it as theirs (`asMine`): the server refuses it
 * without that (409).
 */
export default function BooksInvoicePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleting, setDeleting] = React.useState(false);

  const invoice = useQuery({
    queryKey: ["books", "invoice", id],
    queryFn: () => fetchJson<InvoiceRecordPage>(`/api/books/invoices/${id}`),
    enabled: Boolean(id),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  const record = invoice.data;

  const issue = useMutation({
    mutationFn: () =>
      fetchJson<{ number: string; customer: string }>(`/api/books/invoices/${id}/issue`, {
        method: "POST",
        body: JSON.stringify({ asMine: record?.waiting === true }),
      }),
    onSuccess: async (issued) => {
      toast({
        title: `${issued.number} is issued to ${issued.customer}`,
        description: record?.waiting ? "It is yours now, and posted to the books. Send it from Invoices." : "Send it from Invoices.",
        variant: "success",
      });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["books", "invoice", id] }), queryClient.invalidateQueries({ queryKey: ["books", "invoices"] })]);
    },
    onError: (error) => toast({ title: "It was not issued", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });

  const notFound = invoice.error instanceof ApiError && invoice.error.status === 404;
  const draft = record?.status === "DRAFT";
  const primary = draft
    ? record.can.issue
      ? { label: "Issue", icon: "send" as const, shortcut: "I", onClick: () => (issue.isPending ? undefined : issue.mutate()), disabled: issue.isPending ? "Issuing it" : undefined }
      : { label: "Issue", disabled: "Your role cannot issue invoices. A manager or the accountant can." }
    : null;

  return (
    <>
      <PageChrome title={record?.number ?? "Invoice"} backHref="/books/invoices" backLabel="Invoices" primary={primary}>
        {draft && record.madeByVane ? (
          <Kit contents>
            <span title={record.can.delete ? undefined : "Your role cannot change invoices."} style={{ display: "inline-flex" }}>
              <Button icon="x" disabled={!record.can.delete || issue.isPending} onClick={() => setDeleting(true)}>
                Delete the draft
              </Button>
            </span>
          </Kit>
        ) : null}
      </PageChrome>
      <BooksPage screen="books-invoice">
        {record ? (
          <InvoiceRecordView invoice={record} />
        ) : notFound ? (
          <Empty icon="invoice" title="There is no such invoice here">
            It may have been deleted, or it belongs to another workspace. Invoices lists every one this workspace has.
          </Empty>
        ) : invoice.isError ? (
          <BooksError what="This invoice" onRetry={() => invoice.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      {record ? (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          ask={{
            title: `Delete ${record.number}?`,
            body: `Vane's draft to ${record.customer.name} goes. Nothing was sent or posted.`,
            keep: "Keep it",
            go: "Delete the draft",
            fill: "bad",
          }}
          onConfirm={async () => {
            try {
              await fetchJson(`/api/books/invoices/${id}`, { method: "DELETE" });
            } catch (error) {
              throw new Error(getApiErrorMessage(error));
            }
            toast({ title: `${record.number} is deleted`, variant: "success" });
            await queryClient.invalidateQueries({ queryKey: ["books", "invoices"] });
            router.push("/books/invoices?view=drafts");
          }}
        />
      ) : null}
    </>
  );
}

"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/core";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { InvoiceRecordView } from "@/components/books/invoice-record-view";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { InvoiceRecord } from "@/lib/books/invoice-record";

/**
 * One invoice in Books (the PageVaneDraft board). A draft is issued from
 * here; a draft Vane made can also be deleted. Nothing is sent or posted
 * until a person presses Issue.
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
    queryFn: () => fetchJson<InvoiceRecord>(`/api/books/invoices/${id}`),
    enabled: Boolean(id),
  });

  const issue = useMutation({
    mutationFn: () => fetchJson<{ number: string; customer: string }>(`/api/books/invoices/${id}/issue`, { method: "POST" }),
    onSuccess: async (issued) => {
      toast({ title: `${issued.number} is issued to ${issued.customer}`, description: "Send it from Invoices.", variant: "success" });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["books", "invoice", id] }), queryClient.invalidateQueries({ queryKey: ["books", "invoices"] })]);
    },
    onError: (error) => toast({ title: "It was not issued", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const record = invoice.data;
  const draft = record?.status === "DRAFT";
  return (
    <>
      <PageChrome
        title={record?.number ?? "Invoice"}
        backHref="/books/invoices"
        backLabel="Invoices"
        primary={draft ? { label: "Issue", icon: "send", onClick: () => issue.mutate(), shortcut: "I", disabled: issue.isPending ? "Issuing it" : undefined } : null}
      >
        {draft && record.madeByVane ? (
          <Button icon="x" disabled={issue.isPending} onClick={() => setDeleting(true)}>
            Delete the draft
          </Button>
        ) : null}
      </PageChrome>
      <BooksPage screen="books-invoice">
        {record ? (
          <InvoiceRecordView invoice={record} />
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

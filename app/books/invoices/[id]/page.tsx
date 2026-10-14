"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";

import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { InvoicePageView } from "@/components/books/invoice-view";
import { Button, Empty, Kit } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { InvoicePage } from "@/lib/books/invoice-page";

/**
 * One invoice in Books, and Vane's draft invoice (PageVaneDraft). Issue (I)
 * is the person's: on Vane's draft it confirms the draft as theirs as it is
 * issued (`asMine`), and the server refuses Vane's draft without it.
 */
export default function BooksInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invoice = useQuery({
    queryKey: ["books", "invoice", id],
    queryFn: () => fetchJson<InvoicePage>(`/api/books/invoices/${id}`),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  const data = invoice.data;

  const change = useMutation({
    mutationFn: (status: "ISSUED" | "VOIDED") =>
      fetchJson(`/api/accounting/sales/invoices/${id}`, {
        method: "PATCH",
        body: JSON.stringify(status === "ISSUED" ? { status, asMine: data?.vane?.waiting === true } : { status }),
      }),
    onSuccess: (_, status) => {
      void queryClient.invalidateQueries({ queryKey: ["books"] });
      if (status === "VOIDED") {
        toast({ title: `${data?.number ?? "The draft"} is cancelled` });
        router.push("/books/invoices?view=drafts");
        return;
      }
      toast({ title: `${data?.number ?? "The invoice"} is issued`, description: data?.vane?.waiting ? "It is yours now, and posted to the books." : "It is posted to the books." });
    },
    onError: (error, status) =>
      toast({
        title: status === "VOIDED" ? "The draft was not cancelled" : "The invoice was not issued",
        description: getApiErrorMessage(error, "Check the connection and try again."),
        variant: "destructive",
      }),
  });

  const notFound = invoice.error instanceof ApiError && invoice.error.status === 404;
  const draft = data?.status === "draft";
  const issue = draft
    ? data.can.issue
      ? { label: "Issue", icon: "send" as const, shortcut: "I", onClick: () => (change.isPending ? undefined : change.mutate("ISSUED")) }
      : { label: "Issue", disabled: "Your role cannot issue invoices. A manager or the accountant can." }
    : null;

  return (
    <>
      <PageChrome title={data?.number ?? "Invoice"} backHref="/books/invoices" backLabel="Invoices" primary={issue}>
        {draft ? (
          <Kit contents>
            <span title={data.discardRefusal ?? undefined} style={{ display: "inline-flex" }}>
              <Button icon="x" disabled={!data.can.discard || change.isPending} onClick={() => change.mutate("VOIDED")}>
                Delete the draft
              </Button>
            </span>
          </Kit>
        ) : null}
      </PageChrome>
      <BooksPage screen="books-invoice">
        {data ? (
          <InvoicePageView data={data} />
        ) : notFound ? (
          <Empty icon="invoice" title="There is no such invoice here">
            It may have been cancelled, or it belongs to another workspace. Invoices lists every one this workspace has.
          </Empty>
        ) : invoice.isError ? (
          <BooksError what="The invoice" onRetry={() => invoice.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
    </>
  );
}

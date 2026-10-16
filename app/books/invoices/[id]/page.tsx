"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { InvoiceDeleteDialog, ReverseDrawer, type InvoiceDeleted, type InvoiceReversed } from "@/components/books/invoice-actions";
import { InvoiceRecordView } from "@/components/books/invoice-record-view";
import { Button, Empty, Kit } from "@/components/core";
import { PageChrome, type PageMenuItem } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money } from "@/lib/books/format";
import type { InvoiceRecordPage } from "@/lib/books/invoice-record";
import { fiscalNote } from "@/lib/books/reversal";

/**
 * One invoice in Books (the PageVaneDraft board). A draft is issued from
 * here (I), or deleted by anyone who may change drafts. Nothing is sent or
 * posted until a person presses Issue. On Vane's draft nobody has taken on,
 * Issue is the person confirming it as theirs (`asMine`): the server refuses
 * it without that (409). Once issued, the workspace's owner may Reverse it
 * (void it, or credit part of it) or Delete it outright; nobody else is
 * offered either, and the server refuses them (403).
 */
export default function BooksInvoicePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleting, setDeleting] = React.useState(false);
  const [reversing, setReversing] = React.useState(false);

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

  // Reverse from a row's menu in Invoices opens here with the drawer open.
  React.useEffect(() => {
    if (!record?.can.reverse) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("reverse") !== "1") return;
    setReversing(true);
    params.delete("reverse");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
  }, [record?.can.reverse]);

  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["books", "invoice", id] }), queryClient.invalidateQueries({ queryKey: ["books", "invoices"] })]);

  const reversed = async (done: InvoiceReversed) => {
    const fiscal = done.fiscalised ? ` ${fiscalNote(done.number)}` : "";
    if (done.how === "void") {
      const paid = done.unlinked.reduce((sum, receipt) => sum + receipt.amount, 0);
      toast({
        title: `${done.number} is void`,
        description: `${paid > 0 ? `The ${money(paid, record?.currency)} paid stays as ${done.customer}'s money on account.` : "Its posting is reversed."}${fiscal}`,
        variant: "success",
      });
    } else {
      toast({ title: `${done.note} credits ${money(done.total, done.currency)} on ${done.number}`, description: `Posted today.${fiscal}`, variant: "success" });
    }
    await refresh();
  };

  const deleted = async (done: InvoiceDeleted) => {
    const kept = done.onAccount.map((receipt) => receipt.number);
    toast({
      title: `${done.deleted} is deleted`,
      description: kept.length ? `${kept.join(", ")} ${kept.length === 1 ? "stays" : "stay"} as ${record?.customer.name ?? "the customer"}'s money on account.` : undefined,
      variant: "success",
    });
    await queryClient.invalidateQueries({ queryKey: ["books", "invoices"] });
    queryClient.removeQueries({ queryKey: ["books", "invoice", id] });
    router.push(done.draft ? "/books/invoices?view=drafts" : "/books/invoices");
  };

  const notFound = invoice.error instanceof ApiError && invoice.error.status === 404;
  const draft = record?.status === "DRAFT";
  const primary = draft
    ? record.can.issue
      ? { label: "Issue", icon: "send" as const, shortcut: "I", onClick: () => (issue.isPending ? undefined : issue.mutate()), disabled: issue.isPending ? "Issuing it" : undefined }
      : { label: "Issue", disabled: "Your role cannot issue invoices. A manager or the accountant can." }
    : null;

  // Below 720px the actions fold into ⋯ as menu items, so the menu closes as the drawer or dialog opens.
  const canReverse = Boolean(record?.can.reverse);
  const canDelete = Boolean(record?.can.delete);
  const phoneMenu = React.useMemo<PageMenuItem[] | null>(() => {
    if (!record) return null;
    const items: PageMenuItem[] = [];
    if (canReverse) items.push({ key: "reverse", label: "Reverse", onSelect: () => setReversing(true) });
    if (canDelete) items.push({ key: "delete", label: draft ? "Delete the draft" : "Delete", danger: true, onSelect: () => setDeleting(true) });
    return items;
  }, [record, canReverse, canDelete, draft]);

  return (
    <>
      <PageChrome title={record?.number ?? "Invoice"} backHref="/books/invoices" backLabel="Invoices" primary={primary} phoneMenu={phoneMenu}>
        {draft ? (
          <Kit contents>
            <span title={record.can.delete ? undefined : "Your role cannot change invoices."} style={{ display: "inline-flex" }}>
              <Button variant="danger" icon="x" disabled={!record.can.delete || issue.isPending} onClick={() => setDeleting(true)}>
                Delete the draft
              </Button>
            </span>
          </Kit>
        ) : record && (record.can.reverse || record.can.delete) ? (
          <Kit contents>
            {record.can.reverse ? (
              <Button icon="back" onClick={() => setReversing(true)}>
                Reverse
              </Button>
            ) : null}
            {record.can.delete ? (
              <Button variant="danger" icon="x" onClick={() => setDeleting(true)}>
                Delete
              </Button>
            ) : null}
          </Kit>
        ) : null}
      </PageChrome>
      <BooksPage screen="books-invoice">
        {record ? (
          <InvoiceRecordView invoice={record} canVoidPayments={record.can.voidPayments} />
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
        <>
          <InvoiceDeleteDialog invoiceId={record.id} number={record.number} open={deleting} onOpenChange={setDeleting} onDeleted={deleted} />
          {record.can.reverse ? <ReverseDrawer record={record} open={reversing} onOpenChange={setReversing} onDone={reversed} /> : null}
        </>
      ) : null}
    </>
  );
}

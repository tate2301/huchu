"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { BkInvoiceView } from "@/components/books/bk-invoice-view";
import { CreditDrawer, type CreditTarget } from "@/components/books/bk-credit-drawer";
import { useUndoMenu } from "@/components/books/undo-dialogs";
import { Button, ButtonGroup, ButtonLink, Empty, Kit } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PageChrome, type PageMenuItem } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { InvoiceRecordPage } from "@/lib/books/invoice-record";

/**
 * One invoice in Books (design/core-modules/boards/view/BkInvoice.html). A
 * draft is issued from here (I), or deleted by anyone who may change drafts.
 * Nothing is sent or posted until a person presses Issue. On Vane's draft
 * nobody has taken on, Issue is the person confirming it as theirs
 * (`asMine`): the server refuses it without that (409). Once issued: Record
 * a payment (R), Send a reminder, and ⋯ with Credit note and Write off as
 * `canDo` allows, then Revise, Void and Delete permanently as the core's
 * `undoChoices` says (BkVoidDialog, BkReviseDialog, BkDeleteDialog): faint,
 * with the reason on hover, when not allowed. The server refuses on its own.
 */
export default function BooksInvoicePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [crediting, setCrediting] = React.useState<"credit" | "write-off" | null>(null);

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

  // `?do=void|revise|delete` opens that dialog (a list's row menu, the bulk result); the old `?reverse=1` opens Void.
  const [initial, setInitial] = React.useState<string | null>(null);
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInitial(params.get("do") ?? (params.get("reverse") === "1" ? "void" : null));
  }, []);

  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["books", "invoice", id] }), queryClient.invalidateQueries({ queryKey: ["books", "invoices"] })]);

  // Void, Revise and Delete permanently, as the core's undoChoices says (P4): faint with the reason when not allowed.
  const undo = useUndoMenu("invoice", record?.id, {
    initial,
    onVoided: async (done) => {
      toast({ title: `${done.label} is void`, description: done.detail, variant: "success" });
      await refresh();
    },
    onRevised: async (done) => {
      toast({ title: `${done.label} is void`, description: "The new draft is open: put it right, then issue it. Payments left on account move to it then.", variant: "success" });
      await queryClient.invalidateQueries({ queryKey: ["books", "invoices"] });
      router.push(`/books/invoices/${done.draft.id}`);
    },
    onDeleted: async (done) => {
      const wasDraft = record?.status === "DRAFT";
      toast({ title: `${done.label} is deleted`, description: wasDraft ? undefined : "Payments on it stay on account; its snapshot is in the audit trail.", variant: "success" });
      await queryClient.invalidateQueries({ queryKey: ["books", "invoices"] });
      queryClient.removeQueries({ queryKey: ["books", "invoice", id] });
      router.push(wasDraft ? "/books/invoices?view=drafts" : "/books/invoices");
    },
  });

  const remind = useMutation({
    mutationFn: () => fetchJson<{ sent: unknown[]; skipped: Array<{ why: string }> }>("/api/books/invoices/reminders", { method: "POST", body: JSON.stringify({ invoiceIds: [id] }) }),
    onSuccess: (result) =>
      result.sent.length
        ? toast({ title: "Reminder sent on WhatsApp", variant: "success" })
        : toast({ title: "No reminder went", description: result.skipped[0]?.why ? `${result.skipped[0].why.charAt(0).toUpperCase()}${result.skipped[0].why.slice(1)}.` : undefined, variant: "destructive" }),
    onError: (error) => toast({ title: "The reminder did not go", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });

  const notFound = invoice.error instanceof ApiError && invoice.error.status === 404;
  const draft = record?.status === "DRAFT";
  const can = record?.can;
  const primary = draft
    ? record.can.issue
      ? { label: "Issue", icon: "send" as const, shortcut: "I", onClick: () => (issue.isPending ? undefined : issue.mutate()), disabled: issue.isPending ? "Issuing it" : undefined }
      : { label: "Issue", disabled: "Your role cannot issue invoices. A manager or the accountant can." }
    : record?.state.key === "overdue" && record.balance > 0.005
      ? { label: "Send a reminder", icon: "whatsapp" as const, shortcut: "S", onClick: () => (remind.isPending ? undefined : remind.mutate()), disabled: remind.isPending ? "Sending" : undefined }
      : null;
  const overdue = record?.state.key === "overdue";
  // An owing invoice has three actions: one group, Record a payment and a caret holding the rest (the owner, 19 Oct).
  const owing = Boolean(record && record.status === "ISSUED" && record.balance > 0.005);

  // ⋯: everything else this invoice allows, each as the one matrix says (books-final §2.2).
  const menu: MenuEntry[] = [];
  if (record && owing && !overdue) menu.push({ key: "remind", icon: "whatsapp", label: "Send a reminder", onSelect: () => remind.mutate() });
  if (record && !draft) {
    menu.push({ key: "statement", icon: "print", label: "Print a statement", onSelect: () => window.open(`/books/statements?customers=${record.customer.id}`, "_blank", "noopener") });
    if (can?.credit) menu.push({ key: "credit", icon: "invoice", label: "Credit note", onSelect: () => setCrediting("credit") });
    if (can?.writeOff) menu.push({ key: "write-off", icon: "retire", label: "Write off", onSelect: () => setCrediting("write-off") });
  }
  // Revise, Void and Delete: the core says which this person may press, and why not (rule 12).
  menu.push(...undo.entries);

  // Below 720px the actions fold into ⋯ as menu items, so the menu closes as the drawer or dialog opens.
  const phoneMenu = React.useMemo<PageMenuItem[] | null>(() => {
    if (!record) return null;
    return menu.flatMap((entry) => ("key" in entry && !entry.disabled ? [{ key: entry.key, label: typeof entry.label === "string" ? entry.label : entry.key, danger: entry.danger, onSelect: entry.onSelect }] : []));
    // The menu is rebuilt from the record on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, can?.credit, can?.writeOff, undo.choices]);

  const target: CreditTarget | null = record
    ? {
        id: record.id,
        number: record.number,
        customer: record.customer.name,
        currency: record.currency,
        creditLeft: record.creditLeft,
        balance: record.balance,
        taxRate: record.creditable[0]?.taxRate ?? 0,
        fiscalised: record.fiscalised,
      }
    : null;

  return (
    <>
      <PageChrome title={record?.number ?? "Invoice"} backHref="/books/invoices" backLabel="Invoices" primary={primary} phoneMenu={phoneMenu}>
        {record ? (
          <Kit contents>
            {owing ? (
              <ButtonGroup aria-label="Record a payment, and more">
                {can?.pay ? (
                  <ButtonLink variant={overdue ? undefined : "primary"} icon="payments" shortcut="R" href={`/books/payments/new?invoice=${record.id}&customer=${record.customer.id}`}>
                    Record a payment
                  </ButtonLink>
                ) : (
                  <Button variant={overdue ? undefined : "primary"} icon="payments" shortcut="R" disabled title="Your role cannot record payments.">
                    Record a payment
                  </Button>
                )}
                <MenuButton variant={overdue ? undefined : "primary"} iconOnly icon="down" iconEnd={undefined} align="end" label="More actions" aria-label="More actions" items={menu} />
              </ButtonGroup>
            ) : menu.length > 0 ? (
              <MenuButton iconOnly icon="more" iconEnd={undefined} align="end" label="More actions" aria-label="More actions" items={menu} />
            ) : null}
          </Kit>
        ) : null}
      </PageChrome>
      <BooksPage screen="bk-a">
        {record ? (
          <>
            <BkInvoiceView invoice={record} />
            {record.status === "ISSUED" && record.balance > 0.005 ? (
              // On a phone the two things an owing invoice asks for sit at the foot (BkInvoicePhone).
              <div className="bk-ph-acts">
                <Button variant="primary" icon="whatsapp" shortcut="S" busy={remind.isPending} disabled={remind.isPending} onClick={() => remind.mutate()}>
                  Send a reminder
                </Button>
                {can?.pay ? (
                  <ButtonLink icon="payments" href={`/books/payments/new?invoice=${record.id}&customer=${record.customer.id}`}>
                    Record a payment
                  </ButtonLink>
                ) : null}
              </div>
            ) : null}
          </>
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
          {undo.node}
          <CreditDrawer
            kind={crediting ?? "credit"}
            target={target}
            open={crediting !== null}
            onOpenChange={(open) => (open ? undefined : setCrediting(null))}
            onDone={async (message) => {
              toast({ ...message, variant: "success" });
              await refresh();
            }}
          />
        </>
      ) : null}
    </>
  );
}

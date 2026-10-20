"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { InvoiceDeleteDialog, ReverseDrawer, type InvoiceDeleted, type InvoiceReversed } from "@/components/books/invoice-actions";
import { BkInvoiceView } from "@/components/books/bk-invoice-view";
import { CreditDrawer, type CreditTarget } from "@/components/books/bk-credit-drawer";
import { ReviseDialog } from "@/components/books/revise-dialog";
import { Button, ButtonGroup, ButtonLink, Empty, Kit } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PageChrome, type PageMenuItem } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money } from "@/lib/books/format";
import type { InvoiceRecordPage } from "@/lib/books/invoice-record";
import { fiscalNote } from "@/lib/books/reversal";

/**
 * One invoice in Books (design/core-modules/boards/view/BkInvoice.html). A
 * draft is issued from here (I), or deleted by anyone who may change drafts.
 * Nothing is sent or posted until a person presses Issue. On Vane's draft
 * nobody has taken on, Issue is the person confirming it as theirs
 * (`asMine`): the server refuses it without that (409). Once issued: Record
 * a payment (R), Send a reminder, and ⋯ with Credit note, Write off, Revise
 * (P4), Void and Delete, each offered as `canDo` allows; the server refuses
 * on its own.
 */
export default function BooksInvoicePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleting, setDeleting] = React.useState(false);
  const [reversing, setReversing] = React.useState(false);
  const [revising, setRevising] = React.useState(false);
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
    const fiscal = done.fiscalised ? ` ${fiscalNote(done.number, done.fiscalSent === true)}` : "";
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
    : null;
  // An owing invoice has three actions: one group, Record a payment and a caret holding the rest (the owner, 19 Oct).
  const owing = Boolean(record && record.status === "ISSUED" && record.balance > 0.005);

  // ⋯: everything else this invoice allows, each as the one matrix says (books-final §2.2).
  const menu: MenuEntry[] = [];
  if (record && owing) menu.push({ key: "remind", icon: "whatsapp", label: "Send a reminder", onSelect: () => remind.mutate() });
  if (record && !draft) {
    menu.push({ key: "statement", icon: "print", label: "Print a statement", onSelect: () => window.open(`/books/statements?customers=${record.customer.id}`, "_blank", "noopener") });
    if (can?.credit) menu.push({ key: "credit", icon: "invoice", label: "Credit note", onSelect: () => setCrediting("credit") });
    if (can?.writeOff) menu.push({ key: "write-off", icon: "retire", label: "Write off", onSelect: () => setCrediting("write-off") });
    if (record.status !== "VOIDED") {
      // Void and revise go together (§2.2): the owner, or someone the owner let.
      menu.push(
        can?.reverse
          ? { key: "revise", icon: "edit", label: "Revise", onSelect: () => setRevising(true) }
          : { key: "revise", icon: "edit", label: "Revise", disabled: true, title: "Only the owner can revise an issued invoice, unless they let you.", onSelect: () => undefined },
      );
    }
    if (can?.reverse) {
      menu.push({ separator: true });
      menu.push({ key: "void", icon: "x", danger: true, label: "Void", onSelect: () => setReversing(true) });
    }
  }
  if (can?.delete) {
    if (!menu.some((entry) => "separator" in entry)) menu.push({ separator: true });
    menu.push({ key: "delete", icon: "x", danger: true, label: draft ? "Delete the draft" : "Delete permanently", onSelect: () => setDeleting(true) });
  }

  // Below 720px the actions fold into ⋯ as menu items, so the menu closes as the drawer or dialog opens.
  const phoneMenu = React.useMemo<PageMenuItem[] | null>(() => {
    if (!record) return null;
    return menu.flatMap((entry) => ("key" in entry && !entry.disabled ? [{ key: entry.key, label: typeof entry.label === "string" ? entry.label : entry.key, danger: entry.danger, onSelect: entry.onSelect }] : []));
    // The menu is rebuilt from the record on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, can?.credit, can?.writeOff, can?.reverse, can?.delete]);

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
                  <ButtonLink variant="primary" icon="payments" shortcut="R" href={`/books/payments/new?invoice=${record.id}&customer=${record.customer.id}`}>
                    Record a payment
                  </ButtonLink>
                ) : (
                  <Button variant="primary" icon="payments" shortcut="R" disabled title="Your role cannot record payments.">
                    Record a payment
                  </Button>
                )}
                <MenuButton variant="primary" iconOnly icon="down" iconEnd={undefined} align="end" label="More actions" aria-label="More actions" items={menu} />
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
          <InvoiceDeleteDialog invoiceId={record.id} number={record.number} open={deleting} onOpenChange={setDeleting} onDeleted={deleted} />
          <ReviseDialog
            kind="invoice"
            id={record.id}
            number={record.number}
            noun="invoice"
            open={revising}
            onOpenChange={setRevising}
            onRevised={async (done) => {
              toast({ title: `${done.label} is void`, description: "The new draft is open: put it right, then issue it.", variant: "success" });
              await queryClient.invalidateQueries({ queryKey: ["books", "invoices"] });
              router.push(`/books/invoices/${done.draft.id}`);
            }}
          />
          {record.can.reverse ? <ReverseDrawer record={record} open={reversing} onOpenChange={setReversing} onDone={reversed} /> : null}
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

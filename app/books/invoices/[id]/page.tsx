"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BkInvoiceView } from "@/components/books/bk-invoice-view";
import { CreditDrawer, type CreditTarget } from "@/components/books/bk-credit-drawer";
import { CiIcon } from "@/components/books/icons/ci-icon";
import { BkError, BkLoading, BkNote, BkPage } from "@/components/books/ui";
import { useUndoMenu } from "@/components/books/undo-dialogs";
import { Button, ButtonLink, Kit } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { ChaseDialog, type ChaseTarget } from "@/components/crm/collections/chase-dialog";
import { useDocumentActions } from "@/components/crm/documents/document-actions";
import type { LeadDocument } from "@/components/crm/documents/document-types";
import { PageChrome, type PageMenuItem } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { InvoiceRecordPage } from "@/lib/books/invoice-record";

type CrmDocument = { document: LeadDocument; basePath: string | null };

/**
 * One invoice in Books (bk-invoice), its one address. A draft is issued from
 * here (I). Once issued: Record a payment (R), Credit, PDF and ⋯ beside Send
 * a reminder (S). ⋯ holds Write off, a statement, and for an invoice raised
 * from a deal Email it and Log a chase (through the deal, as the CRM did), then
 * Revise, Void and Delete as the core's `undoChoices` says: faint, with the
 * reason, when not allowed. The server refuses on its own.
 */
export default function BooksInvoicePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [crediting, setCrediting] = React.useState<"credit" | "write-off" | null>(null);
  const [chasing, setChasing] = React.useState<ChaseTarget | null>(null);

  const invoice = useQuery({
    queryKey: ["books", "invoice", id],
    queryFn: () => fetchJson<InvoiceRecordPage>(`/api/books/invoices/${id}`),
    enabled: Boolean(id),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  const record = invoice.data;

  // An invoice raised from a deal keeps the CRM's verbs for it: email it to the client, log a chase.
  const crm = useQuery({
    queryKey: ["crm", "documents", "record", record?.crm?.documentId],
    queryFn: () => fetchJson<CrmDocument>(`/api/v2/crm/documents/${record!.crm!.documentId}`),
    enabled: Boolean(record?.crm),
  });
  const crmActions = useDocumentActions({ basePath: crm.data?.basePath ?? "", currency: record?.currency ?? "USD" });
  const crmVerbs = crm.data?.basePath ? crmActions.verbsFor(crm.data.document) : [];
  const email = crmVerbs.find((verb) => verb.id === "email" && !verb.refusal);

  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["books", "invoice", id] }), queryClient.invalidateQueries({ queryKey: ["books", "invoices"] })]);

  const issue = useMutation({
    mutationFn: () => fetchJson<{ number: string; customer: string }>(`/api/books/invoices/${id}/issue`, { method: "POST", body: JSON.stringify({ asMine: record?.waiting === true }) }),
    onSuccess: async (issued) => {
      toast({ title: `${issued.number} is issued to ${issued.customer}`, variant: "success" });
      await refresh();
    },
    onError: (error) => toast({ title: "It was not issued", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });

  // `?do=void|revise|delete` opens that dialog (a list's row menu, the bulk result).
  const [initial, setInitial] = React.useState<string | null>(null);
  React.useEffect(() => {
    setInitial(new URLSearchParams(window.location.search).get("do"));
  }, []);

  const undo = useUndoMenu("invoice", record?.id, {
    initial,
    onVoided: async (done) => {
      toast({ title: `${done.label} is void`, description: done.detail, variant: "success" });
      await refresh();
    },
    onRevised: async (done) => {
      toast({ title: `${done.label} is void`, description: `${done.draft.label} is open: put it right, then issue it.`, variant: "success" });
      await queryClient.invalidateQueries({ queryKey: ["books", "invoices"] });
      router.push(`/books/invoices/${done.draft.id}`);
    },
    onDeleted: async (done) => {
      const wasDraft = record?.status === "DRAFT";
      toast({ title: `${done.label} is deleted`, variant: "success" });
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
  const owing = Boolean(record && record.status === "ISSUED" && record.balance > 0.005);
  const primary = !record
    ? null
    : draft
      ? can?.issue
        ? { label: "Issue", icon: "send" as const, shortcut: "I", onClick: () => (issue.isPending ? undefined : issue.mutate()), disabled: issue.isPending ? "Issuing it" : undefined }
        : { label: "Issue", icon: "send" as const, disabled: "Your role cannot issue invoices. A manager or the accountant can." }
      : owing
        ? { label: "Send a reminder", icon: "whatsapp" as const, shortcut: "S", onClick: () => (remind.isPending ? undefined : remind.mutate()), disabled: remind.isPending ? "Sending it" : undefined }
        : null;

  // ⋯: everything else this invoice allows, each as the one matrix says.
  const menu: MenuEntry[] = [];
  if (record && !draft) {
    if (can?.writeOff) menu.push({ key: "write-off", icon: "retire", label: "Write off", onSelect: () => setCrediting("write-off") });
    menu.push({ key: "statement", icon: "print", label: "Print a statement", onSelect: () => window.open(`/books/statements?customers=${record.customer.id}`, "_blank", "noopener") });
    if (email?.onSelect) menu.push({ key: "email", icon: "send", label: "Email it to the client", onSelect: email.onSelect });
    if (record.crm && owing) menu.push({ key: "chase", icon: "history", label: "Log a chase", onSelect: () => setChasing({ documentId: record.crm!.documentId, invoiceNumber: record.number, owedBy: record.customer.name }) });
  }
  menu.push(...undo.entries);

  const phoneMenu = React.useMemo<PageMenuItem[] | null>(() => {
    if (!record) return null;
    const items: PageMenuItem[] = [];
    if (owing && can?.pay) items.push({ key: "pay", label: "Record a payment", onSelect: () => router.push(`/books/payments/new?invoice=${record.id}&customer=${record.customer.id}`) });
    if (!draft && can?.credit) items.push({ key: "credit", label: "Credit", onSelect: () => setCrediting("credit") });
    if (!draft) items.push({ key: "pdf", label: "PDF", onSelect: () => window.open(`/api/accounting/sales/invoices/${record.id}/pdf`, "_blank", "noopener") });
    for (const entry of menu) if ("key" in entry && !entry.disabled) items.push({ key: entry.key, label: typeof entry.label === "string" ? entry.label : entry.key, danger: entry.danger, onSelect: entry.onSelect });
    return items;
    // The menu is rebuilt from the record on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, can?.credit, can?.writeOff, undo.choices, email]);

  const target: CreditTarget | null = record
    ? { id: record.id, number: record.number, customer: record.customer.name, currency: record.currency, creditLeft: record.creditLeft, balance: record.balance, taxRate: record.creditable[0]?.taxRate ?? 0, fiscalised: record.fiscalised }
    : null;

  return (
    <>
      <PageChrome title={record?.number ?? "Invoice"} backHref="/books/invoices" backLabel="Invoices" primary={primary} phoneMenu={phoneMenu}>
        {record ? (
          <Kit contents>
            <div className="btn-group" role="group" aria-label="This invoice">
              {owing ? (
                can?.pay ? (
                  <ButtonLink shortcut="R" href={`/books/payments/new?invoice=${record.id}&customer=${record.customer.id}`}>
                    <CiIcon name="banknote" className="ic" />
                    Record a payment
                  </ButtonLink>
                ) : (
                  <Button shortcut="R" disabled title="Your role cannot record payments.">
                    <CiIcon name="banknote" className="ic" />
                    Record a payment
                  </Button>
                )
              ) : null}
              {!draft ? (
                <Button disabled={!can?.credit} title={can?.credit ? undefined : "Nothing is left to credit, or your role cannot."} onClick={() => setCrediting("credit")}>
                  <CiIcon name="doc-plus" className="ic" />
                  Credit
                </Button>
              ) : null}
              {!draft ? (
                <a className="btn" href={`/api/accounting/sales/invoices/${record.id}/pdf`} target="_blank" rel="noopener noreferrer">
                  <CiIcon name="printer" className="ic" />
                  PDF
                </a>
              ) : null}
              {menu.length ? <MenuButton iconOnly icon="more" iconEnd={undefined} align="end" label="More: write off, revise, void" aria-label="More: write off, revise, void" items={menu} /> : null}
            </div>
          </Kit>
        ) : null}
      </PageChrome>
      <BkPage screen="invoice">
        {record ? (
          <BkInvoiceView invoice={record} />
        ) : notFound ? (
          <BkNote tone="bad" action={<ButtonLink href="/books/invoices">Invoices</ButtonLink>}>
            <b>There is no such invoice here.</b> It was deleted, or it belongs to another workspace.
          </BkNote>
        ) : invoice.isError ? (
          <BkError what="This invoice" onRetry={() => invoice.refetch()} />
        ) : (
          <BkLoading />
        )}
      </BkPage>
      {record ? (
        <>
          {undo.node}
          {crmActions.surfaces}
          <ChaseDialog target={chasing} onOpenChange={(open) => (!open ? setChasing(null) : undefined)} />
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

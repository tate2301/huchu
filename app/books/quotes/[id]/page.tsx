"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { BkQuoteView } from "@/components/books/bk-quote-view";
import { useUndoMenu } from "@/components/books/undo-dialogs";
import { useDocumentActions } from "@/components/crm/documents/document-actions";
import type { LeadDocument } from "@/components/crm/documents/document-types";
import { Button, ButtonGroup, ButtonLink, Empty, Kit } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PageChrome, type PageMenuItem } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { QuoteRecordPage } from "@/lib/books/quote-record";

export default function BooksQuotePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const quote = useQuery({
    queryKey: ["books", "quote", id],
    queryFn: () => fetchJson<QuoteRecordPage>(`/api/books/quotes/${id}`),
    enabled: Boolean(id),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  const record = quote.data;

  const refresh = React.useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books", "quote", id] }),
        queryClient.invalidateQueries({ queryKey: ["books", "quotes"] }),
        queryClient.invalidateQueries({ queryKey: ["books", "invoices"] }),
      ]),
    [id, queryClient],
  );

  const issue = useMutation({
    mutationFn: () =>
      fetchJson<{ id: string; number: string; customer: string }>(`/api/books/quotes/${id}/issue`, {
        method: "POST",
        body: JSON.stringify({ asMine: record?.waiting === true }),
      }),
    onSuccess: async (issued) => {
      toast({
        title: `${issued.number} is issued to ${issued.customer}`,
        description: record?.waiting ? "It is yours now. Send the approval link or email it to the client." : "Ready to send to the client.",
        variant: "success",
      });
      await refresh();
    },
    onError: (error) =>
      toast({
        title: "It was not issued",
        description: getApiErrorMessage(error, "Check the connection and try again."),
        variant: "destructive",
      }),
  });

  const [initial, setInitial] = React.useState<string | null>(null);
  React.useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setInitial(searchParams.get("do"));
  }, []);

  const ownerAnchor = record?.dealId ?? record?.leadId ?? record?.customer.id ?? id;
  const docActions = useDocumentActions({
    basePath: `/api/books/crm/${ownerAnchor}`,
    currency: record?.currency ?? "USD",
    onChanged: () => void refresh(),
  });
  const crmDoc = (record?.crmDocument ?? null) as unknown as LeadDocument | null;

  const undo = useUndoMenu("quote", record?.id, {
    initial,
    onVoided: async (done) => {
      toast({ title: `${done.label} is void`, description: done.detail, variant: "success" });
      await refresh();
    },
    onRevised: async (done) => {
      toast({ title: `${done.label} is void`, description: "The new draft is open: put it right, then issue it.", variant: "success" });
      await queryClient.invalidateQueries({ queryKey: ["books", "quotes"] });
      router.push(`/books/quotes/${done.draft.id}`);
    },
    onDeleted: async (done) => {
      toast({ title: `${done.label} is deleted`, variant: "success" });
      await queryClient.invalidateQueries({ queryKey: ["books", "quotes"] });
      queryClient.removeQueries({ queryKey: ["books", "quote", id] });
      router.push("/books/quotes");
    },
  });

  const notFound = quote.error instanceof ApiError && quote.error.status === 404;
  const draft = record?.status === "DRAFT";
  const canConvert = Boolean(record && (record.status === "SENT" || record.status === "ACCEPTED") && record.invoices.length === 0 && record.can.convert);

  const primary = draft
    ? record.can.issue
      ? {
          label: "Issue",
          icon: "send" as const,
          shortcut: "I",
          onClick: () => (issue.isPending ? undefined : issue.mutate()),
          disabled: issue.isPending ? "Issuing it" : undefined,
        }
      : { label: "Issue", disabled: "Your role cannot issue quotes." }
    : null;

  const menu: MenuEntry[] = [];
  if (record) {
    if (crmDoc) {
      menu.push(...docActions.menuEntriesFor(crmDoc));
    } else {
      menu.push(
        { key: "view-pdf", icon: "eye", label: "View PDF", onSelect: () => window.open(`/api/books/quotes/${record.id}/pdf`, "_blank", "noopener,noreferrer") },
        { key: "download-pdf", icon: "export", label: "Download PDF", onSelect: () => { window.location.href = `/api/books/quotes/${record.id}/pdf?download=1`; } },
      );
    }
    menu.push({ separator: true });
    if (record.status !== "VOIDED") {
      menu.push({
        key: "books-invoice",
        icon: "invoice",
        label: "Open in Books invoice form",
        onSelect: () => router.push(`/books/invoices/new?quote=${record.id}`),
      });
    }
  }
  menu.push(...undo.entries);

  const phoneMenu = React.useMemo<PageMenuItem[] | null>(() => {
    if (!record) return null;
    return menu.flatMap((entry) =>
      "key" in entry && !entry.disabled
        ? [{ key: entry.key, label: typeof entry.label === "string" ? entry.label : entry.key, danger: entry.danger, onSelect: entry.onSelect }]
        : [],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, undo.choices]);

  return (
    <>
      <PageChrome title={record?.number ?? "Quote"} backHref="/books/quotes" backLabel="Quotes" primary={primary} phoneMenu={phoneMenu}>
        {record ? (
          <Kit contents>
            <ButtonLink icon="export" href={`/api/books/quotes/${record.id}/pdf?download=1`}>
              PDF
            </ButtonLink>
            {canConvert && crmDoc ? (
              <ButtonGroup aria-label="Convert to invoice, and more">
                <Button variant="primary" icon="invoice" onClick={() => docActions.openConvert(crmDoc)}>
                  Convert to invoice
                </Button>
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
            <BkQuoteView quote={record} />
            {canConvert && crmDoc ? (
              <div className="bk-ph-acts">
                <Button variant="primary" icon="invoice" onClick={() => docActions.openConvert(crmDoc)}>
                  Convert to invoice
                </Button>
                <Button icon="send" onClick={() => docActions.shareLink(crmDoc)}>
                  Send link
                </Button>
              </div>
            ) : null}
          </>
        ) : notFound ? (
          <Empty icon="file" title="There is no such quote here">
            It may have been deleted, or it belongs to another workspace. Quotes lists every one this workspace has.
          </Empty>
        ) : quote.isError ? (
          <BooksError what="This quote" onRetry={() => quote.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      {record ? (
        <>
          {undo.node}
          {docActions.surfaces}
        </>
      ) : null}
    </>
  );
}

"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { BkPaymentView } from "@/components/books/bk-payment-view";
import { useUndoMenu } from "@/components/books/undo-dialogs";
import { useDocumentActions } from "@/components/crm/documents/document-actions";
import type { LeadDocument } from "@/components/crm/documents/document-types";
import { Button, ButtonGroup, ButtonLink, Empty, Kit } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PageChrome, type PageMenuItem } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson } from "@/lib/api-client";
import type { PaymentRecordPage } from "@/lib/books/payment-record";

export default function BooksPaymentPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const payment = useQuery({
    queryKey: ["books", "payment", id],
    queryFn: () => fetchJson<PaymentRecordPage>(`/api/books/payments/${id}`),
    enabled: Boolean(id),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  const record = payment.data;

  const refresh = React.useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books", "payment", id] }),
        queryClient.invalidateQueries({ queryKey: ["books", "payments"] }),
        queryClient.invalidateQueries({ queryKey: ["books", "invoices"] }),
      ]),
    [id, queryClient],
  );

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

  const undo = useUndoMenu("receipt", record?.id, {
    initial,
    onVoided: async (done) => {
      toast({ title: `${done.label} is void`, description: done.detail, variant: "success" });
      await refresh();
    },
    onDeleted: async (done) => {
      toast({ title: `${done.label} is deleted`, variant: "success" });
      await queryClient.invalidateQueries({ queryKey: ["books", "payments"] });
      queryClient.removeQueries({ queryKey: ["books", "payment", id] });
      router.push("/books/payments");
    },
  });

  const notFound = payment.error instanceof ApiError && payment.error.status === 404;

  const menu: MenuEntry[] = [];
  if (record) {
    if (crmDoc) {
      menu.push(...docActions.menuEntriesFor(crmDoc));
    } else {
      menu.push(
        { key: "view-pdf", icon: "eye", label: "View PDF", onSelect: () => window.open(`/api/books/payments/${record.id}/pdf`, "_blank", "noopener,noreferrer") },
        { key: "download-pdf", icon: "export", label: "Download PDF", onSelect: () => { window.location.href = `/api/books/payments/${record.id}/pdf?download=1`; } },
      );
    }
    if (record.customer.id) {
      menu.push({
        key: "statement",
        icon: "print",
        label: "Print a statement",
        onSelect: () => window.open(`/books/statements?customers=${record.customer.id}`, "_blank", "noopener"),
      });
    }
    menu.push({ separator: true });
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
      <PageChrome title={record?.number ?? "Payment"} backHref="/books/payments" backLabel="Payments" phoneMenu={phoneMenu}>
        {record ? (
          <Kit contents>
            <ButtonLink icon="export" href={`/api/books/payments/${record.id}/pdf?download=1`}>
              PDF
            </ButtonLink>
            {crmDoc && !record.voided ? (
              <ButtonGroup aria-label="Send receipt, and more">
                <Button variant="primary" icon="send" onClick={() => docActions.openEmail(crmDoc)}>
                  Email receipt
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
            <BkPaymentView payment={record} />
            {crmDoc && !record.voided ? (
              <div className="bk-ph-acts">
                <Button variant="primary" icon="send" onClick={() => docActions.openEmail(crmDoc)}>
                  Email receipt
                </Button>
                <Button icon="share" onClick={() => docActions.shareLink(crmDoc)}>
                  Copy link
                </Button>
              </div>
            ) : null}
          </>
        ) : notFound ? (
          <Empty icon="payments" title="There is no such payment here">
            It may have been deleted, or it belongs to another workspace. Payments lists every one this workspace has.
          </Empty>
        ) : payment.isError ? (
          <BooksError what="This payment" onRetry={() => payment.refetch()} />
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

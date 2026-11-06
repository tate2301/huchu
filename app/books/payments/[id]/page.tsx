"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { ApplyPaymentDrawer } from "@/components/books/bk-payment-drawers";
import type { ApplyPaymentResult } from "@/lib/books/payment-apply";
import { BkPaymentView } from "@/components/books/bk-payment-view";
import { useUndoMenu } from "@/components/books/undo-dialogs";
import { useDocumentActions } from "@/components/crm/documents/document-actions";
import type { LeadDocument } from "@/components/crm/documents/document-types";
import { Button, ButtonGroup, ButtonLink, Empty, Kit } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PageChrome, type PageMenuItem } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson } from "@/lib/api-client";
import { money } from "@/lib/books/format";
import type { PaymentRecordPage } from "@/lib/books/payment-record";

export default function BooksPaymentPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [applying, setApplying] = React.useState(false);

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
    const doAction = searchParams.get("do");
    if (doAction === "apply") {
      setApplying(true);
    } else {
      setInitial(doAction);
    }
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
  const canApply = Boolean(record && record.state.key === "on-account" && record.can.apply !== false && record.customer.id);

  const menu: MenuEntry[] = [];
  if (record) {
    if (canApply) {
      menu.push({ key: "apply", icon: "check", label: "Apply to an invoice", onSelect: () => setApplying(true) });
    }
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
        icon: "docs",
        label: "Statement",
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
  }, [record, undo.choices, canApply]);

  const primary = canApply
    ? { label: "Apply to an invoice", icon: "check" as const, shortcut: "A", onClick: () => setApplying(true) }
    : null;

  return (
    <>
      <PageChrome title={record?.number ?? "Payment"} backHref="/books/payments" backLabel="Payments" primary={primary} phoneMenu={phoneMenu}>
        {record ? (
          <Kit contents>
            <ButtonLink icon="export" href={`/api/books/payments/${record.id}/pdf?download=1`}>
              PDF
            </ButtonLink>
            {crmDoc && !record.voided ? (
              <ButtonGroup aria-label="Send receipt, and more">
                <Button variant={canApply ? undefined : "primary"} icon="send" onClick={() => docActions.openEmail(crmDoc)}>
                  Email receipt
                </Button>
                <MenuButton variant={canApply ? undefined : "primary"} iconOnly icon="down" iconEnd={undefined} align="end" label="More actions" aria-label="More actions" items={menu} />
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
            <BkPaymentView payment={record} onApply={canApply ? () => setApplying(true) : undefined} />
            {!record.voided ? (
              <div className="bk-ph-acts">
                {canApply ? (
                  <Button variant="primary" icon="check" onClick={() => setApplying(true)}>
                    Apply to an invoice
                  </Button>
                ) : null}
                {crmDoc ? (
                  <>
                    <Button variant={canApply ? undefined : "primary"} icon="send" onClick={() => docActions.openEmail(crmDoc)}>
                      Email receipt
                    </Button>
                    <Button icon="share" onClick={() => docActions.shareLink(crmDoc)}>
                      Copy link
                    </Button>
                  </>
                ) : null}
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
          <ApplyPaymentDrawer
            receipt={{
              id: record.id,
              number: record.number,
              amount: record.amount,
              currency: record.currency,
              customerId: record.customer.id,
              customerName: record.customer.name,
              openInvoices: record.openInvoices,
            }}
            open={applying}
            onOpenChange={setApplying}
            onDone={async (done: ApplyPaymentResult) => {
              const appliedLabel = done.applied.map((row) => `${money(row.amount, done.currency)} to ${row.invoiceNumber}`).join(", ");
              toast({
                title: `${record.number} applied`,
                description:
                  done.onAccount && done.onAccount.amount > 0.005
                    ? `Applied ${appliedLabel}. ${money(done.onAccount.amount, done.currency)} stays on account (${done.onAccount.receiptNumber}).`
                    : `Applied ${appliedLabel}.`,
                variant: "success",
              });
              await refresh();
            }}
          />
        </>
      ) : null}
    </>
  );
}

"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@corelithzw/ui/components/button";
import { IconButton } from "@corelithzw/ui/components/icon-button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@corelithzw/ui/components/empty";
import { StatusChip } from "@corelithzw/ui/components/status-chip";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@corelithzw/ui/components/dropdown-menu";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { cn } from "@corelithzw/ui/lib/utils";
import {
  Check,
  Download,
  DotsThree,
  Eye,
  FileText,
  Mail,
  Payments,
  Plus,
  ReceiptLong,
  Send,
  X,
} from "@corelithzw/ui/lib/icons";

import { DocumentBuilderSheet } from "./document-builder-sheet";
import { RecordPaymentSheet } from "./record-payment-sheet";
import { BillingBand } from "./billing-band";
import { DepositDialog } from "./deposit-dialog";
import {
  DOCUMENT_KIND_LABELS,
  documentNumber,
  documentStatus,
  formatMoney,
  invoiceOutstanding,
  type LeadDocument,
} from "./document-types";
import { refreshAfterDocumentChange } from "@/lib/crm/refresh";

import { Stack } from "@corelithzw/react";

function KindIcon({ type }: { type: LeadDocument["type"] }) {
  const Icon = type === "RECEIPT" ? ReceiptLong : FileText;
  return <Icon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />;
}

/**
 * What the customer did with it, and what they said.
 *
 * The approval record has carried `firstViewedAt`, `respondedAt`,
 * `responderName` and `responseNote` since the day approval links shipped, and
 * the record page read none of them — so "have they seen the quote?" and "why
 * did they turn it down?" were questions the system knew the answer to and
 * would not tell anybody. The status chip said "Declined" and stopped.
 *
 * Sent-but-unopened is its own state and worth showing: chasing somebody who
 * has not opened the email is a different conversation from chasing somebody
 * who read it a week ago and went quiet.
 */
export function ApprovalFeedback({ approval }: { approval: LeadDocument["approval"] }) {
  if (!approval) return null;

  const declined = approval.status === "DECLINED";
  const approved = approval.status === "APPROVED";
  const who = approval.responderName?.trim();

  if (!approval.respondedAt) {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--text-subtle)]">
        <Eye className="size-3.5 shrink-0" aria-hidden="true" />
        {approval.firstViewedAt ? (
          <>
            Opened <ClientDate value={approval.firstViewedAt} />, no answer yet
          </>
        ) : (
          "Sent, not opened yet"
        )}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "mt-1.5 border-l-2 pl-2.5 text-sm",
        declined ? "border-[var(--status-error-border)]" : "border-[var(--status-success-border)]",
      )}
    >
      <p
        className={cn(
          "flex items-center gap-1.5 font-medium",
          declined ? "text-[var(--status-error-text)]" : "text-[var(--status-success-text)]",
        )}
      >
        {declined ? (
          <X className="size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <Check className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        {who ? `${who} ` : ""}
        {declined ? "declined" : approved ? "accepted" : "responded"} this{" "}
        <ClientDate value={approval.respondedAt} />
      </p>
      {approval.responseNote?.trim() ? (
        <p className="mt-0.5 whitespace-pre-wrap text-[var(--text-body)]">
          “{approval.responseNote.trim()}”
        </p>
      ) : null}
    </div>
  );
}

export function DocumentList({
  basePath,
  currency,
  documents,
  canCreate,
  prefillLines,
  onPrefillConsumed,
}: {
  /** The record's API base, e.g. /api/v2/crm/deals/<id>. */
  basePath: string;
  currency: string;
  documents: LeadDocument[];
  canCreate: boolean;
  prefillLines?: Parameters<typeof DocumentBuilderSheet>[0]["prefillLines"];
  onPrefillConsumed?: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [builder, setBuilder] = useState<{
    mode: "quotation" | "invoice";
    fromQuotationId?: string;
    deposit?: boolean;
  } | null>(null);
  const [paymentFor, setPaymentFor] = useState<LeadDocument | null>(null);
  const [depositFor, setDepositFor] = useState<LeadDocument | null>(null);
  const [depositLine, setDepositLine] =
    useState<Parameters<typeof DocumentBuilderSheet>[0]["prefillLines"]>(undefined);

  const shareApproval = useMutation({
    mutationFn: (docId: string) =>
      // `{ token, path }`, bare. `successResponse` adds no envelope of its
      // own, and declaring one here is why sharing a quote produced a link
      // ending in `/undefined` — a lie the compiler accepted, surfacing only
      // when a customer clicked it.
      fetchJson<{ token: string; path: string }>(
        `${basePath}/documents/${docId}/approval`,
        { method: "POST", body: JSON.stringify({}) },
      ),
    onSuccess: async (result) => {
      const url = `${window.location.origin}${result.path}`;
      try {
        await navigator.clipboard?.writeText(url);
        toast({ title: "Approval link copied", description: url });
      } catch {
        // Clipboard is blocked in some browsers without a user gesture chain;
        // showing the link is still useful.
        toast({ title: "Approval link ready", description: url });
      }
      refreshAfterDocumentChange(queryClient);
    },
    onError: (error) =>
      toast({
        title: "Could not create the approval link",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  /**
   * Hand the document to whatever the reader sends mail with.
   *
   * Not a server-side send: this platform has no outbound mail — no provider,
   * no API key, nowhere to queue a retry — and the honest version of "email
   * this" under those conditions is a composed draft in the reader's own
   * client, not a button that appears to send and does not. It mints the
   * approval link first, so what lands in the customer's inbox is a link they
   * can act on rather than a bare PDF.
   *
   * When outbound mail does arrive, this is the call site to change.
   */
  const emailToClient = useMutation({
    mutationFn: async (doc: LeadDocument) => {
      const approval = await fetchJson<{ token: string; path: string }>(
        `${basePath}/documents/${doc.id}/approval`,
        { method: "POST", body: JSON.stringify({}) },
      );
      return { doc, url: `${window.location.origin}${approval.path}` };
    },
    onSuccess: ({ doc, url }) => {
      const kind = DOCUMENT_KIND_LABELS[doc.type].toLowerCase();
      const subject = `${DOCUMENT_KIND_LABELS[doc.type]} ${documentNumber(doc)}`;
      const body = [
        `Please find our ${kind} ${documentNumber(doc)} for ${formatMoney(doc.amount, doc.currency)}.`,
        "",
        `You can review and respond to it here: ${url}`,
        "",
      ].join("\n");
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      refreshAfterDocumentChange(queryClient);
    },
    onError: (error) =>
      toast({
        title: "Could not prepare the email",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const markPaid = useMutation({
    mutationFn: (doc: LeadDocument) =>
      fetchJson(`${basePath}/receipt`, {
        method: "POST",
        body: JSON.stringify({
          invoiceDocumentId: doc.id,
          amount: doc.invoice ? invoiceOutstanding(doc.invoice) : doc.amount,
          method: "Bank transfer",
        }),
      }),
    onSuccess: () => {
      // The receipt is the point: an invoice marked paid with nothing issued
      // to the customer is a number changed in a database.
      toast({ title: "Invoice settled", description: "A receipt has been raised." });
      refreshAfterDocumentChange(queryClient);
    },
    onError: (error) =>
      toast({
        title: "Could not settle the invoice",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  return (
    <div className="space-y-3">
      <BillingBand documents={documents} currency={currency} />

      {/* Two ways to start a document is not one primary action and one
          afterthought — a quote and an invoice are peers, so they are drawn as
          peers. Colour is reserved for the single action a screen wants you to
          take, and this screen does not have one. */}
      {canCreate ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-2"
            onClick={() => setBuilder({ mode: "quotation" })}
          >
            <Plus className="size-4" />
            New quotation
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-2"
            onClick={() => setBuilder({ mode: "invoice" })}
          >
            <Plus className="size-4" />
            New invoice
          </Button>
        </div>
      ) : (
        <p className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface-muted)]/50 p-3 text-sm text-[var(--text-muted)]">
          Give this record somebody to bill — a contact name or a company — before quoting or
          invoicing.
        </p>
      )}

      {documents.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle>No documents yet</EmptyTitle>
            <EmptyDescription>
              Quotations, invoices, and receipts raised here will appear in this list.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Stack as="ul" gap="xs">
          {documents.map((doc) => {
            const status = documentStatus(doc);
            const outstanding = doc.invoice ? invoiceOutstanding(doc.invoice) : 0;
            const canPay = doc.type === "INVOICE" && outstanding > 0;
            const canConvert =
              doc.type === "QUOTATION" &&
              Boolean(doc.quotationId) &&
              status.label !== "Declined" &&
              status.label !== "Voided";

            return (
              <li key={doc.id} className="flex flex-wrap items-center gap-3 p-3">
                <KindIcon type={doc.type} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm">{documentNumber(doc)}</span>
                    <span className="text-sm text-[var(--text-muted)]">
                      {DOCUMENT_KIND_LABELS[doc.type]}
                    </span>
                    {doc.version > 1 ? (
                      <span className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 text-sm text-[var(--text-muted)]">
                        v{doc.version}
                      </span>
                    ) : null}
                    <StatusChip status={status.status} label={status.label} />
                  </div>
                  <div className="text-sm text-[var(--text-muted)]">
                    <ClientDate value={doc.createdAt} mode="date" />
                    {canPay ? ` · ${formatMoney(outstanding, doc.currency)} outstanding` : ""}
                    {doc.revisionNote ? ` · ${doc.revisionNote}` : ""}
                  </div>

                  <ApprovalFeedback approval={doc.approval} />
                </div>

                <span className="font-mono text-sm tabular-nums">
                  {formatMoney(doc.amount, doc.currency)}
                </span>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton
                      aria-label={`Actions for ${documentNumber(doc)}`}
                    >
                      <DotsThree />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-56">
                    <DropdownMenuLabel>{documentNumber(doc)}</DropdownMenuLabel>
                    <DropdownMenuItem asChild>
                      <a
                        href={`${basePath}/documents/${doc.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2"
                      >
                        <FileText />
                        View PDF
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a
                        href={`${basePath}/documents/${doc.id}/pdf?download=1`}
                        className="flex items-center gap-2"
                      >
                        <Download />
                        Download PDF
                      </a>
                    </DropdownMenuItem>

                    {doc.type !== "RECEIPT" ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="primary"
                          onClick={() => shareApproval.mutate(doc.id)}
                        >
                          <Send />
                          {doc.approval ? "Copy approval link" : "Send for approval"}
                        </DropdownMenuItem>
                        {/* Straight into whatever the reader sends mail with,
                            subject and link already written. The platform has
                            no outbound mail of its own — no provider, no
                            secret, nowhere to queue — and a menu item that
                            silently does nothing is worse than one that hands
                            off honestly. */}
                        <DropdownMenuItem
                          variant="primary"
                          onClick={() => emailToClient.mutate(doc)}
                        >
                          <Mail />
                          Email to the client
                        </DropdownMenuItem>
                      </>
                    ) : null}

                    {canConvert ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() =>
                            setBuilder({
                              mode: "invoice",
                              fromQuotationId: doc.quotationId ?? undefined,
                            })
                          }
                        >
                          <ReceiptLong />
                          Convert to invoice
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDepositFor(doc)}>
                          <Payments />
                          Request a deposit
                        </DropdownMenuItem>
                      </>
                    ) : null}

                    {canPay ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setPaymentFor(doc)}>
                          <Payments />
                          Record a part payment
                        </DropdownMenuItem>
                        {/* The whole balance, one click, receipt raised. The
                            sheet is for a part payment or a deposit — this is
                            for the invoice that has simply been settled. */}
                        <DropdownMenuItem
                          variant="positive"
                          disabled={markPaid.isPending}
                          onClick={() => markPaid.mutate(doc)}
                        >
                          <Check />
                          Settle in full ({formatMoney(outstanding, doc.currency)})
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </Stack>
      )}

      <DocumentBuilderSheet
        open={Boolean(builder)}
        onOpenChange={(next) => {
          if (!next) {
            setBuilder(null);
            setDepositLine(undefined);
            onPrefillConsumed?.();
          }
        }}
        basePath={basePath}
        mode={builder?.mode ?? "quotation"}
        currency={currency}
        fromQuotationId={builder?.fromQuotationId}
        isDeposit={builder?.deposit}
        prefillLines={
          depositLine ?? (builder?.fromQuotationId ? undefined : prefillLines)
        }
      />

      <DepositDialog
        open={Boolean(depositFor)}
        onOpenChange={(next) => (!next ? setDepositFor(null) : undefined)}
        quotation={depositFor}
        onConfirm={(line) => {
          // The deposit is a one-line invoice, so the builder opens on it
          // rather than on the whole quote.
          setDepositLine([line]);
          setBuilder({ mode: "invoice", deposit: true });
        }}
      />

      <RecordPaymentSheet
        open={Boolean(paymentFor)}
        onOpenChange={(next) => (!next ? setPaymentFor(null) : undefined)}
        basePath={basePath}
        document={paymentFor}
      />
    </div>
  );
}

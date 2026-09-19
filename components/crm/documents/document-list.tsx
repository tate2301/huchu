"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { StatusChip } from "@/components/ui/status-chip";
import { ClientDate } from "@/components/ui/client-date";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
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
  RefreshCw,
  Send,
  X,
} from "@/lib/icons";

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

type ApprovalLink = { token: string; path: string; issued: boolean };

/**
 * The link the customer clicks. Built on the host the rep is already on, so a
 * tenant reading their workspace at `acme.example.com` sends a link to the
 * same place rather than to a domain their customer cannot resolve.
 */
function approvalUrl(link: ApprovalLink): string {
  return `${window.location.origin}${link.path}`;
}

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
    // `{ token, path, issued }`, bare. `successResponse` adds no envelope of
    // its own, and declaring one here is why sharing a quote produced a link
    // ending in `/undefined` — a lie the compiler accepted, surfacing only
    // when a customer clicked it.
    //
    // `rotate` is what the menu's two actions differ by. Without it the
    // endpoint hands back the link the customer already has; with it, that
    // link stops working. Copying used to rotate, so re-reading a link to
    // forward it silently killed the copy already in the customer's inbox.
    mutationFn: ({ docId, rotate }: { docId: string; rotate?: boolean }) =>
      fetchJson<ApprovalLink>(`${basePath}/documents/${docId}/approval`, {
        method: "POST",
        body: JSON.stringify(rotate ? { rotate: true } : {}),
      }),
    onSuccess: async (result) => {
      const url = approvalUrl(result);
      const title = result.issued ? "New approval link copied" : "Approval link copied";
      try {
        await navigator.clipboard?.writeText(url);
        toast({ title, description: url });
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
   * Send the document to the client, from the platform.
   *
   * This used to open a `mailto:` draft, because there was no outbound mail to
   * send with. There is now: the server renders the PDF, attaches it, puts the
   * approval link in the body, and sends it as the company — the tenant's name
   * on the From line and their own address on Reply-To.
   *
   * The two refusals a rep can act on come back as their own messages: no
   * address on the record, and no mail provider configured.
   */
  const emailToClient = useMutation({
    mutationFn: (doc: LeadDocument) =>
      fetchJson<{ to: string; subject: string }>(
        `${basePath}/documents/${doc.id}/email`,
        { method: "POST", body: JSON.stringify({}) },
      ),
    onSuccess: (sent) => {
      toast({ title: "Sent", description: `Emailed to ${sent.to}` });
      refreshAfterDocumentChange(queryClient);
    },
    onError: (error) =>
      toast({
        title: "Could not send the email",
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
                          onClick={() => shareApproval.mutate({ docId: doc.id })}
                        >
                          <Send />
                          {doc.approval ? "Copy approval link" : "Send for approval"}
                        </DropdownMenuItem>
                        {/* Withdrawing a link is its own decision, and a
                            destructive one: whatever the customer was sent
                            stops working. It is not what copying does. */}
                        {doc.approval ? (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() =>
                              shareApproval.mutate({ docId: doc.id, rotate: true })
                            }
                          >
                            <RefreshCw />
                            Replace the link
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          variant="primary"
                          disabled={emailToClient.isPending}
                          onClick={() => emailToClient.mutate(doc)}
                        >
                          <Mail />
                          {emailToClient.isPending ? "Sending…" : "Email to the client"}
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

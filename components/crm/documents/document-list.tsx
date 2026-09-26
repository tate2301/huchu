"use client";

import Link from "next/link";

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
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Check, DotsThree, Eye, FileText, Plus, ReceiptLong, X } from "@/lib/icons";

import type { DocumentBuilderSheet } from "./document-builder-sheet";
import { BillingBand } from "./billing-band";
import { DocumentVerbMenuItems, useDocumentActions } from "./document-actions";
import {
  DOCUMENT_KIND_LABELS,
  documentHref,
  documentNumber,
  documentStatus,
  formatMoney,
  invoiceOutstanding,
  type LeadDocument,
} from "./document-types";

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
  const actions = useDocumentActions({ basePath, currency, prefillLines, onPrefillConsumed });

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
            onClick={() => actions.create("quotation")}
          >
            <Plus className="size-4" />
            New quotation
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-2"
            onClick={() => actions.create("invoice")}
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

            return (
              <li key={doc.id} className="flex flex-wrap items-center gap-3 p-3">
                <KindIcon type={doc.type} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={documentHref(doc)}
                      className="font-mono text-sm text-[var(--text-strong)] underline decoration-[var(--border)] underline-offset-2 hover:decoration-current"
                    >
                      {documentNumber(doc)}
                    </Link>
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
                    <DocumentVerbMenuItems verbs={actions.verbsFor(doc)} />
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </Stack>
      )}

      {actions.surfaces}
    </div>
  );
}

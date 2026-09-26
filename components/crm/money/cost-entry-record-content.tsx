"use client";

/**
 * One line of money, on a page of its own.
 *
 * A line is small, and its page says so: what it was and what it came to, and
 * the receipt at a size somebody can read — the reason a manager opens one is
 * to check the photo against the figure. Everything it hangs off is a link:
 * whose it was, the day it is on, the project, the requisition it came out of
 * or the invoice it was paying.
 *
 * The one thing that can be done to it is take it back out, and only by the
 * person it belongs to while the day and its requisition are still open — the
 * server says whether that holds, and the page offers nothing it would refuse.
 */

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Skeleton } from "@corelithzw/react";
import { SectionHeading, StatusDot } from "@/components/management/ui";
import { EntityLink } from "@/components/records/entity-link";
import { RecordAttributes, type RecordAttribute } from "@/components/records/record-attributes";
import { RecordPageShell, RecordRelated } from "@/components/records/record-page-shell";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Calendar, Coins, FileText, ReceiptLong, Tag, Trash2, User, Wallet, Work } from "@/lib/icons";

import { CATEGORY_LABELS, formatDate, formatMoney, type CostEntryRow } from "./money";

type Entry = CostEntryRow & {
  createdAt: string;
  requisition: { id: string; requisitionNo: string; status: string; purpose: string } | null;
  log: { logDate: string; submittedAt: string | null; user: { id: string; name: string | null } };
};

/** The section's measure. */
const WIDTH = 760;

export function CostEntryRecordContent({ entryId }: { entryId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["crm", "cost-entries", "record", entryId],
    queryFn: () =>
      fetchJson<{ entry: Entry; reportId: string | null; mayRemove: boolean }>(
        `/api/v2/crm/cost-entries/${entryId}`,
      ),
  });

  const remove = useMutation({
    mutationFn: () => fetchJson(`/api/v2/crm/cost-entries?id=${entryId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Line removed" });
      queryClient.invalidateQueries({ queryKey: ["crm", "cost-entries"] });
      queryClient.invalidateQueries({ queryKey: ["crm", "daily-log"] });
      router.push("/crm/cost-tracker");
    },
    onError: (error) =>
      toast({ title: "Could not remove the line", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton height={80} />
        <Skeleton height={320} />
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <Alert tone="danger" title="Line not found">
        {query.error ? getApiErrorMessage(query.error) : "It may have been taken out, or it is somebody else's."}
      </Alert>
    );
  }

  const { entry, reportId, mayRemove } = query.data;
  const spent = entry.direction === "SPENT";
  const day = entry.log.logDate.slice(0, 10);
  const person = entry.log.user.name ?? "Somebody";
  const dayHref = `/crm/cost-tracker?person=${entry.log.user.id}&from=${day}&to=${day}`;
  const noReceipt = spent && !entry.receiptUrl;
  const photo = entry.receiptUrl && !/\.pdf($|\?)/i.test(entry.receiptUrl);

  const attributes: RecordAttribute[] = [
    {
      id: "amount",
      label: spent ? "Spent" : "Received",
      icon: Coins,
      tone: "money",
      value: formatMoney(entry.amount, entry.currency),
    },
    { id: "category", label: "Category", icon: Tag, value: CATEGORY_LABELS[entry.category] },
    {
      id: "person",
      label: "Whose",
      icon: User,
      display: <EntityLink href={`/crm/reps/${entry.log.user.id}`}>{person}</EntityLink>,
    },
    {
      id: "day",
      label: "Day",
      icon: Calendar,
      display: <EntityLink href={reportId ? `/crm/daily-reports/${reportId}` : dayHref}>{formatDate(day)}</EntityLink>,
    },
    ...(entry.project
      ? [
          {
            id: "project",
            label: "Project",
            icon: Work,
            display: <EntityLink href={`/crm/projects/${entry.project.id}`}>{entry.project.name}</EntityLink>,
          },
        ]
      : []),
    ...(entry.requisition
      ? [
          {
            id: "requisition",
            label: "Paid from",
            icon: Wallet,
            display: (
              <EntityLink href={`/crm/requisitions/${entry.requisition.id}`}>
                {entry.requisition.requisitionNo}
              </EntityLink>
            ),
          },
        ]
      : spent
        ? [{ id: "own", label: "Paid from", icon: Wallet, value: "Their own money" }]
        : []),
    ...(entry.invoiceDocument
      ? [
          {
            id: "invoice",
            label: "Paying",
            icon: ReceiptLong,
            display: (
              <EntityLink href={`/crm/invoices/${entry.invoiceDocument.id}`}>
                {entry.invoiceDocument.invoice?.invoiceNumber ?? "The invoice"}
              </EntityLink>
            ),
          },
        ]
      : []),
    {
      id: "closed",
      label: "Day closed",
      icon: Calendar,
      tone: "code",
      value: entry.log.submittedAt ? formatDate(entry.log.submittedAt) : null,
      placeholder: "Still open",
    },
  ];

  return (
    <RecordPageShell
      icon={Coins}
      backHref="/crm/cost-tracker"
      backLabel="Cost tracker"
      title={entry.description}
      subtitle={`${spent ? "Expense" : "Income"} · ${person}`}
      // Rule 5: the band speaks only for what is missing.
      status={
        entry.notReceipted
          ? { status: "failing", label: "Not receipted" }
          : noReceipt
            ? { status: "need_changes", label: "No receipt" }
            : null
      }
      bandValue={formatMoney(entry.amount, entry.currency)}
      actions={
        mayRemove
          ? [
              {
                label: "Take the line out",
                icon: <Trash2 className="size-4" />,
                destructive: true,
                onSelect: () => remove.mutate(),
              },
            ]
          : undefined
      }
      related={
        <RecordRelated
          items={[
            { href: `/crm/reps/${entry.log.user.id}`, label: person },
            ...(entry.project ? [{ href: `/crm/projects/${entry.project.id}`, label: entry.project.name }] : []),
            ...(entry.requisition
              ? [{ href: `/crm/requisitions/${entry.requisition.id}`, label: entry.requisition.requisitionNo }]
              : []),
          ]}
        />
      }
      attributes={<RecordAttributes attributes={attributes} />}
      activeTab="receipt"
      onTabChange={() => undefined}
      tabs={[
        {
          value: "receipt",
          label: "Receipt",
          icon: FileText,
          attention: noReceipt,
          content: (
            <section aria-labelledby="entry-receipt" style={{ maxWidth: WIDTH }}>
              <SectionHeading maxWidth={WIDTH} className="mt-0">
                <span id="entry-receipt">Receipt</span>
              </SectionHeading>
              {entry.receiptUrl ? (
                photo ? (
                  <a href={entry.receiptUrl} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a stored upload of any size, shown as it is */}
                    <img
                      src={entry.receiptUrl}
                      alt={`Receipt for ${entry.description}`}
                      className="max-h-[32rem] max-w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-contain"
                    />
                  </a>
                ) : (
                  <a
                    href={entry.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-[var(--brand-strong)] underline underline-offset-2"
                  >
                    Open the receipt
                  </a>
                )
              ) : spent ? (
                <StatusDot tone="warn" label="No receipt photo on this line" />
              ) : entry.notReceipted ? (
                <StatusDot tone="danger" label="The office has not receipted this cash" />
              ) : (
                <p className="text-sm text-[var(--text-muted)]">Money received needs no receipt photo.</p>
              )}
            </section>
          ),
        },
      ]}
    />
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Button, EmptyState, Skeleton, StatCard, Stack } from "@corelithzw/react";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Textarea } from "@corelithzw/ui/components/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@corelithzw/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { formatMoney } from "../documents/document-types";
import {
  AGEING_LABELS,
  COLLECTION_OUTCOMES,
  COLLECTION_OUTCOME_LABELS,
  validateCollectionNote,
  type AgeingBucket,
} from "../../collections";

type ChaseRow = {
  documentId: string;
  invoiceNumber: string;
  currency: string;
  total: number;
  outstanding: number;
  dueDate: string | null;
  daysOverdue: number;
  bucket: AgeingBucket;
  record: { kind: "lead" | "deal"; id: string; label: string } | null;
  lastNote: {
    outcome: keyof typeof COLLECTION_OUTCOME_LABELS;
    promisedAt: string | null;
    notes: string | null;
    createdAt: string;
  } | null;
  urgency: number;
};

/**
 * The route answers this shape bare — `successResponse` adds no envelope.
 * Wrapping it in another `data` made `report` the rows array instead of the
 * report, so `report.ageing` was undefined and the page threw on open.
 */
type CollectionsResponse = {
  data: ChaseRow[];
  ageing: { bucket: AgeingBucket; label: string; count: number; amount: number }[];
  totalOutstanding: number;
};

export function CollectionsContent({ currency = "USD" }: { currency?: string }) {
  const [chasing, setChasing] = useState<ChaseRow | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-collections"],
    queryFn: () => fetchJson<CollectionsResponse>("/api/v2/crm/collections"),
  });

  const report = data;

  return (
    <div className="max-w-3xl space-y-4">
      {error ? (
        <Alert tone="danger" title="Couldn't load the chase list">
          {getApiErrorMessage(error)}
        </Alert>
      ) : null}

      {isLoading || !report ? (
        <Skeleton height={128} />
      ) : (
        <>
          {/* Two-up on a phone. Stacked, these seven ageing bands were seven
              screens of "USD 0.00" before the chase list itself came into
              view — the tiles are the summary of the list, not a page of
              their own. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard
              label="Outstanding"
              value={formatMoney(report.totalOutstanding, currency)}
              tone={report.totalOutstanding > 0 ? "warn" : "neutral"}
            />
            {report.ageing.map((band) => (
              <StatCard
                key={band.bucket}
                label={AGEING_LABELS[band.bucket]}
                value={formatMoney(band.amount, currency)}
                // Debt over 90 days is the band that turns into a write-off,
                // so it is the one the eye should land on.
                tone={band.bucket === "D90_PLUS" && band.amount > 0 ? "danger" : "neutral"}
                footer={`${band.count} invoice${band.count === 1 ? "" : "s"}`}
              />
            ))}
          </div>

          {report.data.length === 0 ? (
            <EmptyState
              title="Nothing outstanding"
              body="Everything issued has been paid."
            />
          ) : (
            <Stack as="ul" gap="xs">
              {/* One line per debt: what is owed, how late, and the chase.
                  The chase history belongs in the dialog behind the button —
                  a two-line row of it made the amounts hard to scan down. */}
              {report.data.map((row) => (
                <li
                  key={row.documentId}
                  className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 hover:bg-[var(--surface-subtle)]"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex-none font-mono text-sm">{row.invoiceNumber}</span>
                    {row.record ? (
                      <Link
                        href={`/crm/${row.record.kind === "deal" ? "deals" : "leads"}/${row.record.id}`}
                        className="min-w-0 truncate text-sm underline decoration-[var(--border)] underline-offset-2 hover:decoration-[var(--text-muted)]"
                      >
                        {row.record.label}
                      </Link>
                    ) : null}
                  </span>

                  <span className="flex-none text-sm">
                    {row.daysOverdue > 0 ? (
                      <span className="font-medium text-[var(--status-error-text)]">
                        {row.daysOverdue}d late
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">
                        Due <ClientDate value={row.dueDate} mode="date" />
                      </span>
                    )}
                  </span>

                  <span className="hidden flex-none text-sm text-[var(--text-muted)] md:inline">
                    {row.lastNote
                      ? COLLECTION_OUTCOME_LABELS[row.lastNote.outcome]
                      : "Never chased"}
                  </span>

                  <span className="flex-none font-mono text-sm tabular-nums">
                    {formatMoney(row.outstanding, row.currency)}
                  </span>

                  <Button type="button" size="sm" variant="secondary" onClick={() => setChasing(row)}>
                    Chase
                  </Button>
                </li>
              ))}
            </Stack>
          )}
        </>
      )}

      <ChaseDialog row={chasing} onOpenChange={(open) => !open && setChasing(null)} />
    </div>
  );
}

function ChaseDialog({
  row,
  onOpenChange,
}: {
  row: ChaseRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [outcome, setOutcome] =
    useState<(typeof COLLECTION_OUTCOMES)[number]>("NO_ANSWER");
  const [promisedAt, setPromisedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Normalise before comparing: `row?.documentId` is `undefined` with no row
  // while the state holds `null`, and an un-normalised guard never converges —
  // it re-runs every render and React aborts with "Too many re-renders".
  const currentDocumentId = row?.documentId ?? null;
  const [seededFor, setSeededFor] = useState<string | null>(currentDocumentId);
  if (currentDocumentId !== seededFor) {
    setSeededFor(currentDocumentId);
    setOutcome("NO_ANSWER");
    setPromisedAt("");
    setNotes("");
    setError(null);
  }

  const save = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/crm/collections", {
        method: "POST",
        body: JSON.stringify({
          documentId: row!.documentId,
          outcome,
          promisedAt: promisedAt ? new Date(promisedAt).toISOString() : null,
          notes: notes.trim() || null,
        }),
      }),
    onSuccess: () => {
      toast({
        title: "Chase logged",
        description:
          outcome === "PROMISED_TO_PAY"
            ? "A task is booked for the day they promised."
            : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["crm-collections"] });
      queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
      onOpenChange(false);
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  return (
    <Dialog open={Boolean(row)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log a chase</DialogTitle>
          <DialogDescription>
            {row ? `${row.invoiceNumber} — ${row.record?.label ?? "no record"}` : ""}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : null}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>What happened</Label>
            <Select
              value={outcome}
              onValueChange={(value) =>
                setOutcome(value as (typeof COLLECTION_OUTCOMES)[number])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLLECTION_OUTCOMES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {COLLECTION_OUTCOME_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {outcome === "PROMISED_TO_PAY" ? (
            <div className="space-y-1.5">
              <Label htmlFor="promised-at">By when *</Label>
              <Input
                id="promised-at"
                type="date"
                value={promisedAt}
                onChange={(event) => setPromisedAt(event.target.value)}
              />
              <p className="text-sm text-[var(--text-muted)]">
                A task lands on this date so somebody actually checks.
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="chase-notes">Notes</Label>
            <Textarea
              id="chase-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={save.isPending}
            onClick={() => {
              const problem = validateCollectionNote({
                outcome,
                promisedAt: promisedAt || null,
              });
              if (problem) {
                setError(problem);
                return;
              }
              setError(null);
              save.mutate();
            }}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

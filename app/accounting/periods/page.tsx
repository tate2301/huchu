"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BooksError, BooksLoading } from "@/components/books/books-state";
import { ClosePageView, type ClosingControls } from "@/components/books/close-view";
import { BooksPage } from "@/components/books/figures";
import { Button, Drawer, Field, Input, Kit, TextArea } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { CloseView } from "@/lib/books/close";

const AGAIN = "Check the connection and try again.";

type OpeningLine = { accountId: string; debit?: number; credit?: number; memo?: string };

/** Opening balances, as the lines the opening-balances API takes: `[{ accountId, debit, credit, memo }]`. */
function parseOpeningLines(raw: string): OpeningLine[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The opening balances are not valid JSON.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("The opening balances need at least one line.");
  const lines = parsed as OpeningLine[];
  const bad = lines.findIndex((line) => {
    if (!line || typeof line !== "object" || typeof line.accountId !== "string" || !line.accountId) return true;
    const debit = Number(line.debit ?? 0);
    const credit = Number(line.credit ?? 0);
    return !Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0;
  });
  if (bad >= 0) throw new Error(`Opening balance line ${bad + 1} needs an account and amounts of zero or more.`);
  return lines;
}

function OpenPeriodDrawer({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; onDone: () => void }) {
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [opening, setOpening] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!open) return;
    const now = new Date();
    setStart(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10));
    setEnd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10));
    setOpening("");
    setError(null);
  }, [open]);
  const save = useMutation({
    mutationFn: async () => {
      // Read before anything is written: a period opened without the balances it was meant to carry is worse than neither.
      const lines = opening.trim() ? parseOpeningLines(opening.trim()) : null;
      await fetchJson("/api/accounting/periods", { method: "POST", body: JSON.stringify({ startDate: start, endDate: end }) });
      if (lines) {
        await fetchJson("/api/accounting/closing/opening-balances", { method: "POST", body: JSON.stringify({ effectiveDate: start, lines }) });
      }
    },
    onSuccess: () => {
      onDone();
      onOpenChange(false);
    },
    onError: (failure) => setError(getApiErrorMessage(failure, AGAIN)),
  });
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Open a period"
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" shortcut="Ctrl ↵" busy={save.isPending} disabled={!start || !end || save.isPending} onClick={() => save.mutate()}>
            Open it
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Opens" htmlFor="period-start">
            <Input id="period-start" type="date" value={start} onChange={(event) => setStart(event.target.value)} />
          </Field>
          <Field label="Closes" htmlFor="period-end">
            <Input id="period-end" type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
          </Field>
        </div>
        <Field
          label="Opening balances"
          optional
          htmlFor="period-opening"
          error={error}
          help='For the first period only: one line per account, as [{"accountId": "…", "debit": 0, "credit": 0}].'
        >
          <TextArea id="period-opening" rows={5} value={opening} onChange={(event) => setOpening(event.target.value)} />
        </Field>
      </div>
    </Drawer>
  );
}

function ReopenDrawer({ periodId, onOpenChange, onDone }: { periodId: string | null; onOpenChange: (open: boolean) => void; onDone: () => void }) {
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setReason("");
    setError(null);
  }, [periodId]);
  const reopen = useMutation({
    mutationFn: () => fetchJson("/api/accounting/closing/period-reopen", { method: "POST", body: JSON.stringify({ periodId, reason: reason.trim() }) }),
    onSuccess: () => {
      onDone();
      onOpenChange(false);
    },
    onError: (failure) => setError(getApiErrorMessage(failure, AGAIN)),
  });
  return (
    <Drawer
      open={Boolean(periodId)}
      onOpenChange={onOpenChange}
      title="Reopen the period"
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" shortcut="Ctrl ↵" busy={reopen.isPending} disabled={reason.trim().length < 3 || reopen.isPending} onClick={() => reopen.mutate()}>
            Reopen it
          </Button>
        </>
      }
    >
      <div style={{ padding: "16px 24px" }}>
        <Field label="Why it reopens" htmlFor="reopen-reason" error={error} help="Reopening reverses the close voucher. The reason stays on the period.">
          <Input id="reopen-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </Drawer>
  );
}

/** Books → Periods and the close (design/core-modules/boards/view/PageBooksClose.html). */
export default function PeriodsPage() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [opening, setOpening] = React.useState(false);
  const [reopening, setReopening] = React.useState<string | null>(null);
  const close = useQuery({ queryKey: ["books", "close"], queryFn: () => fetchJson<CloseView>("/api/books/close") });
  const refresh = () => client.invalidateQueries({ queryKey: ["books"] });

  const closeMonth = useMutation({
    mutationFn: () =>
      fetchJson("/api/accounting/closing/period-close", {
        method: "POST",
        body: JSON.stringify({ periodId: close.data?.closing?.id, notes: `Closed from Periods` }),
      }),
    onSuccess: () => {
      toast({ title: `${close.data?.closing?.month} closed` });
      refresh();
    },
    onError: (error) => toast({ title: "The month did not close", description: getApiErrorMessage(error, AGAIN), variant: "destructive" }),
  });
  const replay = useMutation({
    mutationFn: () => fetchJson<{ posted?: number }>("/api/accounting/integration/replay", { method: "POST", body: "{}" }),
    onSuccess: () => {
      toast({ title: "Tried the failed postings again" });
      refresh();
    },
    onError: (error) => toast({ title: "The postings did not go", description: getApiErrorMessage(error, AGAIN), variant: "destructive" }),
  });
  const save = useMutation({
    mutationFn: (controls: ClosingControls) =>
      fetchJson("/api/accounting/closing/freeze", {
        method: "POST",
        body: JSON.stringify({
          freezeBeforeDate: controls.freezeBeforeDate || null,
          periodLockPolicy: controls.policy,
          retainedEarningsAccountId: controls.retainedEarningsAccountId || null,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Closing controls saved" });
      refresh();
    },
    onError: (error) => toast({ title: "The controls were not saved", description: getApiErrorMessage(error, AGAIN), variant: "destructive" }),
  });

  return (
    <>
      <PageChrome title="Periods">
        <Kit contents>
          <Button onClick={() => setOpening(true)}>Open a period</Button>
        </Kit>
      </PageChrome>
      <BooksPage screen="books-close">
        {close.data ? (
          <ClosePageView
            key={JSON.stringify(close.data.controls)}
            data={close.data}
            closing={closeMonth.isPending}
            saving={save.isPending}
            onClose={() => closeMonth.mutate()}
            onReplay={() => replay.mutate()}
            onReopen={setReopening}
            onSaveControls={(controls) => save.mutate(controls)}
          />
        ) : close.isError ? (
          <BooksError what="Periods" onRetry={() => close.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <OpenPeriodDrawer open={opening} onOpenChange={setOpening} onDone={refresh} />
      <ReopenDrawer periodId={reopening} onOpenChange={(open) => !open && setReopening(null)} onDone={refresh} />
    </>
  );
}

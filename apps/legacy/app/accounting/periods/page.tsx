"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { endOfMonth, format, isSameDay, startOfMonth } from "date-fns";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ReportPanel } from "@/components/ui/breakdown-panel";
import {
  ReportTable,
  badge,
  nm,
  node,
  txt,
  type ReportRow,
} from "@/components/accounting/report-table";
import { BandChip } from "@/components/accounting/band-chip";
import {
  PeriodCloseChecklist,
  type ChecklistItem,
} from "@/components/accounting/period-close-checklist";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  closeAccountingPeriod,
  reopenAccountingPeriod,
  type AccountingPeriodRecord,
  fetchAccountingPeriods,
  fetchAccountingSummary,
  fetchFinancialReportsHubSummary,
  fetchChartOfAccounts,
  importOpeningBalances,
  setAccountingFreezeDate,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Calendar, MoreHorizontal } from "@/lib/icons";
import { AccountingNewButton } from "@/components/accounting/accounting-new-button";

type OpeningBalanceLineInput = {
  accountId: string;
  debit?: number;
  credit?: number;
  memo?: string;
};

function parseOpeningBalanceLines(raw: string): OpeningBalanceLineInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Opening lines must be valid JSON.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Opening lines must be a non-empty array.");
  }

  const lines = parsed as OpeningBalanceLineInput[];
  const invalidLineIndex = lines.findIndex((line) => {
    if (!line || typeof line !== "object") return true;
    if (!line.accountId || typeof line.accountId !== "string") return true;
    const debit = Number(line.debit ?? 0);
    const credit = Number(line.credit ?? 0);
    if (!Number.isFinite(debit) || !Number.isFinite(credit)) return true;
    return debit < 0 || credit < 0;
  });

  if (invalidLineIndex >= 0) {
    throw new Error(`Opening line ${invalidLineIndex + 1} is invalid.`);
  }

  return lines;
}

/**
 * What to call a period in the table's first column.
 *
 * The record carries two dates and no name, so the name is derived rather than
 * stored. A window that runs from the first of a month to its last day is that
 * month and nothing else — "August 2026" is how everyone in the building refers
 * to it. Anything else keeps its dates, because calling a 6 Aug – 12 Sep window
 * "August" would be a claim about the books that is simply untrue.
 */
function periodLabel(period: AccountingPeriodRecord): string {
  const start = new Date(period.startDate);
  const end = new Date(period.endDate);

  if (isSameDay(start, startOfMonth(start)) && isSameDay(end, endOfMonth(start))) {
    return format(start, "MMMM yyyy");
  }

  return `${format(start, "d MMM yyyy")} – ${format(end, "d MMM yyyy")}`;
}

export default function AccountingPeriodsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const openingDateRef = useRef<HTMLInputElement>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [freezeBeforeDate, setFreezeBeforeDate] = useState("");
  const [retainedEarningsAccountId, setRetainedEarningsAccountId] = useState("");
  const [openingReference, setOpeningReference] = useState("");
  const [openingLinesJson, setOpeningLinesJson] = useState("");

  const {
    data: periodsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["accounting", "periods"],
    queryFn: () => fetchAccountingPeriods({ limit: 200 }),
  });
  const { data: financialSummary } = useQuery({
    queryKey: ["accounting", "hubs", "financial-reports", "periods"],
    queryFn: () => fetchFinancialReportsHubSummary({}),
  });

  const { data: accountingSummary } = useQuery({
    queryKey: ["accounting-summary"],
    queryFn: fetchAccountingSummary,
  });
  const { data: accountsData } = useQuery({
    queryKey: ["accounting", "chart-of-accounts", "close-controls"],
    queryFn: () => fetchChartOfAccounts({ limit: 200 }),
  });

  const periods = useMemo(() => periodsData?.data ?? [], [periodsData]);
  const accounts = useMemo(() => accountsData?.data ?? [], [accountsData]);
  const effectiveRetainedEarningsAccountId =
    retainedEarningsAccountId || accountingSummary?.retainedEarningsAccountId || "";
  const effectiveFreezeBeforeDate =
    freezeBeforeDate || accountingSummary?.freezeBeforeDate?.slice(0, 10) || "";

  const openPeriodMutation = useMutation({
    mutationFn: async () => {
      if (!startDate || !endDate) {
        throw new Error("Opening and closing dates are both required.");
      }

      // Parsed before anything is written. Opening a period and posting its
      // opening balances are two calls, and discovering the JSON is malformed
      // after the first one has succeeded leaves a period on the books that
      // nobody asked for on its own.
      const raw = openingLinesJson.trim();
      const lines = raw && raw !== "[]" ? parseOpeningBalanceLines(raw) : null;

      await fetchJson("/api/accounting/periods", {
        method: "POST",
        body: JSON.stringify({ startDate, endDate }),
      });

      if (lines) {
        await importOpeningBalances({
          effectiveDate: startDate,
          sourceReference: openingReference || undefined,
          lines,
        });
      }
    },
    onSuccess: () => {
      toast({
        title: "Period opened",
        description: "Accounting period opened successfully.",
        variant: "success",
      });
      setStartDate("");
      setEndDate("");
      setOpeningReference("");
      setOpeningLinesJson("");
      queryClient.invalidateQueries({ queryKey: ["accounting", "periods"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-summary"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to open period",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!effectiveRetainedEarningsAccountId) {
        throw new Error("Select a retained earnings account before closing a period.");
      }
      return closeAccountingPeriod({
        periodId: id,
        retainedEarningsAccountId: effectiveRetainedEarningsAccountId,
        notes: "Closed from Accounting Periods",
      });
    },
    onSuccess: () => {
      toast({
        title: "Period closed",
        description: "Accounting period closed with a period-close voucher.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "periods"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-summary"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to close period",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });
  const reopenMutation = useMutation({
    mutationFn: async (payload: { id: string; reason: string }) =>
      reopenAccountingPeriod({
        periodId: payload.id,
        reason: payload.reason,
      }),
    onSuccess: () => {
      toast({
        title: "Period reopened",
        description: "The period was reopened and the previous close voucher was reversed.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "periods"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-summary"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to reopen period",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });
  const freezeMutation = useMutation({
    mutationFn: async () => setAccountingFreezeDate(effectiveFreezeBeforeDate || null),
    onSuccess: () => {
      toast({
        title: "Closing controls saved",
        description: "Posting freeze date has been saved.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting-summary"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to save closing controls",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  /**
   * The close gates, built from the same summary the overview reads.
   *
   * Trial balance is checked with a rounded comparison, not `===`. Debits and
   * credits arrive as floats, and an unrounded equality test reports a
   * perfectly balanced ledger as failing over 1e-13 — which is exactly the
   * kind of false blocker that makes people stop trusting a checklist.
   */
  const checklist = useMemo<ChecklistItem[]>(() => {
    const drafts = accountingSummary?.draftJournals ?? 0;
    const posted = accountingSummary?.postedJournals ?? 0;
    const fiscal = accountingSummary?.pendingFiscalReceipts ?? 0;
    const vat = accountingSummary?.pendingVatReturns ?? 0;
    const failed = accountingSummary?.failedIntegrationEvents ?? 0;

    const debit = financialSummary?.kpis.totalDebit ?? 0;
    const credit = financialSummary?.kpis.totalCredit ?? 0;
    const difference = Math.round((debit - credit) * 100) / 100;

    return [
      {
        label: "All journals posted",
        done: drafts === 0,
        note: drafts === 0 ? `${posted} of ${posted}` : `${drafts} in draft`,
        href: "/accounting/journals",
      },
      {
        label: "VAT return prepared",
        done: vat === 0,
        note: vat === 0 ? "filed" : `${vat} to file`,
        href: "/accounting/tax?view=vat-returns",
      },
      {
        label: "Receipts fiscalised",
        done: fiscal === 0,
        note: fiscal === 0 ? "all sent" : `${fiscal} pending`,
        href: "/accounting/fiscalisation",
      },
      {
        label: "Trial balance agrees",
        done: difference === 0,
        note: difference === 0 ? "balanced" : `out by ${Math.abs(difference).toFixed(2)}`,
        href: "/accounting/trial-balance",
      },
      {
        label: "Every posting reached the ledger",
        done: failed === 0,
        note: failed === 0 ? "none failed" : `${failed} failed`,
        href: "/accounting/posting-rules?view=failures",
      },
    ];
  }, [accountingSummary, financialSummary]);

  const blockingCount = checklist.filter((item) => !item.done).length;

  /**
   * The period people are posting into.
   *
   * The earliest open period rather than the latest — if two are open, work
   * lands in the older one first, and naming the newer would describe a period
   * nobody is using yet.
   */
  const openPeriod = useMemo(() => {
    const open = periods
      .filter((period) => period.status === "OPEN")
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    return open[0] ?? null;
  }, [periods]);

  const openPeriodLabel = openPeriod ? format(new Date(openPeriod.startDate), "MMM yyyy") : "none";

  const periodRows = useMemo<ReportRow[]>(
    () =>
      periods.map((period) => {
        const label = periodLabel(period);
        // One chip, not two. A reopened period is open again, and stacking a
        // second "Reopened" badge beside "OPEN" made the row read as two
        // states at once; the reopening is the fact worth flagging, so it
        // takes the chip and the warn tint with it.
        const status = period.reopenedAt
          ? badge("Reopened", "warn")
          : period.status === "OPEN"
            ? badge("Open", "ok")
            : badge("Closed", "mute");

        return {
          id: period.id,
          cells: [
            nm(label),
            txt(format(new Date(period.startDate), "d MMM yyyy"), { mono: true }),
            txt(format(new Date(period.endDate), "d MMM yyyy"), { mono: true }),
            status,
            node(
              <div className="flex justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label={`Actions for ${label}`}
                    >
                      <MoreHorizontal className="size-4 text-[var(--gray-400)]" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[13rem]">
                    {period.status === "OPEN" ? (
                      <DropdownMenuItem onSelect={() => closeMutation.mutate(period.id)}>
                        Close with voucher
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onSelect={() => {
                          const reason = window.prompt(
                            "Why are you reopening this accounting period?",
                          );
                          if (!reason?.trim()) return;
                          reopenMutation.mutate({ id: period.id, reason: reason.trim() });
                        }}
                      >
                        Reopen period
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>,
            ),
          ],
        };
      }),
    [periods, closeMutation, reopenMutation],
  );

  return (
    <AccountingShell
      activeTab="periods"
      title="Periods"
      description="what is open, what is closed, and what closing still needs"
      bandSlot={
        <>
          <BandChip label="Open" value={openPeriodLabel} tone="ok" />
          {blockingCount > 0 ? (
            <BandChip label="Blocking" value={String(blockingCount)} tone="bad" />
          ) : (
            <BandChip label="Blocking" value="0" tone="ok" />
          )}
        </>
      }
      actions={
        <AccountingNewButton
          items={[
            {
              label: "Open period",
              icon: Calendar,
              // The form is on the page rather than behind an overlay, so the
              // app bar's job is to take you to it, not to open a second copy
              // of it.
              onClick: () => {
                openingDateRef.current?.scrollIntoView({ block: "center" });
                openingDateRef.current?.focus();
              },
            },
          ]}
        />
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load accounting periods</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      {/*
        The ledger on the left, the controls that change it on the right.

        The right column is sticky because everything in it acts on the table
        beside it — you read a row, then close it, open the next one, or check
        what is still blocking. Scrolling eight months of periods should not
        take the close checklist off the screen.
      */}
      <div className="grid items-start gap-2.5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <ReportPanel title="Periods" note="a closed period refuses new postings">
          <ReportTable
            label="Accounting periods"
            tracks="minmax(0,1fr) 120px 120px 110px 44px"
            columns={[
              { label: "Period" },
              { label: "Opens" },
              { label: "Closes" },
              { label: "Status" },
              { label: "" },
            ]}
            rows={periodRows}
            emptyLabel={isLoading ? "Loading periods…" : "No accounting periods yet."}
          />
        </ReportPanel>

        <div className="flex flex-col gap-2.5 xl:sticky xl:top-[calc(var(--page-band-h)+12px)]">
          <ReportPanel
            title="Open an accounting period"
            lead={
              <span className="acct-badge" data-tone="ok">
                NEW
              </span>
            }
          >
            <form
              className="grid grid-cols-2 gap-x-3 gap-y-[11px] px-[13px] pb-[13px] pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                openPeriodMutation.mutate();
              }}
            >
              <div className="min-w-0">
                <label className="acct-field-label" htmlFor="period-opening-date">
                  Opening date *
                </label>
                <Input
                  id="period-opening-date"
                  ref={openingDateRef}
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  required
                />
              </div>
              <div className="min-w-0">
                <label className="acct-field-label" htmlFor="period-closing-date">
                  Closing date *
                </label>
                <Input
                  id="period-closing-date"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  required
                />
              </div>
              <div className="col-span-2 min-w-0">
                <label className="acct-field-label" htmlFor="period-source-reference">
                  Source reference
                </label>
                <Input
                  id="period-source-reference"
                  value={openingReference}
                  onChange={(event) => setOpeningReference(event.target.value)}
                  placeholder="Source reference (optional)"
                />
              </div>
              <div className="col-span-2 min-w-0">
                <label className="acct-field-label" htmlFor="period-opening-lines">
                  Opening lines JSON
                </label>
                <Textarea
                  id="period-opening-lines"
                  value={openingLinesJson}
                  onChange={(event) => setOpeningLinesJson(event.target.value)}
                  className="font-mono"
                  style={{ minHeight: 56 }}
                  placeholder='[{ "accountId": "…", "debit": 0, "credit": 0 }]'
                />
                <p className="acct-caption mt-1">
                  opening balances to post on the first day — leave empty to carry forward from
                  the prior close
                </p>
              </div>
              <div className="col-span-2">
                <Button type="submit" className="w-full" disabled={openPeriodMutation.isPending}>
                  Open period
                </Button>
              </div>
            </form>
          </ReportPanel>

          <ReportPanel title="Closing controls" note={openPeriodLabel}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-[11px] px-[13px] pb-[13px] pt-3">
              <div className="col-span-2 min-w-0">
                <label className="acct-field-label">Retained earnings account</label>
                <Select
                  value={effectiveRetainedEarningsAccountId}
                  onValueChange={setRetainedEarningsAccountId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Retained earnings account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="acct-caption mt-1">
                  where the year rolls into on close — applied by the close itself, not stored
                  with the freeze date
                </p>
              </div>
              <div className="col-span-2 min-w-0">
                <label className="acct-field-label" htmlFor="period-freeze-date">
                  Freeze postings before
                </label>
                <Input
                  id="period-freeze-date"
                  type="date"
                  value={effectiveFreezeBeforeDate}
                  onChange={(event) => setFreezeBeforeDate(event.target.value)}
                />
                <p className="acct-caption mt-1">
                  nothing may be posted on or before this date, open period or not
                </p>
              </div>
            </div>
            <div className="px-[13px] pb-[13px]">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => freezeMutation.mutate()}
                disabled={freezeMutation.isPending}
              >
                Save controls
              </Button>
            </div>
          </ReportPanel>

          <PeriodCloseChecklist
            items={checklist}
            closeAction={
              openPeriod
                ? {
                    label: `Close ${periodLabel(openPeriod)}`,
                    pending: closeMutation.isPending,
                    onClick: () => closeMutation.mutate(openPeriod.id),
                  }
                : undefined
            }
          />
        </div>
      </div>
    </AccountingShell>
  );
}

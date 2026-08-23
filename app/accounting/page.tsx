"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { MetricTile } from "@/components/accounting/hubs/metric-tile";
import { ReportPanel } from "@/components/ui/breakdown-panel";
import { BandChip } from "@/components/accounting/band-chip";
import {
  ReportTable,
  amt,
  badge,
  dim,
  nm,
  num,
  txt,
  type ReportRow,
} from "@/components/accounting/report-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchAccountingSummary,
  fetchFinancialReportsHubSummary,
  fetchJournalEntries,
  fetchPayablesHubSummary,
  fetchReceivablesHubSummary,
  fetchSites,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { AccountingSeedPackResult } from "@/lib/api";
import {
  Coins,
  MoreHorizontal,
  Package,
  Payments,
  Plus,
  ReceiptLong,
  RefreshCcw,
} from "@/lib/icons";

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Ink for the period panel's figures — the badge palette, so it agrees with
 *  the status chips in the journals table beside it. */
const PERIOD_INK: Record<string, string> = {
  strong: "var(--text-strong)",
  warn: "var(--badge-warn-fg)",
  ok: "var(--badge-ok-fg)",
  muted: "var(--text-subtle)",
};



// ── Initialize wizard ─────────────────────────────────────────────────────────

function InitializeWizardDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"confirm" | "running" | "done">("confirm");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => fetchJson("/api/accounting/setup", { method: "POST" }),
    onMutate: () => { setStep("running"); setError(null); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounting-summary"] });
      setStep("done");
    },
    onError: (err) => {
      setError(getApiErrorMessage(err));
      setStep("confirm");
    },
  });

  function handleClose(open: boolean) {
    if (!open) { setStep("confirm"); setError(null); }
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Initialize Accounting Defaults</DialogTitle>
          <DialogDescription>
            Sets up the core accounting configuration for your company — tax categories, default periods, and system accounts.
          </DialogDescription>
        </DialogHeader>

        {step === "confirm" && (
          <div className="space-y-4 pt-1">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {["Default tax categories", "Opening accounting period", "System control accounts", "Base posting configuration"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="size-1.5 shrink-0 rounded-full bg-[var(--action-primary-bg)]" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => handleClose(false)}>Cancel</Button>
              <Button size="sm" onClick={() => mutation.mutate()}>
                <RefreshCcw className="mr-1.5 size-3.5" />
                Initialize
              </Button>
            </div>
          </div>
        )}

        {step === "running" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <RefreshCcw className="size-6 animate-spin text-[var(--action-primary-bg)]" />
            <p className="text-sm text-muted-foreground">Setting up defaults…</p>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">Accounting defaults have been initialized successfully.</p>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => handleClose(false)}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Foundation Pack wizard ────────────────────────────────────────────────────

const PACK_LABELS: [string, keyof AccountingSeedPackResult, keyof AccountingSeedPackResult["preview"]][] = [
  ["Accounts", "createdAccounts", "missingAccounts"],
  ["Tax codes", "createdTaxCodes", "missingTaxCodes"],
  ["Tax categories", "createdTaxCategories", "missingTaxCategories"],
  ["Posting rules", "createdPostingRules", "missingPostingRules"],
  ["Tender mappings", "createdTenderMappings", "missingTenderMappings"],
  ["Currencies", "createdCurrencyDefinitions", "missingCurrencies"],
];

function FoundationPackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<AccountingSeedPackResult | null>(null);
  const [step, setStep] = useState<"intro" | "preview" | "apply" | "done">("intro");

  const previewMutation = useMutation({
    mutationFn: () =>
      fetchJson<AccountingSeedPackResult>("/api/accounting/setup/seed-pack", {
        method: "POST",
        body: JSON.stringify({ mode: "DRY_RUN" }),
      }),
    onMutate: () => setStep("preview"),
    onSuccess: (data) => { setPreview(data); },
    onError: () => setStep("intro"),
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      fetchJson<AccountingSeedPackResult>("/api/accounting/setup/seed-pack", {
        method: "POST",
        body: JSON.stringify({ mode: "APPLY" }),
      }),
    onSuccess: (data) => {
      setPreview(data);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["accounting-summary"] });
    },
  });

  function handleClose(open: boolean) {
    if (!open) { setStep("intro"); setPreview(null); }
    onOpenChange(open);
  }

  const previewError = previewMutation.isError ? getApiErrorMessage(previewMutation.error) : null;
  const applyError = applyMutation.isError ? getApiErrorMessage(applyMutation.error) : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Foundation Pack</DialogTitle>
          <DialogDescription>
            Seeds chart of accounts, tax codes, posting rules, and periods from the standard pack.
          </DialogDescription>
        </DialogHeader>

        {step === "intro" && (
          <div className="space-y-4 pt-1">
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {["Standard chart of accounts", "Default tax codes & categories", "Automated posting rules", "Tender account mappings", "Base currencies", "Accounting periods"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="size-1.5 shrink-0 rounded-full bg-[var(--action-primary-bg)]" />
                  {item}
                </li>
              ))}
            </ul>
            {previewError && <p className="text-sm text-destructive">{previewError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => handleClose(false)}>Cancel</Button>
              <Button size="sm" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
                {previewMutation.isPending ? "Checking…" : "Preview changes"}
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4 pt-1">
            {previewMutation.isPending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCcw className="size-4 animate-spin" />
                Analyzing current state…
              </div>
            ) : preview ? (
              <>
                <div className="rounded-[var(--radius-md)] border bg-[var(--surface-muted)] p-3 text-sm">
                  <p className="mb-2 font-medium text-foreground">What will be created</p>
                  <ul className="space-y-1">
                    {PACK_LABELS.map(([label, , missingKey]) => {
                      const missing = preview.preview[missingKey] as unknown[];
                      if (missing.length === 0) return null;
                      return (
                        <li key={label} className="flex justify-between text-muted-foreground">
                          <span>{label}</span>
                          <span className="font-medium text-foreground">{missing.length} missing</span>
                        </li>
                      );
                    })}
                    <li className="flex justify-between text-muted-foreground">
                      <span>Periods</span>
                      <span className="font-medium text-foreground">auto-generated</span>
                    </li>
                  </ul>
                </div>
                {applyError && <p className="text-sm text-destructive">{applyError}</p>}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep("intro")}>Back</Button>
                  <Button
                    size="sm"
                    onClick={() => { setStep("apply"); applyMutation.mutate(); }}
                    disabled={applyMutation.isPending}
                  >
                    Apply Foundation Pack
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        )}

        {step === "apply" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <RefreshCcw className="size-6 animate-spin text-[var(--action-primary-bg)]" />
            <p className="text-sm text-muted-foreground">Applying foundation pack…</p>
          </div>
        )}

        {step === "done" && preview && (
          <div className="space-y-4 pt-1">
            <div className="rounded-[var(--radius-md)] border bg-[var(--surface-muted)] p-3 text-sm">
              <p className="mb-2 font-medium text-foreground">Applied successfully</p>
              <ul className="space-y-1">
                {PACK_LABELS.map(([label, createdKey]) => {
                  const count = preview[createdKey] as number;
                  if (!count) return null;
                  return (
                    <li key={label} className="flex justify-between text-muted-foreground">
                      <span>{label}</span>
                      <span className="font-medium text-foreground">{count} created</span>
                    </li>
                  );
                })}
                {preview.createdPeriods > 0 && (
                  <li className="flex justify-between text-muted-foreground">
                    <span>Periods</span>
                    <span className="font-medium text-foreground">{preview.createdPeriods} created</span>
                  </li>
                )}
              </ul>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => handleClose(false)}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


// ── Page ─────────────────────────────────────────────────────────────────────

export default function AccountingOverviewPage() {
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [branchId, setBranchId] = useState("all");
  const [initOpen, setInitOpen] = useState(false);
  const [foundationOpen, setFoundationOpen] = useState(false);

  const { data: branches } = useQuery({
    queryKey: ["sites", "accounting-branches"],
    queryFn: fetchSites,
  });

  const { data: accountingSummary, error: accountingSummaryError } = useQuery({
    queryKey: ["accounting-summary"],
    queryFn: fetchAccountingSummary,
  });

  const { data: receivablesSummary, isLoading: receivablesLoading, error: receivablesError } = useQuery({
    queryKey: ["accounting", "hubs", "receivables", startDate, endDate, branchId],
    queryFn: () =>
      fetchReceivablesHubSummary({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        branchId: branchId === "all" ? undefined : branchId,
      }),
  });

  const { data: payablesSummary, isLoading: payablesLoading, error: payablesError } = useQuery({
    queryKey: ["accounting", "hubs", "payables", startDate, endDate, branchId],
    queryFn: () =>
      fetchPayablesHubSummary({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        branchId: branchId === "all" ? undefined : branchId,
      }),
  });

  const { data: financialSummary, isLoading: financialLoading, error: financialError } = useQuery({
    queryKey: ["accounting", "hubs", "financial-reports", startDate, endDate, branchId],
    queryFn: () =>
      fetchFinancialReportsHubSummary({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        branchId: branchId === "all" ? undefined : branchId,
      }),
  });

  /**
   * The trial balance by statement section. Assets and expenses carry debit
   * balances, the rest carry credits, and a section only ever shows a figure on
   * its own side — so the two columns stay readable as columns rather than as a
   * grid of paired zeroes.
   */
  const totalDebit = financialSummary?.kpis.totalDebit ?? 0;
  const totalCredit = financialSummary?.kpis.totalCredit ?? 0;
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005;

  const trialBalanceRows = useMemo<ReportRow[]>(() => {
    const k = financialSummary?.kpis;
    /*
      An empty side is a dash, never a zero. Nil and "does not apply on this
      side" are different facts about an account section, and a column of 0.00
      hides both — assets simply do not have a credit balance, and printing one
      invites the reader to check an arithmetic that was never there.
    */
    const line = (label: string, debit: number | null, credit: number | null): ReportRow => ({
      id: label,
      cells: [
        nm(label),
        debit === null ? dim() : amt(formatCurrency(debit)),
        credit === null ? dim() : amt(formatCurrency(credit)),
      ],
    });
    return [
      line("Assets", k?.assets ?? 0, null),
      line("Liabilities", null, k?.liabilities ?? 0),
      line("Equity", null, k?.equity ?? 0),
      line("Income", null, k?.income ?? 0),
      line("Expenses", Math.abs(k?.expenses ?? 0), null),
      {
        id: "total",
        emphasis: true,
        cells: [
          nm("Total", { tone: balanced ? "total" : "bad" }),
          amt(formatCurrency(totalDebit), { tone: balanced ? "total" : "bad" }),
          amt(formatCurrency(totalCredit), { tone: balanced ? "total" : "bad" }),
        ],
      },
    ];
  }, [financialSummary, totalDebit, totalCredit, balanced]);

  /**
   * Everything standing between today and a closed period, each row linking to
   * the page that clears it. Only real blockers appear: a zero count is not a
   * reassurance worth a row, it is a row you have to read to learn says nothing.
   */
  const blockers = useMemo(() => {
    const rows: Array<{
      label: string;
      where: string;
      href: string;
      count: number;
      value?: string;
      urgent?: boolean;
    }> = [];
    const push = (row: (typeof rows)[number]) => {
      if (row.count > 0) rows.push(row);
    };

    push({
      label: "Journals still in draft",
      where: "Journals",
      href: "/accounting/journals",
      count: accountingSummary?.draftJournals ?? 0,
    });
    push({
      label: "Invoices open",
      where: "Receivables",
      href: "/accounting/sales",
      count: accountingSummary?.openInvoices ?? 0,
      value: formatCurrency(receivablesSummary?.kpis.overdueBalance ?? 0),
      urgent: (receivablesSummary?.kpis.overdueBalance ?? 0) > 0,
    });
    push({
      label: "Bills open",
      where: "Payables",
      href: "/accounting/purchases",
      count: accountingSummary?.openBills ?? 0,
      value: formatCurrency(payablesSummary?.kpis.overdueBalance ?? 0),
      urgent: (payablesSummary?.kpis.overdueBalance ?? 0) > 0,
    });
    push({
      label: "Receipts not fiscalised",
      where: "Fiscalisation",
      href: "/accounting/fiscalisation",
      count: accountingSummary?.pendingFiscalReceipts ?? 0,
      urgent: true,
    });
    push({
      label: "VAT returns to file",
      where: "Tax",
      href: "/accounting/tax?view=vat-returns",
      count: accountingSummary?.pendingVatReturns ?? 0,
    });
    push({
      label: "Postings that never reached the ledger",
      where: "Posting Rules",
      href: "/accounting/posting-rules",
      count: accountingSummary?.failedIntegrationEvents ?? 0,
      urgent: true,
    });

    return rows;
  }, [accountingSummary, receivablesSummary, payablesSummary]);

  /** The blockers as table rows. Urgent counts take the danger ink. */
  const blockerRows = useMemo<ReportRow[]>(
    () =>
      blockers.map((item) => ({
        id: item.label,
        href: item.href,
        cells: [
          nm(item.label),
          txt(item.where, { tone: "subtle" }),
          num(item.count.toLocaleString(), item.urgent ? { tone: "bad", bold: true } : {}),
          item.value
            ? amt(item.value, item.urgent ? { tone: "bad" } : {})
            : dim(),
        ],
      })),
    [blockers],
  );

  /**
   * The last six journals.
   *
   * The design shows a `Source` column — Payroll, Fixed assets, Manual. The
   * journal record carries no such field, so the column is `Date` instead
   * rather than a guess dressed up as provenance. Worth adding to the API
   * later; not worth inventing here.
   */
  const { data: recentJournals } = useQuery({
    queryKey: ["accounting", "journals", "recent"],
    queryFn: () => fetchJournalEntries({ limit: 6, page: 1 }),
  });

  const recentJournalRows = useMemo<ReportRow[]>(
    () =>
      (recentJournals?.data ?? []).map((entry) => ({
        id: entry.id,
        href: `/accounting/journals?entry=${entry.id}`,
        cells: [
          txt(`JE-${entry.entryNumber}`, { mono: true, tone: "strong" }),
          nm(entry.description || "No memo"),
          txt(new Date(entry.entryDate).toLocaleDateString(), { tone: "subtle" }),
          badge(
            entry.status === "POSTED" ? "Posted" : "Draft",
            entry.status === "POSTED" ? "ok" : "warn",
            { align: "right" },
          ),
        ],
      })),
    [recentJournals],
  );

  const periodFacts = useMemo<
    Array<{ label: string; value: string; tone?: "strong" | "warn" | "ok" | "muted" }>
  >(
    () => [
      {
        label: "Open periods",
        value: String(accountingSummary?.openPeriods ?? 0),
        tone: (accountingSummary?.openPeriods ?? 0) > 0 ? "ok" : "muted",
      },
      { label: "Posted journals", value: String(accountingSummary?.postedJournals ?? 0) },
      {
        label: "In draft",
        value: String(accountingSummary?.draftJournals ?? 0),
        tone: (accountingSummary?.draftJournals ?? 0) > 0 ? "warn" : "muted",
      },
      {
        label: "Frozen before",
        value: accountingSummary?.freezeBeforeDate
          ? new Date(accountingSummary.freezeBeforeDate).toLocaleDateString()
          : "not set",
        tone: accountingSummary?.freezeBeforeDate ? "strong" : "muted",
      },
    ],
    [accountingSummary],
  );

  /**
   * The period panel's qualifier — "FY2026 · August" in the design.
   *
   * Derived from the summary's own period window rather than from today's
   * date, so a workspace still posting into last month is described by the
   * books rather than by the calendar on the wall.
   */
  const periodNote = useMemo(() => {
    const end = financialSummary?.meta.endDate;
    if (!end) return "the books you post into";
    const date = new Date(end);
    if (Number.isNaN(date.getTime())) return "the books you post into";
    return `FY${date.getFullYear()} · ${date.toLocaleDateString(undefined, { month: "long" })}`;
  }, [financialSummary]);



  const error = receivablesError || payablesError || financialError || accountingSummaryError;

  return (
    <AccountingShell
      activeTab="overview"
      // "Overview", not "Accounting Overview" — the app bar directly above
      // already says Accounting, and the band repeating it costs the width the
      // lede needs.
      title="Overview"
      description="where the books stand today"
      bandSlot={
        <>
          <BandChip label="Period" value={periodNote} tone="ok" />
          <BandChip
            label="Balanced"
            value={balanced ? "Yes" : "No"}
            tone={balanced ? "ok" : "bad"}
          />
        </>
      }
      actions={
        /*
          One verb plus a menu, not three competing buttons.

          The design's app bar carries a single primary action. The other two
          creates and the two setup wizards live behind it — the wizards
          especially, which were previously only reachable from a "Quick
          actions" panel the design does not have. Putting them here is what
          keeps them reachable at all.
        */
        <div className="flex items-center gap-2">
          <Button asChild size="sm">
            <Link href="/accounting/journals?action=new-journal">
              <Plus className="mr-1.5 size-4" />
              New journal
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" aria-label="More accounting actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[15rem]">
              <DropdownMenuItem asChild>
                <Link href="/accounting/sales?action=new-invoice">
                  <ReceiptLong className="mr-2 size-4" />
                  Raise an invoice
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/accounting/purchases?action=new-bill">
                  <Payments className="mr-2 size-4" />
                  Record a bill
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/accounting/chart-of-accounts?action=new-account">
                  <Coins className="mr-2 size-4" />
                  Add an account
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setInitOpen(true)}>
                <RefreshCcw className="mr-2 size-4" />
                Initialize accounting defaults
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setFoundationOpen(true)}>
                <Package className="mr-2 size-4" />
                Apply foundation pack
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load accounting overview</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      {/*
        One strip, not two rows of three.

        These six answer "where do the books stand", and that is a glance, not a
        read — stacked 3-and-3 it became a scan down and back. Six across only
        became possible once the module stopped centring itself inside
        `max-w-7xl`; at 2xl each tile gets ~226px, room for a six-figure value
        without truncation. Below that it steps to three, then two.
      */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {/*
          Named for what they are, not for the table they came out of.

          "Open AR" and "Open AP" are the ledger's words for them. This is the
          page somebody opens to find out how the business is doing, and on it
          the two figures mean "money customers owe us" and "money we owe
          suppliers" — so that is what they say. The rail is one click away for
          anyone who wants the ledger view.
        */}
        <MetricTile
          title="Cash on hand"
          value={financialSummary?.kpis.netCash ?? 0}
          valueLabel={formatCurrency(financialSummary?.kpis.netCash ?? 0)}
          delta={(financialSummary?.kpis.netCash ?? 0) < 0 ? "overdrawn" : "net movement"}
          detail="across cash and bank"
          tone={(financialSummary?.kpis.netCash ?? 0) < 0 ? "danger" : "good"}
          href="/accounting/financial-reports"
        />
        <MetricTile
          title="Owed to us"
          value={receivablesSummary?.kpis.openBalance ?? 0}
          valueLabel={formatCurrency(receivablesSummary?.kpis.openBalance ?? 0)}
          delta={
            (receivablesSummary?.kpis.overdueBalance ?? 0) > 0
              ? `${formatCurrency(receivablesSummary?.kpis.overdueBalance ?? 0)} overdue`
              : undefined
          }
          detail={
            (receivablesSummary?.kpis.overdueBalance ?? 0) > 0
              ? "past its terms"
              : "all within terms"
          }
          tone={(receivablesSummary?.kpis.overdueBalance ?? 0) > 0 ? "danger" : "good"}
          href="/accounting/receivables"
        />
        <MetricTile
          title="We owe"
          value={payablesSummary?.kpis.openBalance ?? 0}
          valueLabel={formatCurrency(payablesSummary?.kpis.openBalance ?? 0)}
          delta={
            (payablesSummary?.kpis.overdueBalance ?? 0) > 0
              ? `${formatCurrency(payablesSummary?.kpis.overdueBalance ?? 0)} overdue`
              : undefined
          }
          detail={
            (payablesSummary?.kpis.overdueBalance ?? 0) > 0 ? "past its terms" : "all within terms"
          }
          tone={(payablesSummary?.kpis.overdueBalance ?? 0) > 0 ? "warn" : "good"}
          href="/accounting/payables"
        />
        <MetricTile
          title="Income"
          value={financialSummary?.kpis.income ?? 0}
          valueLabel={formatCurrency(financialSummary?.kpis.income ?? 0)}
          delta="for the period"
          detail="everything earned"
          tone="neutral"
          href="/accounting/financial-reports"
        />
        <MetricTile
          title="Expenses"
          value={Math.abs(financialSummary?.kpis.expenses ?? 0)}
          valueLabel={formatCurrency(Math.abs(financialSummary?.kpis.expenses ?? 0))}
          delta="for the period"
          detail="everything spent"
          tone="warn"
          href="/accounting/financial-reports"
        />
        <MetricTile
          title="Net income"
          value={financialSummary?.kpis.netIncome ?? 0}
          valueLabel={formatCurrency(financialSummary?.kpis.netIncome ?? 0)}
          delta={(financialSummary?.kpis.netIncome ?? 0) < 0 ? "at a loss" : "before tax"}
          detail="income less expenses"
          tone={(financialSummary?.kpis.netIncome ?? 0) < 0 ? "danger" : "good"}
          href="/accounting/financial-reports"
        />
      </div>

      {/*
        Where the books stand, then what is stopping them closing.

        What used to be here was `DestinationList` — nineteen described links to
        the other accounting pages. That list existed because the navigation did
        not: the rail showed six categories, and the rest had to be discovered by
        landing somewhere. The rail now carries all thirteen destinations
        permanently, so the overview stops being a menu and answers the question
        you actually opened it with.
      */}
      <div className="grid gap-3 xl:grid-cols-12">
        <ReportPanel
          className="xl:col-span-5"
          title="Trial balance"
          note="debits and credits must agree"
        >
          <ReportTable
            label="Trial balance by section"
            tracks="minmax(0,1fr) 120px 120px"
            columns={[
              { label: "" },
              { label: "Debit", align: "right" },
              { label: "Credit", align: "right" },
            ]}
            rows={trialBalanceRows}
          />
          {!balanced ? (
            <p className="border-t border-[var(--border-subtle)] px-[13px] py-2 text-sm text-[var(--badge-bad-fg)]">
              Out by {formatCurrency(Math.abs(totalDebit - totalCredit))} — the ledger will not
              close until this is nil.
            </p>
          ) : null}
        </ReportPanel>

        <ReportPanel
          className="xl:col-span-7"
          title="Needs attention"
          note="what is blocking the close"
        >
          <ReportTable
            label="Blocking the close"
            tracks="minmax(0,1fr) 130px 110px 130px"
            columns={[
              { label: "What" },
              { label: "Where" },
              { label: "Count", align: "right" },
              { label: "Value", align: "right" },
            ]}
            rows={blockerRows}
            emptyLabel="Nothing outstanding. Every journal is posted and nothing is waiting on a filing."
          />
        </ReportPanel>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <ReportPanel className="xl:col-span-4" title="Period" note={periodNote}>
          {/*
            Label and figure, not a table. These five are facts about one
            thing rather than rows of a set — there is nothing to sort, total
            or compare down a column, so the table's head and rules would be
            chrome around a definition list.
          */}
          <div className="px-[13px] py-1.5">
            {periodFacts.map((fact) => (
              <div key={fact.label} className="flex min-h-[26px] items-center gap-2.5">
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-muted)]">
                  {fact.label}
                </span>
                <span
                  className="font-mono text-sm font-semibold tabular-nums"
                  style={{ color: PERIOD_INK[fact.tone ?? "strong"] }}
                >
                  {fact.value}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-[var(--border-subtle)] p-[13px]">
            <Button asChild size="sm" className="w-full">
              <Link href="/accounting/periods">Open the close checklist</Link>
            </Button>
          </div>
        </ReportPanel>

        <ReportPanel className="xl:col-span-8" title="Recent journals" note="newest first">
          <ReportTable
            label="Recent journal entries"
            tracks="120px minmax(0,1fr) 130px 120px"
            columns={[
              { label: "Ref" },
              { label: "Memo" },
              { label: "Date" },
              { label: "Status", align: "right" },
            ]}
            rows={recentJournalRows}
            emptyLabel="No journals posted yet."
          />
        </ReportPanel>
      </div>


      <InitializeWizardDialog open={initOpen} onOpenChange={setInitOpen} />
      <FoundationPackDialog open={foundationOpen} onOpenChange={setFoundationOpen} />
    </AccountingShell>
  );
}

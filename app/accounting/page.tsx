"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { MetricTile } from "@/components/accounting/hubs/metric-tile";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  fetchPayablesHubSummary,
  fetchReceivablesHubSummary,
  fetchSites,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { AccountingSeedPackResult } from "@/lib/api";
import {
  ArrowRight,
  ArrowRightUp,
  BarChart3,
  Building2,
  Coins,
  FileText,
  Package,
  Payments,
  Plus,
  ReceiptLong,
  RefreshCcw,
  Wallet,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Destination list ──────────────────────────────────────────────────────────

type DestItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  tag?: string;
};

type DestGroup = {
  group: string;
  items: DestItem[];
};

function DestinationList({ groups }: { groups: DestGroup[] }) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.group}>
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.group}
          </p>
          <div className="divide-y divide-border rounded-xl border bg-card">
            {group.items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="group flex items-center gap-3 px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground group-hover:text-[var(--action-primary-bg)]">
                      Go to {item.label}
                    </span>
                    {item.tag && (
                      <Badge variant="outline" className="text-[10px]">
                        {item.tag}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                </div>
                <ArrowRightUp className="size-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-[var(--action-primary-bg)]" />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

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
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
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
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
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

// ── Quick actions list ────────────────────────────────────────────────────────

type QuickActionItem =
  | { kind: "link"; label: string; href: string; icon: React.ElementType }
  | { kind: "action"; label: string; icon: React.ElementType; onClick: () => void };

function QuickActionsList({ items }: { items: QuickActionItem[] }) {
  return (
    <div className="divide-y divide-border rounded-xl border bg-card">
      {items.map((item) => {
        if (item.kind === "link") {
          return (
            <Link
              key={item.label}
              href={item.href}
              className="group flex items-center gap-3 px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/40"
            >
              <item.icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm font-medium text-foreground">
                Go to {item.label}
              </span>
              <ArrowRightUp className="size-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-[var(--action-primary-bg)]" />
            </Link>
          );
        }
        return (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            className="group flex w-full items-center gap-3 px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/40"
          >
            <item.icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-left text-sm font-medium text-foreground">{item.label}</span>
            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-[var(--action-primary-bg)]" />
          </button>
        );
      })}
    </div>
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

  const groupedLinks = useMemo<DestGroup[]>(
    () => [
      {
        group: "Receivables",
        items: [
          { id: "receivables-home", label: "Receivables Home", description: "Overall AR position, trends, and quick access.", href: "/accounting/receivables", tag: "Home" },
          { id: "sales", label: "Sales Operations", description: "Customers, invoices, receipts, and adjustments.", href: "/accounting/sales", tag: "Operations" },
          { id: "ar-aging", label: "AR Aging", description: "Receivables exposure by aging bucket.", href: "/accounting/sales?view=aging", tag: "Report" },
        ],
      },
      {
        group: "Payables",
        items: [
          { id: "payables-home", label: "Payables Home", description: "Overall AP position, trends, and quick access.", href: "/accounting/payables", tag: "Home" },
          { id: "purchases", label: "Purchases Operations", description: "Vendors, bills, payments, and adjustments.", href: "/accounting/purchases", tag: "Operations" },
          { id: "ap-aging", label: "AP Aging", description: "Payables exposure by aging bucket.", href: "/accounting/purchases?view=aging", tag: "Report" },
        ],
      },
      {
        group: "Financial Reporting",
        items: [
          { id: "financial-home", label: "Financial Reports", description: "Overall reporting position and report access.", href: "/accounting/financial-reports", tag: "Home" },
          { id: "trial-balance", label: "Trial Balance", description: "Ledger checks by account debits and credits.", href: "/accounting/trial-balance", tag: "Report" },
          { id: "financial-statements", label: "Financial Statements", description: "Profit and loss, balance sheet, and cash flow.", href: "/accounting/financial-statements", tag: "Report" },
          { id: "vat-summary", label: "VAT Summary", description: "Output/input VAT position and net tax.", href: "/accounting/tax?view=vat-summary", tag: "Tax" },
          { id: "vat-returns", label: "VAT Returns", description: "Draft, review, finalize, and file VAT returns.", href: "/accounting/tax?view=vat-returns", tag: "Compliance" },
        ],
      },
      {
        group: "Payments & Banking",
        items: [
          { id: "banking", label: "Banking", description: "Bank accounts, transactions, and reconciliations.", href: "/accounting/banking", tag: "Cash" },
          { id: "sales-receipts", label: "Receipt Register", description: "Incoming customer cash movements.", href: "/accounting/sales?view=receipts", tag: "AR" },
          { id: "purchase-payments", label: "Payment Register", description: "Outgoing supplier cash movements.", href: "/accounting/purchases?view=payments", tag: "AP" },
        ],
      },
      {
        group: "Accounting Master",
        items: [
          { id: "coa", label: "Chart of Accounts", description: "Account structure and classifications.", href: "/accounting/chart-of-accounts", tag: "Master" },
          { id: "periods", label: "Accounting Periods", description: "Period control, freeze date, and opening balances.", href: "/accounting/periods", tag: "Master" },
          { id: "journals", label: "Journals", description: "Manual journals and posting control.", href: "/accounting/journals", tag: "Core" },
          { id: "posting-rules", label: "Posting Rules", description: "Automation mappings for source postings.", href: "/accounting/posting-rules", tag: "Automation" },
          { id: "cost-centers", label: "Cost Centers", description: "Cost allocation dimensions by department.", href: "/accounting/cost-centers", tag: "Master" },
          { id: "budgets", label: "Budgets", description: "Budget setup and tracking.", href: "/accounting/budgets", tag: "Planning" },
          { id: "currency", label: "Currency Rates", description: "Exchange rates and conversion controls.", href: "/accounting/currency", tag: "Master" },
          { id: "tax", label: "Tax Setup", description: "Tax code setup and VAT controls.", href: "/accounting/tax", tag: "Tax" },
          { id: "assets", label: "Fixed Assets", description: "Asset register and depreciation controls.", href: "/accounting/assets", tag: "Master" },
          { id: "fiscalisation", label: "Fiscalisation", description: "Fiscal device and receipt integration settings.", href: "/accounting/fiscalisation", tag: "Compliance" },
        ],
      },
    ],
    [],
  );

  const quickActions = useMemo<QuickActionItem[]>(
    () => [
      { kind: "link", label: "Receivables Home", href: "/accounting/receivables", icon: ReceiptLong },
      { kind: "link", label: "Payables Home", href: "/accounting/payables", icon: Payments },
      { kind: "link", label: "Financial Reports", href: "/accounting/financial-reports", icon: BarChart3 },
      { kind: "link", label: "Chart of Accounts", href: "/accounting/chart-of-accounts", icon: Coins },
      { kind: "action", label: "Initialize Accounting Defaults", icon: RefreshCcw, onClick: () => setInitOpen(true) },
      { kind: "action", label: "Apply Foundation Pack", icon: Package, onClick: () => setFoundationOpen(true) },
    ],
    [],
  );

  const error = receivablesError || payablesError || financialError || accountingSummaryError;

  return (
    <AccountingShell
      activeTab="overview"
      title="Accounting Overview"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/accounting/journals?action=new-journal">
              <Plus className="mr-1.5 size-4" />
              New Journal
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/accounting/sales?action=new-invoice">
              <Plus className="mr-1.5 size-4" />
              New Invoice
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/accounting/purchases?action=new-bill">
              <Plus className="mr-1.5 size-4" />
              New Bill
            </Link>
          </Button>
        </div>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load accounting overview</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      {/* Metrics row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricTile
          title="Accounts in Chart"
          value={accountingSummary?.accounts ?? 0}
          valueLabel={(accountingSummary?.accounts ?? 0).toLocaleString()}
          detail="Active account structure"
        />
        <MetricTile
          title="Open AR"
          value={receivablesSummary?.kpis.openBalance ?? 0}
          valueLabel={formatCurrency(receivablesSummary?.kpis.openBalance ?? 0)}
          detail="Outstanding receivables"
        />
        <MetricTile
          title="Open AP"
          value={payablesSummary?.kpis.openBalance ?? 0}
          valueLabel={formatCurrency(payablesSummary?.kpis.openBalance ?? 0)}
          detail="Outstanding payables"
        />
        <MetricTile
          title="Net Income"
          value={financialSummary?.kpis.netIncome ?? 0}
          valueLabel={formatCurrency(financialSummary?.kpis.netIncome ?? 0)}
          detail="Profit and loss position"
        />
        <MetricTile
          title="Net Cash"
          value={financialSummary?.kpis.netCash ?? 0}
          valueLabel={formatCurrency(financialSummary?.kpis.netCash ?? 0)}
          detail="Cash flow net movement"
        />
        <MetricTile
          title="Open Periods"
          value={accountingSummary?.openPeriods ?? 0}
          valueLabel={(accountingSummary?.openPeriods ?? 0).toLocaleString()}
          detail="Current open accounting periods"
        />
      </div>

      {/* Destinations + Quick actions */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <DestinationList groups={groupedLinks} />

        <div className="space-y-3">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Quick Actions
          </p>
          <QuickActionsList items={quickActions} />
        </div>
      </div>

      <InitializeWizardDialog open={initOpen} onOpenChange={setInitOpen} />
      <FoundationPackDialog open={foundationOpen} onOpenChange={setFoundationOpen} />
    </AccountingShell>
  );
}

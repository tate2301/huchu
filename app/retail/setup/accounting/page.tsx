"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RetailShell } from "@/components/retail/retail-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchAccountingReadiness,
  fetchTenderMappings,
  runSeedPack,
  type AccountingSeedPackResult,
} from "@/lib/api";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
  ArrowRight,
} from "@/lib/icons";
import { Scale, FileCheck, TableRows } from "@/lib/icons";

function ReadinessIcon({ passed, size = "sm" }: { passed: boolean; size?: "sm" | "md" }) {
  const cls = size === "md" ? "h-5 w-5" : "h-4 w-4";
  return passed
    ? <CheckCircle2 className={`${cls} text-green-600 flex-shrink-0`} />
    : <XCircle className={`${cls} text-red-500 flex-shrink-0`} />;
}

// Map readiness check keys to fix-now actions
const CHECK_ACTIONS: Record<string, { label: string; href: string }> = {
  accounts: { label: "Open Chart of Accounts", href: "/accounting/chart-of-accounts" },
  periods: { label: "Open a period", href: "/accounting/periods" },
  "retained-earnings": { label: "Fix in Posting Studio", href: "/accounting/posting-rules?view=seed" },
  "default-tax": { label: "Manage tax codes", href: "/accounting/tax" },
  "default-bank": { label: "Add bank account", href: "/accounting/banking" },
  rules: { label: "Open Posting Studio", href: "/accounting/posting-rules" },
  tenders: { label: "Run seed pack", href: "/accounting/posting-rules?view=seed" },
  currencies: { label: "Run seed pack", href: "/accounting/posting-rules?view=seed" },
  "fx-rates": { label: "Add FX rates", href: "/accounting/currency" },
};

export default function RetailSetupAccountingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [fxRates, setFxRates] = useState({ ZWG: "", ZAR: "" });
  const [seedResult, setSeedResult] = useState<AccountingSeedPackResult | null>(null);

  const {
    data: readiness,
    isLoading,
    refetch,
    error,
  } = useQuery({
    queryKey: ["accounting", "setup-readiness"],
    queryFn: fetchAccountingReadiness,
  });

  const { data: tenderMappings = [] } = useQuery({
    queryKey: ["accounting", "tender-mappings"],
    queryFn: fetchTenderMappings,
  });

  const seedMutation = useMutation({
    mutationFn: (mode: "DRY_RUN" | "APPLY") => {
      const rates: Record<string, number> = {};
      if (fxRates.ZWG) rates["ZWG"] = Number(fxRates.ZWG);
      if (fxRates.ZAR) rates["ZAR"] = Number(fxRates.ZAR);
      return runSeedPack({
        mode,
        fxRates: Object.keys(rates).length > 0 ? rates : undefined,
      });
    },
    onSuccess: (data, mode) => {
      setSeedResult(data);
      if (mode === "APPLY") {
        toast({
          title: "Seed pack applied",
          description: `${data.createdAccounts} accounts, ${data.createdPostingRules} rules, ${data.createdTenderMappings} tender mappings created`,
        });
        refetch();
      } else {
        toast({ title: "Dry run complete", description: "Review the summary below." });
      }
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const passed = readiness?.summary.completed ?? 0;
  const total = readiness?.summary.total ?? 0;
  const allPassed = total > 0 && passed === total;

  const TENDER_TYPES = ["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"];
  const mappedTenders = new Set(
    tenderMappings.filter((mapping) => mapping.isActive).map((mapping) => mapping.tenderType),
  );
  const missingTenders = TENDER_TYPES.filter((t) => !mappedTenders.has(t));

  return (
    <RetailShell
      title="Accounting setup"
      description="Make sure the retail business can be posted, reconciled, and explained to the owner in finance language."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/setup">
              <Scale className="h-4 w-4" />
              Overview
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/accounting/chart-of-accounts">
              <TableRows className="h-4 w-4" />
              Chart of accounts
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/accounting/posting-rules">
              <FileCheck className="h-4 w-4" />
              Posting rules
            </Link>
          </Button>
        </div>
      }
    >
      <div className="max-w-3xl space-y-8">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Configure accounting integration for your retail operations.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/accounting/posting-rules")}
            >
              Open Posting Studio
              <ExternalLink className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>

        {/* Overall status */}
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Checking setup...</div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-destructive">Failed to load readiness data.</div>
        ) : readiness ? (
          <>
            {/* Summary bar */}
            <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/20">
              <ReadinessIcon passed={allPassed} size="md" />
              <div className="flex-1">
                <p className="font-medium text-sm">
                  {allPassed ? "All checks passing" : `${passed} of ${total} checks passing`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {allPassed
                    ? "Retail accounting is fully configured."
                    : "Complete the items below to enable automatic retail journal posting."}
                </p>
              </div>
              {!allPassed && (
                <Button
                  size="sm"
                  onClick={() => seedMutation.mutate("APPLY")}
                  disabled={seedMutation.isPending}
                >
                  {seedMutation.isPending ? "Running..." : "Quick fix with seed pack"}
                </Button>
              )}
            </div>

            {/* Readiness checklist */}
            <div className="space-y-2">
              {readiness.checks.map((check) => {
                const action = CHECK_ACTIONS[check.id];
                return (
                  <div
                    key={check.id}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/10 transition-colors"
                  >
                    <ReadinessIcon passed={check.ready} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{check.label}</p>
                      {check.note && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{check.note}</p>
                      )}
                    </div>
                    {!check.ready && action && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(action.href)}
                        className="flex-shrink-0"
                      >
                        {action.label}
                        <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    )}
                    {check.ready && (
                      <Badge variant="outline" className="text-xs text-green-700 border-green-200 bg-green-50 flex-shrink-0">
                        Configured
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : null}

        <Separator />

        {/* Tender mapping status */}
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Tender account mappings</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Each payment method needs a clearing account for the posting engine to generate balanced entries.
            </p>
          </div>

          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tender type</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Clearing account</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {TENDER_TYPES.map((tenderType) => {
                  const mapping = tenderMappings.find(
                    (m) => m.tenderType === tenderType && m.isActive,
                  );
                  return (
                    <tr key={tenderType} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">{tenderType}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {mapping?.clearingAccount
                          ? `${mapping.clearingAccount.code} - ${mapping.clearingAccount.name}`
                          : mapping?.clearingAccountId
                          ? mapping.clearingAccountId
                          : <span className="text-muted-foreground/60 italic">Not configured</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <ReadinessIcon passed={!!mapping} />
                          <span className="text-xs">{mapping ? "Active" : "Missing"}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {missingTenders.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Missing mappings for: {missingTenders.join(", ")}. Run the seed pack below to create defaults.
            </p>
          )}
        </div>

        <Separator />

        {/* Seed pack */}
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Zimbabwe Retail Foundation seed pack</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Provisions chart of accounts, tax codes, currencies, posting rules, and tender mappings.
              Idempotent - safe to re-run at any time.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">ZWG/USD rate</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={fxRates.ZWG}
                onChange={(e) => setFxRates((r) => ({ ...r, ZWG: e.target.value }))}
                placeholder="e.g. 27.50"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">ZAR/USD rate</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={fxRates.ZAR}
                onChange={(e) => setFxRates((r) => ({ ...r, ZAR: e.target.value }))}
                placeholder="e.g. 18.50"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => seedMutation.mutate("DRY_RUN")}
              disabled={seedMutation.isPending}
            >
              {seedMutation.isPending && seedMutation.variables === "DRY_RUN" ? "Previewing..." : "Preview changes"}
            </Button>
            <Button
              onClick={() => seedMutation.mutate("APPLY")}
              disabled={seedMutation.isPending}
            >
              {seedMutation.isPending && seedMutation.variables === "APPLY" ? "Applying..." : "Apply seed pack"}
            </Button>
          </div>

          {seedResult && (
            <div className="border rounded-md p-4 bg-muted/20 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {seedResult.mode === "DRY_RUN" ? "Preview - no changes made" : "Changes applied"}
              </p>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                <span className="text-muted-foreground">Accounts</span>
                <span className="tabular-nums">
                  {seedResult.createdAccounts} created
                </span>
                <span className="text-muted-foreground">Tax codes</span>
                <span className="tabular-nums">{seedResult.createdTaxCodes} created</span>
                <span className="text-muted-foreground">Currencies</span>
                <span className="tabular-nums">{seedResult.createdCurrencyDefinitions} created</span>
                <span className="text-muted-foreground">Tender mappings</span>
                <span className="tabular-nums">{seedResult.createdTenderMappings} created</span>
                <span className="text-muted-foreground">Posting rules</span>
                <span className="tabular-nums">
                  {seedResult.createdPostingRules} created
                </span>
                <span className="text-muted-foreground">Periods</span>
                <span className="tabular-nums">{seedResult.createdPeriods} created</span>
              </div>
              {seedResult.preview.missingFxQuotes.length > 0 && (
                <p className="text-xs text-amber-700">
                  Missing FX quotes for: {seedResult.preview.missingFxQuotes.join(", ")}
                </p>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Quick links */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Quick links</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Posting Studio — Rule library", href: "/accounting/posting-rules" },
              { label: "Posting Studio — Retail defaults", href: "/accounting/posting-rules?view=retail-defaults" },
              { label: "Posting Studio — Simulation", href: "/accounting/posting-rules?view=simulation" },
              { label: "Chart of accounts", href: "/accounting/chart-of-accounts" },
              { label: "Tax codes", href: "/accounting/tax" },
              { label: "Accounting periods", href: "/accounting/periods" },
            ].map((link) => (
              <button
                key={link.href}
                onClick={() => router.push(link.href)}
                className="flex items-center gap-2 p-3 border rounded-lg text-sm text-left hover:bg-muted/20 transition-colors"
              >
                <span className="flex-1">{link.label}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </RetailShell>
  );
}

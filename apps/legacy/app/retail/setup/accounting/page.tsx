"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Badge, Card, Skeleton, StatCard } from "@corelithzw/react";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { useToast } from "@corelithzw/ui/components/use-toast";
import {
  fetchAccountingReadiness,
  fetchTenderMappings,
  runSeedPack,
  type AccountingSeedPackResult,
} from "@/lib/api";
import { CheckCircle2, XCircle, RefreshCw, ArrowRight } from "@corelithzw/ui/lib/icons";
import { Scale, FileCheck, TableRows } from "@corelithzw/ui/lib/icons";

/**
 * The tick or cross beside a readiness check.
 *
 * Decorative: every row it sits on already carries the state as a text label,
 * so the icon is hidden from assistive tech rather than repeated. The colours
 * are tone tokens — this used to reach straight for `text-green-600` and
 * `text-red-500`, which is the Tailwind palette, not the design system.
 */
function ReadinessIcon({ passed, size = "sm" }: { passed: boolean; size?: "sm" | "md" }) {
  const cls = size === "md" ? "h-5 w-5" : "h-4 w-4";
  const Icon = passed ? CheckCircle2 : XCircle;
  return (
    <Icon
      aria-hidden="true"
      className={`${cls} flex-shrink-0`}
      style={{ color: passed ? "var(--tone-success)" : "var(--tone-danger)" }}
    />
  );
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
      <div className="max-w-3xl space-y-6">
        {isLoading ? (
          <div aria-busy="true" aria-live="polite" className="space-y-4">
            <span className="sr-only">Checking the accounting setup…</span>
            <Skeleton height={104} />
            <Skeleton height={240} />
          </div>
        ) : error ? (
          <Alert
            tone="danger"
            title="The readiness checks would not load"
            actions={
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            }
          >
            {error instanceof Error ? error.message : "The accounting service did not respond."}
          </Alert>
        ) : readiness ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Checks passing"
                value={`${passed}/${total}`}
                tone={allPassed ? "success" : "warn"}
                footer={
                  allPassed
                    ? "Retail journals post automatically"
                    : "Automatic posting is blocked until these clear"
                }
              />
              <StatCard
                label="Tender mappings"
                value={`${TENDER_TYPES.length - missingTenders.length}/${TENDER_TYPES.length}`}
                tone={missingTenders.length === 0 ? "success" : "warn"}
                footer="Clearing accounts for each payment method"
              />
              <StatCard
                label="Posting studio"
                value={allPassed ? "Ready" : "Needs input"}
                footer="Where the rules themselves live"
              />
            </div>

            <Card
              title="Readiness checks"
              subtitle="Each one has to pass before a sale can be posted to the ledger without a human."
              actions={
                !allPassed ? (
                  <Button
                    size="sm"
                    onClick={() => seedMutation.mutate("APPLY")}
                    disabled={seedMutation.isPending}
                  >
                    {seedMutation.isPending ? "Running…" : "Quick fix with seed pack"}
                  </Button>
                ) : undefined
              }
              flush
            >
              <ul className="list-plain">
                {readiness.checks.map((check) => {
                  const action = CHECK_ACTIONS[check.id];
                  return (
                    <li key={check.id} className="list-item">
                      <span className="lead">
                        <ReadinessIcon passed={check.ready} />
                      </span>
                      <div className="min-w-0">
                        <div className="title bold">{check.label}</div>
                        {check.note ? <div className="sub truncate">{check.note}</div> : null}
                      </div>
                      <div className="meta">
                        {check.ready ? (
                          <Badge tone="success">Configured</Badge>
                        ) : action ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(action.href)}
                            className="flex-shrink-0"
                          >
                            {action.label}
                            <ArrowRight className="ml-1 h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Badge tone="warn">Needs input</Badge>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </>
        ) : null}

        <Card
          title="Tender account mappings"
          subtitle="Each payment method needs a clearing account before the posting engine can balance an entry."
        >
          <div className="overflow-x-auto">
            <table className="table">
              <caption className="sr-only">Clearing account for each tender type</caption>
              <thead>
                <tr>
                  <th scope="col">Tender type</th>
                  <th scope="col">Clearing account</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {TENDER_TYPES.map((tenderType) => {
                  const mapping = tenderMappings.find(
                    (m) => m.tenderType === tenderType && m.isActive,
                  );
                  return (
                    <tr key={tenderType}>
                      <td className="font-medium">{tenderType.replaceAll("_", " ")}</td>
                      <td className="t-muted">
                        {mapping?.clearingAccount
                          ? `${mapping.clearingAccount.code} — ${mapping.clearingAccount.name}`
                          : (mapping?.clearingAccountId ?? "Not configured")}
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1.5">
                          <ReadinessIcon passed={Boolean(mapping)} />
                          <span>{mapping ? "Active" : "Missing"}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {missingTenders.length > 0 ? (
            <Alert className="mt-4" tone="warn" title={`${missingTenders.length} tender types are unmapped`}>
              {missingTenders.map((t) => t.replaceAll("_", " ")).join(", ")}. Run the seed pack below
              to create the defaults.
            </Alert>
          ) : null}
        </Card>

        <Card
          title="Zimbabwe retail foundation seed pack"
          subtitle="Provisions the chart of accounts, tax codes, currencies, posting rules and tender mappings. Idempotent — safe to re-run."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="fx-zwg" className="t-label-sm t-muted mb-1 block">
                ZWG/USD rate
              </label>
              <Input
                id="fx-zwg"
                type="number"
                step="0.01"
                min="0"
                value={fxRates.ZWG}
                onChange={(e) => setFxRates((r) => ({ ...r, ZWG: e.target.value }))}
                placeholder="27.50"
              />
            </div>
            <div>
              <label htmlFor="fx-zar" className="t-label-sm t-muted mb-1 block">
                ZAR/USD rate
              </label>
              <Input
                id="fx-zar"
                type="number"
                step="0.01"
                min="0"
                value={fxRates.ZAR}
                onChange={(e) => setFxRates((r) => ({ ...r, ZAR: e.target.value }))}
                placeholder="18.50"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              onClick={() => seedMutation.mutate("DRY_RUN")}
              disabled={seedMutation.isPending}
            >
              {seedMutation.isPending && seedMutation.variables === "DRY_RUN"
                ? "Previewing…"
                : "Preview changes"}
            </Button>
            <Button onClick={() => seedMutation.mutate("APPLY")} disabled={seedMutation.isPending}>
              {seedMutation.isPending && seedMutation.variables === "APPLY"
                ? "Applying…"
                : "Apply seed pack"}
            </Button>
          </div>

          {seedResult ? (
            <div className="mt-4 border-t border-[color:var(--border-subtle)] pt-4">
              <p className="t-eyebrow t-muted">
                {seedResult.mode === "DRY_RUN" ? "Preview — nothing changed" : "Changes applied"}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1">
                {[
                  ["Accounts", seedResult.createdAccounts],
                  ["Tax codes", seedResult.createdTaxCodes],
                  ["Currencies", seedResult.createdCurrencyDefinitions],
                  ["Tender mappings", seedResult.createdTenderMappings],
                  ["Posting rules", seedResult.createdPostingRules],
                  ["Periods", seedResult.createdPeriods],
                ].map(([label, value]) => (
                  <div key={String(label)} className="contents">
                    <dt className="t-body-sm t-muted">{label}</dt>
                    <dd className="t-body-sm tabular-nums">{value} created</dd>
                  </div>
                ))}
              </dl>
              {seedResult.preview.missingFxQuotes.length > 0 ? (
                <Alert className="mt-3" tone="warn" title="Missing FX quotes">
                  {seedResult.preview.missingFxQuotes.join(", ")}
                </Alert>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card title="Where the rules live" flush>
          <ul className="list-plain">
            {[
              { label: "Posting studio — rule library", href: "/accounting/posting-rules" },
              {
                label: "Posting studio — retail defaults",
                href: "/accounting/posting-rules?view=retail-defaults",
              },
              {
                label: "Posting studio — simulation",
                href: "/accounting/posting-rules?view=simulation",
              },
              { label: "Chart of accounts", href: "/accounting/chart-of-accounts" },
              { label: "Tax codes", href: "/accounting/tax" },
              { label: "Accounting periods", href: "/accounting/periods" },
            ].map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="list-item">
                  <span className="lead" aria-hidden="true" />
                  <div className="title bold">{link.label}</div>
                  <div className="meta">
                    <ArrowRight className="chev h-4 w-4" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </RetailShell>
  );
}

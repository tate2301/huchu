"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminDistributionChart, AdminDualBarChart, AdminDonutChart } from "@/components/charts/admin-headless-charts";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api-client";
import { ArrowRight, FileCheck, Scale, ShieldCheck, TableRows } from "@/lib/icons";
import type { RetailSetupSnapshot } from "@/lib/retail/setup-snapshot";

type SetupOverviewResponse = RetailSetupSnapshot;

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;

export default function RetailSetupAccountingPage() {
  const query = useQuery({
    queryKey: ["retail-setup-overview"],
    queryFn: () => fetchJson<SetupOverviewResponse>("/api/v2/retail/setup/overview"),
  });

  const snapshot = query.data;

  const ruleRows = useMemo(
    () =>
      snapshot?.postingRules.required.map((rule) => ({
        id: rule.sourceType,
        label: rule.sourceType.replaceAll("_", " "),
        primary: rule.configured ? 1 : 0,
        secondary: rule.configured ? 0 : 1,
      })) ?? [],
    [snapshot],
  );

  const accountRows = useMemo(
    () =>
      ACCOUNT_TYPES.map((type) => ({
        id: type,
        label: type,
        value: snapshot?.accounting.accountCounts[type] ?? 0,
      })),
    [snapshot],
  );

  const readinessChecks = useMemo(
    () =>
      snapshot
        ? [
            Boolean(
              snapshot.accounting.accountCounts.ASSET ||
                snapshot.accounting.accountCounts.LIABILITY ||
                snapshot.accounting.accountCounts.EQUITY ||
                snapshot.accounting.accountCounts.INCOME ||
                snapshot.accounting.accountCounts.EXPENSE,
            ),
            Boolean(snapshot.accounting.openPeriods > 0),
            Boolean(snapshot.accounting.retainedEarningsAccountId),
            Boolean(snapshot.accounting.defaultTaxCodeId),
            Boolean(snapshot.accounting.defaultBankAccountId),
            snapshot.postingRules.required.some((rule) => rule.sourceType === "RETAIL_SALE" && rule.configured),
            snapshot.postingRules.required.some((rule) => rule.sourceType === "RETAIL_REFUND" && rule.configured),
            snapshot.postingRules.required.some((rule) => rule.sourceType === "RETAIL_GOODS_RECEIPT" && rule.configured),
            snapshot.postingRules.required.some((rule) => rule.sourceType === "RETAIL_SHIFT_VARIANCE" && rule.configured),
          ]
        : [],
    [snapshot],
  );

  const readyCount = readinessChecks.filter(Boolean).length;
  const readinessDonut = [
    { id: "ready", label: "Ready", value: readyCount, tone: "success" as const },
    { id: "gap", label: "Gap", value: Math.max(readinessChecks.length - readyCount, 0), tone: "warning" as const },
  ];

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
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
        <div className="space-y-6">
          <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Accounting map</p>
                <h2 className="mt-1 text-2xl font-semibold text-[var(--text-strong)]">Retail posting coverage</h2>
                <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
                  The owner cares about gross profit, EBITDA, and net profit. Those only work if the posting rules and
                  core accounts are wired correctly beneath the surface.
                </p>
              </div>
              <div className="rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Readiness</p>
                <p className="font-mono text-3xl font-semibold text-[var(--text-strong)]">
                  {snapshot ? `${Math.round((readyCount / Math.max(readinessChecks.length, 1)) * 100)}%` : "—"}
                </p>
                <p className="text-xs text-[var(--text-muted)]">{snapshot ? `${readyCount}/${readinessChecks.length} checks` : "Loading accounting"}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
              <AdminDualBarChart
                rows={ruleRows}
                primaryLabel="Configured"
                secondaryLabel="Missing"
                height={300}
                valueFormatter={(value) => value.toString()}
                emptyLabel="Posting rule coverage is loading"
              />
              <AdminDonutChart
                rows={readinessDonut}
                valueLabel="Accounting checks"
                valueFormatter={(value) => value.toString()}
                height={300}
                emptyLabel="Accounting readiness is loading"
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Accounts</p>
                <h3 className="mt-1 text-xl font-semibold text-[var(--text-strong)]">Distribution by account type</h3>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/accounting/chart-of-accounts">
                  Open accounts
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-4">
              <AdminDistributionChart
                rows={accountRows}
                valueLabel="Accounts"
                valueFormatter={(value) => value.toString()}
                height={300}
                emptyLabel="No accounts available"
              />
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[var(--surface-subtle)] p-3 text-[var(--text-strong)]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Checklist</p>
                <h3 className="text-lg font-semibold text-[var(--text-strong)]">Setup readiness checks</h3>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {[
                { label: "Core accounts exist", ok: readinessChecks[0] },
                { label: "Open accounting period", ok: readinessChecks[1] },
                { label: "Retained earnings set", ok: readinessChecks[2] },
                { label: "Default tax code set", ok: readinessChecks[3] },
                { label: "Default bank account set", ok: readinessChecks[4] },
                { label: "Retail sales rule", ok: readinessChecks[5] },
                { label: "Retail refunds rule", ok: readinessChecks[6] },
                { label: "Goods receipt rule", ok: readinessChecks[7] },
                { label: "Shift variance rule", ok: readinessChecks[8] },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] px-4 py-3">
                  <span className="text-sm text-[var(--text-strong)]">{item.label}</span>
                  <span className={`font-mono text-xs ${item.ok ? "text-[var(--success-500)]" : "text-[var(--warning-500)]"}`}>
                    {item.ok ? "Ready" : "Missing"}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[var(--surface-subtle)] p-3 text-[var(--text-strong)]">
                <Scale className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Direct actions</p>
                <h3 className="text-lg font-semibold text-[var(--text-strong)]">Go fix the gaps</h3>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              {[
                { label: "Posting rules", href: "/accounting/posting-rules" },
                { label: "Chart of accounts", href: "/accounting/chart-of-accounts" },
                { label: "Retail setup overview", href: "/retail/setup" },
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center justify-between rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] px-4 py-3 text-[var(--text-strong)] hover:bg-[var(--surface-base)]"
                >
                  <span>{item.label}</span>
                  <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" />
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </RetailShell>
  );
}


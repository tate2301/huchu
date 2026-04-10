"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminDualBarChart, AdminDonutChart } from "@/components/charts/admin-headless-charts";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api-client";
import {
  ArrowRight,
  BarChart3,
  Building2,
  FileText,
  ReceiptLong,
  Scale,
  ShieldCheck,
} from "@/lib/icons";
import type { RetailSetupSnapshot } from "@/lib/retail/setup-snapshot";

type SetupOverviewResponse = RetailSetupSnapshot;

function percent(completed: number, total: number) {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

export default function RetailSetupPage() {
  const query = useQuery({
    queryKey: ["retail-setup-overview"],
    queryFn: () => fetchJson<SetupOverviewResponse>("/api/v2/retail/setup/overview"),
  });

  const snapshot = query.data;

  const readinessRows = useMemo(
    () =>
      snapshot?.sections.map((section) => ({
        label: section.label,
        configured: section.completed,
        missing: section.missing,
      })) ?? [],
    [snapshot],
  );

  const readinessDonut = useMemo(
    () =>
      snapshot
        ? [
            { id: "ready", label: "Ready", value: snapshot.readiness.completed, tone: "success" as const },
            {
              id: "pending",
              label: "Pending",
              value: Math.max(snapshot.readiness.total - snapshot.readiness.completed, 0),
              tone: "warning" as const,
            },
          ]
        : [],
    [snapshot],
  );

  return (
    <RetailShell
      title="Setup"
      description="Complete the retail operating model, then pin the default branch, register, branding, policy, and accounting map."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/retail/setup/operations">
              <Building2 className="h-4 w-4" />
              Operations
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/setup/pos-policy">
              <ShieldCheck className="h-4 w-4" />
              POS policy
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/setup/branding">
              <FileText className="h-4 w-4" />
              Branding
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/setup/accounting">
              <Scale className="h-4 w-4" />
              Accounting
            </Link>
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
        <div className="space-y-6">
          <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Retail readiness
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-[var(--text-strong)]">Setup coverage by area</h2>
                <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
                  The goal is to get the branch, register, receipt, policy, and accounting layers aligned so
                  operators can start cleanly and finance can trust the output.
                </p>
              </div>
              <div className="rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Completion</p>
                <p className="font-mono text-3xl font-semibold text-[var(--text-strong)]">
                  {snapshot ? `${snapshot.readiness.percent}%` : "—"}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {snapshot ? `${snapshot.readiness.completed}/${snapshot.readiness.total} checks` : "Loading checks"}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
              <AdminDualBarChart
                rows={readinessRows.map((row) => ({
                  id: row.label,
                  label: row.label,
                  primary: row.configured,
                  secondary: row.missing,
                }))}
                primaryLabel="Configured"
                secondaryLabel="Missing"
                height={300}
                valueFormatter={(value) => value.toString()}
                emptyLabel="Setup readiness is loading"
              />
              <AdminDonutChart
                rows={readinessDonut}
                valueLabel="Setup checks"
                valueFormatter={(value) => value.toString()}
                height={300}
                emptyLabel="Setup readiness is loading"
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Sections</p>
                <h3 className="mt-1 text-xl font-semibold text-[var(--text-strong)]">What still needs attention</h3>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/retail/setup/operations">
                  Open wizard
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {snapshot?.sections.map((section) => (
                <Link
                  key={section.id}
                  href={section.href}
                  className="group flex min-h-[120px] flex-col justify-between rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] p-4 transition-colors hover:border-[var(--edge-default)] hover:bg-[var(--surface-base)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-[var(--text-strong)]">{section.label}</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">{section.note}</p>
                    </div>
                    <span className="rounded-full border border-[var(--edge-subtle)] bg-[var(--surface-base)] px-2.5 py-1 font-mono text-xs text-[var(--text-strong)]">
                      {section.completed}/{section.total}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>{percent(section.completed, section.total)}% complete</span>
                    <span className="inline-flex items-center gap-1 text-[var(--text-strong)] transition-transform group-hover:translate-x-0.5">
                      Continue
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[var(--surface-subtle)] p-3 text-[var(--text-strong)]">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">At a glance</p>
                <h3 className="text-lg font-semibold text-[var(--text-strong)]">Setup signal</h3>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {snapshot
                ? [
                    { label: "Active sites", value: `${snapshot.counts.activeSites}/${snapshot.counts.totalSites}` },
                    {
                      label: "Registers",
                      value: `${snapshot.counts.activeRegisters}/${snapshot.counts.totalRegisters}`,
                    },
                    { label: "Open shifts", value: `${snapshot.counts.openShifts}` },
                    { label: "Accounts", value: `${snapshot.counts.accounts}` },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">{item.label}</p>
                      <p className="mt-1 font-mono text-lg font-semibold text-[var(--text-strong)]">{item.value}</p>
                    </div>
                  ))
                : null}
            </div>
          </section>

          <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[var(--surface-subtle)] p-3 text-[var(--text-strong)]">
                <ReceiptLong className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Next actions</p>
                <h3 className="text-lg font-semibold text-[var(--text-strong)]">Follow the flow</h3>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {[
                {
                  title: "Branch and register",
                  desc: "Pin the default site/register and provision the active terminal.",
                  href: "/retail/setup/operations",
                },
                {
                  title: "Receipt and branding",
                  desc: "Check logo, footer, legal identity, and receipt output readiness.",
                  href: "/retail/setup/branding",
                },
                {
                  title: "POS policy",
                  desc: "Confirm tender rules, split tender behavior, and reason prompts.",
                  href: "/retail/setup/pos-policy",
                },
                {
                  title: "Accounting map",
                  desc: "Close the loop with posting rules and core account readiness.",
                  href: "/retail/setup/accounting",
                },
              ].map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className="group flex items-center justify-between gap-4 rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] px-4 py-3 transition-colors hover:border-[var(--edge-default)] hover:bg-[var(--surface-base)]"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--text-strong)]">{item.title}</p>
                    <p className="text-sm text-[var(--text-muted)]">{item.desc}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-1" />
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </RetailShell>
  );
}


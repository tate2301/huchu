"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminDualBarChart, AdminDonutChart } from "@/components/charts/admin-headless-charts";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api-client";
import { ArrowRight, FileText, Palette, ReceiptLong, ShieldCheck, Sparkles } from "@/lib/icons";
import type { RetailSetupSnapshot } from "@/lib/retail/setup-snapshot";

type SetupOverviewResponse = RetailSetupSnapshot;

function hasValue(value: string | null | undefined) {
  return Boolean(value && value.trim());
}

export default function RetailSetupBrandingPage() {
  const query = useQuery({
    queryKey: ["retail-setup-overview"],
    queryFn: () => fetchJson<SetupOverviewResponse>("/api/v2/retail/setup/overview"),
  });

  const snapshot = query.data;

  const categories = useMemo(() => {
    const branding = snapshot?.branding;
    if (!branding) {
      return [];
    }

    return [
      {
        id: "identity",
        label: "Identity",
        note: "Display name, legal name, trading name",
        value: hasValue(branding.displayName) || hasValue(branding.legalName) || hasValue(branding.tradingName) ? 1 : 0,
      },
      {
        id: "assets",
        label: "Assets",
        note: "Logo and visual mark",
        value: hasValue(branding.logoUrl) ? 1 : 0,
      },
      {
        id: "receipt",
        label: "Receipt footer",
        note: "Footer text on documents",
        value: hasValue(branding.defaultFooterText) ? 1 : 0,
      },
      {
        id: "contact",
        label: "Contact line",
        note: "Email, phone, website",
        value: hasValue(branding.email) || hasValue(branding.phone) || hasValue(branding.website) ? 1 : 0,
      },
      {
        id: "address",
        label: "Address",
        note: "Physical or postal address",
        value: hasValue(branding.physicalAddress) || hasValue(branding.postalAddress) ? 1 : 0,
      },
      {
        id: "compliance",
        label: "Compliance",
        note: "Registration or tax identifiers",
        value: hasValue(branding.registrationNumber) || hasValue(branding.vatNumber) || hasValue(branding.taxNumber) ? 1 : 0,
      },
    ];
  }, [snapshot]);

  const checksComplete = categories.reduce((sum, row) => sum + row.value, 0);
  const totalChecks = categories.length;
  const overviewRows = categories.map((row) => ({
    id: row.id,
    label: row.label,
    primary: row.value,
    secondary: Math.max(1 - row.value, 0),
  }));
  const readinessDonut = [
    { id: "ready", label: "Ready", value: checksComplete, tone: "success" as const },
    { id: "missing", label: "Missing", value: Math.max(totalChecks - checksComplete, 0), tone: "warning" as const },
  ];

  const branding = snapshot?.branding;
  const effective = snapshot?.effectiveBranding;

  return (
    <RetailShell
      title="Receipt & branding"
      description="Review the customer-facing identity that prints on receipts, invoices, and POS screens."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/setup">
              <ReceiptLong className="h-4 w-4" />
              Overview
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/settings/branding/identity">
              <Palette className="h-4 w-4" />
              Identity
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/settings/branding/assets">
              <Sparkles className="h-4 w-4" />
              Assets
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/settings/branding/finance">
              <FileText className="h-4 w-4" />
              Finance
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
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Receipt surface</p>
                <h2 className="mt-1 text-2xl font-semibold text-[var(--text-strong)]">What customers will actually see</h2>
                <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
                  The receipt setup should feel deliberate: clear identity, readable footer, and enough contact /
                  compliance detail to avoid back-and-forth later.
                </p>
              </div>
              <div className="rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Completion</p>
                <p className="font-mono text-3xl font-semibold text-[var(--text-strong)]">
                  {snapshot ? `${Math.round((checksComplete / Math.max(totalChecks, 1)) * 100)}%` : "—"}
                </p>
                <p className="text-xs text-[var(--text-muted)]">{snapshot ? `${checksComplete}/${totalChecks} checks` : "Loading branding"}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.65fr)]">
              <AdminDualBarChart
                rows={overviewRows}
                primaryLabel="Configured"
                secondaryLabel="Missing"
                height={300}
                valueFormatter={(value) => value.toString()}
                emptyLabel="Branding data is loading"
              />
              <AdminDonutChart
                rows={readinessDonut}
                valueLabel="Branding checks"
                valueFormatter={(value) => value.toString()}
                height={300}
                emptyLabel="Branding data is loading"
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Receipt preview</p>
                <h3 className="mt-1 text-xl font-semibold text-[var(--text-strong)]">A minimal customer-facing view</h3>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/settings/branding">
                  Open branding settings
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-4 rounded-[24px] border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] p-5">
              <div className="mx-auto max-w-md rounded-[22px] border border-dashed border-[var(--edge-default)] bg-[var(--surface-base)] px-5 py-6 shadow-[var(--shadow-card)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Brand header</p>
                    <h4 className="mt-1 text-2xl font-semibold text-[var(--text-strong)]">
                      {branding?.displayName || effective?.displayName || "Retail brand"}
                    </h4>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {branding?.legalName || branding?.tradingName || "Set a legal or trading name for receipts"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[var(--surface-subtle)] px-3 py-2 text-right">
                    <p className="font-mono text-xs text-[var(--text-muted)]">POS RECEIPT</p>
                    <p className="font-mono text-sm font-semibold text-[var(--text-strong)]">READY</p>
                  </div>
                </div>
                <div className="mt-5 space-y-2 border-t border-[var(--edge-subtle)] pt-4 text-sm text-[var(--text-muted)]">
                  <p>{branding?.defaultFooterText || "Add a footer line for support, returns, and tax details."}</p>
                  <p>{branding?.email || branding?.phone || branding?.website || "Add a contact line to reduce customer friction."}</p>
                </div>
              </div>
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
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Actionable checks</p>
                <h3 className="text-lg font-semibold text-[var(--text-strong)]">What to fix next</h3>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {categories.map((row) => (
                <div key={row.id} className="rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-[var(--text-strong)]">{row.label}</p>
                      <p className="text-sm text-[var(--text-muted)]">{row.note}</p>
                    </div>
                    <span className="font-mono text-xs text-[var(--text-muted)]">{row.value}/1</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[var(--surface-subtle)] p-3 text-[var(--text-strong)]">
                <ReceiptLong className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Where to edit</p>
                <h3 className="text-lg font-semibold text-[var(--text-strong)]">Jump straight to the source</h3>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              {[
                { label: "Identity & theme", href: "/settings/branding/identity" },
                { label: "Assets & contact", href: "/settings/branding/assets" },
                { label: "Finance & defaults", href: "/settings/branding/finance" },
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


"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Alert, Card, EmptyState, Skeleton, StatCard } from "@corelithzw/react";
import { useQuery } from "@tanstack/react-query";
import { AdminDualBarChart, AdminDonutChart } from "@corelithzw/ui/charts/admin-headless-charts";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@corelithzw/ui/components/button";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Building2, ChevronRight } from "@corelithzw/ui/lib/icons";
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
        id: section.id,
        label: section.label,
        primary: section.completed,
        secondary: section.missing,
      })) ?? [],
    [snapshot],
  );

  const readinessDonut = useMemo(
    () =>
      snapshot
        ? [
            {
              id: "ready",
              label: "Ready",
              value: snapshot.readiness.completed,
              tone: "success" as const,
            },
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

  /*
   * One action, in one place. The header used to carry four links to the same
   * four screens the body lists twice over — once as "Sections" and again as
   * "Next actions". `04-composition.md` step 5 is explicit that an action lives
   * in exactly one location, so the section list below is now the only door and
   * the header keeps the single primary that starts the flow.
   */
  const actions = (
    <Button asChild size="sm">
      <Link href="/retail/setup/operations">
        <Building2 className="h-4 w-4" />
        Open the setup wizard
      </Link>
    </Button>
  );

  if (query.isPending) {
    return (
      <RetailShell
        title="Setup"
        description="Complete the retail operating model, then pin the default branch, register, branding, policy, and accounting map."
        actions={actions}
      >
        <div aria-busy="true" aria-live="polite" className="space-y-4">
          <span className="sr-only">Checking what is set up…</span>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Skeleton height={104} />
            <Skeleton height={104} />
            <Skeleton height={104} />
            <Skeleton height={104} />
          </div>
          <Skeleton height={340} />
          <Skeleton height={240} />
        </div>
      </RetailShell>
    );
  }

  if (query.isError) {
    return (
      <RetailShell
        title="Setup"
        description="Complete the retail operating model, then pin the default branch, register, branding, policy, and accounting map."
        actions={actions}
      >
        <Alert tone="danger" title="The setup checklist would not load">
          {getApiErrorMessage(query.error)}
        </Alert>
      </RetailShell>
    );
  }

  const readiness = query.data.readiness;
  const counts = query.data.counts;
  const sections = query.data.sections;

  return (
    <RetailShell
      title="Setup"
      description="Complete the retail operating model, then pin the default branch, register, branding, policy, and accounting map."
      actions={actions}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Completion"
          value={`${readiness.percent}%`}
          tone={readiness.percent === 100 ? "success" : "warn"}
          footer={`${readiness.completed} of ${readiness.total} checks`}
        />
        <StatCard
          label="Branches"
          value={`${counts.activeSites}/${counts.totalSites}`}
          footer="Active of total"
        />
        <StatCard
          label="Registers"
          value={`${counts.activeRegisters}/${counts.totalRegisters}`}
          footer={`${counts.openShifts} shift${counts.openShifts === 1 ? "" : "s"} open`}
        />
        <StatCard label="Accounts" value={String(counts.accounts)} footer="Mapped for posting" />
      </div>

      <Card
        title="Setup coverage by area"
        subtitle="Branch, register, receipt, policy and accounting have to line up before the tills open."
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <AdminDualBarChart
            rows={readinessRows}
            primaryLabel="Configured"
            secondaryLabel="Missing"
            height={300}
            valueFormatter={(value) => value.toString()}
            emptyLabel="No setup areas are defined."
          />
          <AdminDonutChart
            rows={readinessDonut}
            valueLabel="Setup checks"
            valueFormatter={(value) => value.toString()}
            height={300}
            emptyLabel="No setup checks to show."
          />
        </div>
      </Card>

      <Card title="What still needs attention" flush>
        {sections.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nothing left to configure"
              body="Every setup area reports itself complete."
            />
          </div>
        ) : (
          <ul className="list-plain">
            {sections.map((section) => (
              <li key={section.id}>
                <Link href={section.href} className="list-item">
                  <span className="lead" aria-hidden="true" />
                  <div>
                    <div className="title bold">{section.label}</div>
                    <div className="sub">{section.note}</div>
                  </div>
                  <div className="meta">
                    <span className="font-mono tabular-nums">
                      {section.completed}/{section.total}
                    </span>
                    <span>{percent(section.completed, section.total)}% complete</span>
                    <ChevronRight className="chev h-4 w-4" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </RetailShell>
  );
}

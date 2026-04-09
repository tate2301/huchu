"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { fetchReliabilityCluster } from "@/components/admin-portal/api";
import { AdminModuleLoading } from "@/components/admin-portal/admin-module-loading";
import { useAdminShell } from "@/components/admin-portal/shell/admin-shell-context";
import type { ReliabilityClusterData } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminTrendChart } from "@/components/charts/admin-headless-charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import {
  AuditExportDialog,
  AuditNoteDialog,
  AuditVerifyDialog,
  ContractEnforceDialog,
  ContractOverrideDialog,
  RemediationDialog,
  RunbookEnabledDialog,
  RunbookExecuteDialog,
  RunbookUpsertDialog,
} from "@/components/admin-portal/wizards/reliability-cluster-wizards";
import { buildRecentDayBuckets, resolveTimestamp } from "@/lib/admin-portal/chart-series";

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString();
}

function getInitialView(view?: string) {
  if (view === "contracts" || view === "runbooks" || view === "audit") return view;
  return "health";
}

function statusBadgeVariant(value: unknown) {
  const normalized = (
    typeof value === "string"
      ? value
      : value === null || value === undefined
        ? "UNKNOWN"
        : String(value)
  ).toUpperCase();
  if (normalized === "ACTIVE" || normalized === "SUCCESS" || normalized === "OPEN") return "secondary";
  if (normalized === "FAILED" || normalized === "SUSPENDED" || normalized === "RESOLVED") return "outline";
  return "outline";
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-[14px] bg-[var(--surface-muted)] px-4 py-6 text-center">
      <p className="text-sm font-semibold text-[var(--text-strong)]">{title}</p>
      <p className="mt-2 text-sm text-[var(--text-muted)]">{hint}</p>
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card className="admin-metric-card shadow-none">
      <CardHeader className="space-y-1 pb-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-mono text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-[11px] text-[var(--text-muted)]">{hint}</CardContent>
    </Card>
  );
}

export function ReliabilityClusterPage({ companyId, initialView }: { companyId?: string; initialView?: string }) {
  const { actorEmail, activeCompany, companies } = useAdminShell();
  const [data, setData] = useState<ReliabilityClusterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [view, setView] = useState(() => getInitialView(initialView));
  const [healthSearch, setHealthSearch] = useState("");
  const [contractSearch, setContractSearch] = useState("");
  const [runbookSearch, setRunbookSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActorFilter, setAuditActorFilter] = useState("all");

  useEffect(() => {
    setView(getInitialView(initialView));
  }, [initialView]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchReliabilityCluster(companyId);
        if (!ignore) setData(payload);
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load reliability cluster");
          setData(null);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [companyId, refreshKey]);

  const refresh = () => setRefreshKey((value) => value + 1);
  const scopeTitle = companyId ? `${activeCompany?.name ?? "Workspace"} reliability cluster` : "Reliability Cluster";
  const items = [
    { id: "health", label: "Health", count: data?.incidents.length ?? 0 },
    { id: "contracts", label: "Contracts", count: data?.contractEvaluations.length ?? 0 },
    { id: "runbooks", label: "Runbooks", count: data?.runbooks.length ?? 0 },
    { id: "audit", label: "Audit", count: data?.auditEvents.length ?? 0 },
  ];
  const companyNameById = useMemo(() => new Map(companies.map((company) => [company.id, company.name])), [companies]);
  const filteredIncidents = useMemo(() => {
    const term = healthSearch.trim().toLowerCase();
    return (data?.incidents ?? []).filter((incident) => !term || `${incident.companyName ?? ""} ${incident.metricKey} ${incident.message} ${incident.status} ${incident.riskLevel}`.toLowerCase().includes(term));
  }, [data?.incidents, healthSearch]);
  const filteredContracts = useMemo(() => {
    const term = contractSearch.trim().toLowerCase();
    return (data?.contractEvaluations ?? []).filter((evaluation) => !term || `${evaluation.companyName} ${evaluation.companySlug} ${evaluation.currentState} ${evaluation.recommendedState} ${evaluation.warningReason ?? ""}`.toLowerCase().includes(term));
  }, [contractSearch, data?.contractEvaluations]);
  const filteredRunbooks = useMemo(() => {
    const term = runbookSearch.trim().toLowerCase();
    return (data?.runbooks ?? []).filter((runbook) => !term || `${runbook.name} ${runbook.actionType} ${runbook.schedule ?? ""} ${runbook.riskLevel}`.toLowerCase().includes(term));
  }, [data?.runbooks, runbookSearch]);
  const filteredAudit = useMemo(() => {
    const term = auditSearch.trim().toLowerCase();
    return (data?.auditEvents ?? []).filter((event) => {
      if (auditActorFilter !== "all" && event.actor !== auditActorFilter) return false;
      return !term || `${event.actor ?? ""} ${event.action ?? ""} ${event.entityType ?? ""} ${event.entityId ?? ""} ${event.reason ?? ""}`.toLowerCase().includes(term);
    });
  }, [auditActorFilter, auditSearch, data?.auditEvents]);
  const auditActors = useMemo(() => Array.from(new Set((data?.auditEvents ?? []).map((event) => event.actor).filter((value): value is string => Boolean(value)))).sort(), [data?.auditEvents]);
  const runbookExecutions = useMemo(() => {
    const ids = new Set(filteredRunbooks.map((runbook) => runbook.id));
    return (data?.executions ?? []).filter((execution) => ids.has(execution.runbookId)).slice(0, 6);
  }, [data?.executions, filteredRunbooks]);
  const leadingContract = data?.contractEvaluations[0] ?? null;
  const openIncidentCount = data?.incidents.filter((incident) => incident.status === "OPEN").length ?? 0;
  const highRiskCount = data?.incidents.filter((incident) => incident.riskLevel === "HIGH").length ?? 0;
  const suspendedContracts = data?.contractEvaluations.filter((evaluation) => evaluation.currentState === "SUSPENDED").length ?? 0;
  const activeRunbooks = data?.runbooks.filter((runbook) => runbook.enabled).length ?? 0;
  const healthTrendRows = useMemo(() => {
    const buckets = buildRecentDayBuckets(84, 7);
    const incidentTimes = (data?.incidents ?? [])
      .map((incident) => resolveTimestamp(incident.createdAt))
      .filter((value): value is number => value !== null);
    const highRiskTimes = (data?.incidents ?? [])
      .filter((incident) => incident.riskLevel === "HIGH")
      .map((incident) => resolveTimestamp(incident.createdAt))
      .filter((value): value is number => value !== null);
    const metricTimes = (data?.metrics ?? [])
      .map((metric) => resolveTimestamp(metric.windowEnd, metric.createdAt))
      .filter((value): value is number => value !== null);

    return buckets.map((bucket) => {
      let incidents = 0;
      let highRisk = 0;
      let metrics = 0;

      for (const value of incidentTimes) {
        if (value >= bucket.start && value < bucket.end) incidents += 1;
      }
      for (const value of highRiskTimes) {
        if (value >= bucket.start && value < bucket.end) highRisk += 1;
      }
      for (const value of metricTimes) {
        if (value >= bucket.start && value < bucket.end) metrics += 1;
      }

      return {
        label: bucket.label,
        tooltipLabel: bucket.tooltipLabel,
        incidents,
        highRisk,
        metrics,
      };
    });
  }, [data?.incidents, data?.metrics]);

  const operationsTrendRows = useMemo(() => {
    const buckets = buildRecentDayBuckets(84, 7);
    const executionTimes = (data?.executions ?? [])
      .map((execution) => resolveTimestamp(execution.startedAt, execution.createdAt))
      .filter((value): value is number => value !== null);
    const failedExecutionTimes = (data?.executions ?? [])
      .filter((execution) => execution.status === "FAILED")
      .map((execution) => resolveTimestamp(execution.startedAt, execution.createdAt))
      .filter((value): value is number => value !== null);
    const auditTimes = (data?.auditEvents ?? [])
      .map((event) => resolveTimestamp(event.timestamp))
      .filter((value): value is number => value !== null);

    return buckets.map((bucket) => {
      let runs = 0;
      let failedRuns = 0;
      let auditEvents = 0;

      for (const value of executionTimes) {
        if (value >= bucket.start && value < bucket.end) runs += 1;
      }
      for (const value of failedExecutionTimes) {
        if (value >= bucket.start && value < bucket.end) failedRuns += 1;
      }
      for (const value of auditTimes) {
        if (value >= bucket.start && value < bucket.end) auditEvents += 1;
      }

      return {
        label: bucket.label,
        tooltipLabel: bucket.tooltipLabel,
        runs,
        failedRuns,
        auditEvents,
      };
    });
  }, [data?.auditEvents, data?.executions]);

  const contractTrendRows = useMemo(() => {
    const buckets = buildRecentDayBuckets(84, 7);
    const evaluations = data?.contractEvaluations ?? [];

    return buckets.map((bucket) => {
      let blocked = 0;
      let needsAction = 0;
      let manualOverride = 0;

      for (const evaluation of evaluations) {
        const timestamp = resolveTimestamp(
          evaluation.currentStateUpdatedAt,
          evaluation.subscriptionUpdatedAt,
        );

        if (
          timestamp === null ||
          timestamp < bucket.start ||
          timestamp >= bucket.end
        ) {
          continue;
        }

        if (evaluation.currentState === "SUSPENDED") {
          blocked += 1;
        }

        if (
          evaluation.currentState === "WARNING" ||
          evaluation.recommendedState !== "ACTIVE"
        ) {
          needsAction += 1;
        }

        if (evaluation.currentState === "OVERRIDE") {
          manualOverride += 1;
        }
      }

      return {
        label: bucket.label,
        tooltipLabel: bucket.tooltipLabel,
        blocked,
        needsAction,
        manualOverride,
      };
    });
  }, [data?.contractEvaluations]);

  if (loading) {
    return (
      <AdminModuleLoading
        label="Loading reliability cluster"
      />
    );
  }
  if (!data || error) {
    return (
      <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
        <CardContent className="space-y-4 py-10">
          <p className="text-sm text-red-700">{error ?? "Reliability data is unavailable."}</p>
          <Button variant="outline" onClick={refresh}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div className="space-y-2">
          <div className="space-y-1">
            <p className="admin-page-kicker">
              {companyId ? activeCompany?.name ?? "Workspace" : "Platform"} incidents, contract posture, runbooks, and audit trail
            </p>
            <h1 className="admin-page-title">{scopeTitle}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RunbookUpsertDialog actorEmail={actorEmail} companies={companies} fixedCompanyId={companyId} triggerLabel="Create runbook" onCompleted={refresh} />
          <AuditNoteDialog actorEmail={actorEmail} companies={companies} fixedCompanyId={companyId} fixedCompanyName={activeCompany?.name} triggerLabel="Add audit note" buttonVariant="outline" onCompleted={refresh} />
          <AuditVerifyDialog fixedCompanyId={companyId} triggerLabel="Verify chain" buttonVariant="outline" onCompleted={refresh} />
          <AuditExportDialog fixedCompanyId={companyId} events={data.auditEvents} triggerLabel="Export audit" buttonVariant="outline" onCompleted={refresh} />
          {companyId && leadingContract ? (
            <>
              <ContractEnforceDialog actorEmail={actorEmail} evaluation={leadingContract} triggerLabel="Enforce contract" buttonVariant="outline" onCompleted={refresh} />
              <ContractOverrideDialog actorEmail={actorEmail} evaluation={leadingContract} triggerLabel="Override contract" buttonVariant="outline" onCompleted={refresh} />
            </>
          ) : null}
          <Button variant="ghost" size="sm" onClick={refresh}><RefreshCcw className="mr-2 h-4 w-4" />Refresh</Button>
        </div>
      </div>

      <div className="admin-metric-grid">
        <MetricCard label="Open incidents" value={openIncidentCount} hint="Open" />
        <MetricCard label="High risk" value={highRiskCount} hint="High" />
        <MetricCard label="Suspended contracts" value={suspendedContracts} hint="Blocked" />
        <MetricCard label="Enabled runbooks" value={activeRunbooks} hint="Ready" />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Health over time</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AdminTrendChart
              rows={healthTrendRows}
              series={[
                {
                  key: "incidents",
                  label: "Incidents",
                  color: "var(--primary-500)",
                },
                {
                  key: "highRisk",
                  label: "High risk",
                  color: "var(--danger-500)",
                },
                {
                  key: "metrics",
                  label: "Metric samples",
                  color: "var(--info-500)",
                },
              ]}
              valueFormatter={(value) => value.toLocaleString()}
              yTickFormatter={(value) => value.toLocaleString()}
              xTickInterval={0}
            />
          </CardContent>
        </Card>
        <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Contract state over time</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AdminTrendChart
              rows={contractTrendRows}
              series={[
                {
                  key: "needsAction",
                  label: "Needs action",
                  color: "var(--warning-500)",
                },
                {
                  key: "blocked",
                  label: "Blocked",
                  color: "var(--danger-500)",
                },
                {
                  key: "manualOverride",
                  label: "Manual override",
                  color: "var(--accent-500)",
                },
              ]}
              valueFormatter={(value) => value.toLocaleString()}
              yTickFormatter={(value) => value.toLocaleString()}
              xTickInterval={0}
            />
          </CardContent>
        </Card>
        <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Operations over time</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AdminTrendChart
              rows={operationsTrendRows}
              series={[
                {
                  key: "runs",
                  label: "Runbook runs",
                  color: "var(--success-500)",
                },
                {
                  key: "failedRuns",
                  label: "Failed runs",
                  color: "var(--warning-500)",
                },
                {
                  key: "auditEvents",
                  label: "Audit events",
                  color: "var(--accent-500)",
                },
              ]}
              valueFormatter={(value) => value.toLocaleString()}
              yTickFormatter={(value) => value.toLocaleString()}
              xTickInterval={0}
            />
          </CardContent>
        </Card>
      </div>

      <VerticalDataViews items={items} value={view} onValueChange={setView} railLabel="Reliability views">
        {view === "health" ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
              <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
                <div className="admin-panel-header">
                  <div>
                    <CardTitle className="text-base">Incident queue</CardTitle>
                    <p className="admin-panel-subtitle">Open issues, metric breaches, and active remediation work.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="font-mono">{filteredIncidents.length} incidents</Badge>
                    <Badge variant={highRiskCount > 0 ? "secondary" : "outline"} className="font-mono">{highRiskCount} high risk</Badge>
                  </div>
                </div>
                <div className="w-full md:w-80">
                  <Label className="sr-only">Search incidents</Label>
                    <Input value={healthSearch} onChange={(event) => setHealthSearch(event.target.value)} placeholder="Search workspace, metric, status, or message" className="h-9 shadow-none" />
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {filteredIncidents.length === 0 ? (
                  <div className="p-6">
                    <EmptyState title="No incidents found" hint="Adjust search." />
                  </div>
                ) : (
                  <table className="admin-reference-table w-full text-sm">
                    <thead>
                      <tr>
                        <th className="px-4 py-3">Workspace</th>
                        <th className="px-4 py-3">Metric</th>
                        <th className="px-4 py-3">Risk</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Message</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIncidents.map((incident) => (
                        <tr key={incident.id} className="align-top">
                          <td className="px-4 py-3">
                            <p className="font-medium">{incident.companyName ?? companyNameById.get(incident.companyId) ?? incident.companyId}</p>
                            <p className="text-xs text-[var(--text-muted)]">{incident.companySlug ?? incident.companyId}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p>{incident.metricKey}</p>
                            <p className="text-xs text-[var(--text-muted)]">{incident.actionType}</p>
                          </td>
                          <td className="px-4 py-3"><Badge variant="outline">{incident.riskLevel}</Badge></td>
                          <td className="px-4 py-3"><Badge variant={statusBadgeVariant(incident.status)}>{incident.status}</Badge></td>
                          <td className="px-4 py-3 text-[var(--text-muted)]">{incident.message}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Link href={incident.companyId ? `/admin/company/${incident.companyId}/reliability?view=health` : "/admin/reliability?view=health"} className="inline-flex items-center rounded-md border border-[var(--border)] px-3 py-2 text-xs font-medium hover:bg-[var(--surface-muted)]">Open</Link>
                              {incident.status !== "RESOLVED" ? <RemediationDialog actorEmail={actorEmail} incident={incident} triggerLabel="Remediate" onCompleted={refresh} /> : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <div className="space-y-3 xl:sticky xl:top-20">
              <Card className="admin-side-panel bg-[var(--surface-base)] shadow-none">
                <CardHeader className="pb-1">
                  <CardTitle className="text-base">Posture summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-xl bg-[var(--surface-muted)] px-3 py-2.5"><span className="text-[var(--text-muted)]">Open incidents</span><span className="font-mono text-[var(--text-strong)]">{openIncidentCount}</span></div>
                  <div className="flex items-center justify-between rounded-xl bg-[var(--surface-muted)] px-3 py-2.5"><span className="text-[var(--text-muted)]">High risk</span><span className="font-mono text-[var(--text-strong)]">{highRiskCount}</span></div>
                  <div className="flex items-center justify-between rounded-xl bg-[var(--surface-muted)] px-3 py-2.5"><span className="text-[var(--text-muted)]">Enabled runbooks</span><span className="font-mono text-[var(--text-strong)]">{activeRunbooks}</span></div>
                </CardContent>
              </Card>

              <Card className="admin-side-panel bg-[var(--surface-base)] shadow-none">
                <CardHeader className="pb-1">
                  <CardTitle className="text-base">Recent metric snapshots</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.metrics.slice(0, 5).map((metric) => (
                    <div key={metric.id} className="rounded-xl bg-[var(--surface-muted)] p-2.5 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{metric.metricKey}</p>
                        <Badge variant="outline">{metric.status}</Badge>
                      </div>
                      <p className="mt-2 font-mono text-lg text-[var(--text-strong)]">{metric.value}</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">{metric.companyName ?? companyNameById.get(metric.companyId) ?? metric.companyId}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}
        {view === "contracts" ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
                <div className="admin-panel-header">
                  <div>
                    <CardTitle className="text-base">Contract posture</CardTitle>
                    <p className="admin-panel-subtitle">See which workspaces are healthy, blocked, or require manual intervention.</p>
                  </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="font-mono">{filteredContracts.length} workspaces</Badge>
                  <Badge variant={suspendedContracts > 0 ? "secondary" : "outline"} className="font-mono">{suspendedContracts} suspended</Badge>
                </div>
              </div>
                <div className="w-full md:w-80">
                  <Label className="sr-only">Search contracts</Label>
                <Input value={contractSearch} onChange={(event) => setContractSearch(event.target.value)} placeholder="Search workspace, state, or warning" className="h-9 shadow-none" />
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {filteredContracts.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="No contract records found" hint="Adjust search." />
                </div>
              ) : (
                <table className="admin-reference-table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="px-4 py-3">Workspace</th>
                      <th className="px-4 py-3">Subscription</th>
                      <th className="px-4 py-3">Current</th>
                      <th className="px-4 py-3">Recommended</th>
                      <th className="px-4 py-3">Warning</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContracts.map((evaluation) => (
                      <tr key={evaluation.companyId} className="align-top">
                        <td className="px-4 py-3">
                          <p className="font-medium">{evaluation.companyName}</p>
                          <p className="text-xs text-[var(--text-muted)]">{evaluation.companySlug}</p>
                        </td>
                        <td className="px-4 py-3">{evaluation.subscriptionStatus ?? "No subscription"}</td>
                        <td className="px-4 py-3"><Badge variant={statusBadgeVariant(evaluation.currentState)}>{evaluation.currentState}</Badge></td>
                        <td className="px-4 py-3"><Badge variant="outline">{evaluation.recommendedState}</Badge></td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{evaluation.warningReason ?? "No warning"}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <ContractEnforceDialog actorEmail={actorEmail} evaluation={evaluation} triggerLabel="Enforce" onCompleted={refresh} />
                            <ContractOverrideDialog actorEmail={actorEmail} evaluation={evaluation} triggerLabel="Override" onCompleted={refresh} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        ) : null}
        {view === "runbooks" ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
              <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
                <div className="admin-panel-header">
                  <div>
                    <CardTitle className="text-base">Runbook catalog</CardTitle>
                    <p className="admin-panel-subtitle">Automation policies and manual runbooks available to the operator team.</p>
                  </div>
                  <Badge variant="outline" className="font-mono">{filteredRunbooks.length} runbooks</Badge>
                </div>
                <div className="w-full md:w-80">
                  <Label className="sr-only">Search runbooks</Label>
                  <Input value={runbookSearch} onChange={(event) => setRunbookSearch(event.target.value)} placeholder="Search runbook name, action type, or schedule" className="h-9 shadow-none" />
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {filteredRunbooks.length === 0 ? (
                  <div className="p-6">
                    <EmptyState title="No runbooks found" hint="Create one or adjust search." />
                  </div>
                ) : (
                  <table className="admin-reference-table w-full text-sm">
                    <thead>
                      <tr>
                        <th className="px-4 py-3">Runbook</th>
                        <th className="px-4 py-3">Scope</th>
                        <th className="px-4 py-3">Risk</th>
                        <th className="px-4 py-3">Schedule</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRunbooks.map((runbook) => (
                        <tr key={runbook.id} className="align-top">
                          <td className="px-4 py-3">
                            <p className="font-medium">{runbook.name}</p>
                            <p className="text-xs text-[var(--text-muted)]">{runbook.actionType}</p>
                          </td>
                          <td className="px-4 py-3 text-[var(--text-muted)]">{runbook.companyId ? companyNameById.get(runbook.companyId) ?? runbook.companyId : "Platform"}</td>
                          <td className="px-4 py-3"><Badge variant="outline">{runbook.riskLevel}</Badge></td>
                          <td className="px-4 py-3 text-[var(--text-muted)]">{runbook.schedule ?? "Manual only"}</td>
                          <td className="px-4 py-3"><Badge variant={runbook.enabled ? "secondary" : "outline"}>{runbook.enabled ? "ENABLED" : "DISABLED"}</Badge></td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap justify-end gap-2">
                              <RunbookExecuteDialog actorEmail={actorEmail} runbook={runbook} triggerLabel="Execute" onCompleted={refresh} />
                              <RunbookEnabledDialog actorEmail={actorEmail} runbook={runbook} enabled={!runbook.enabled} triggerLabel={runbook.enabled ? "Disable" : "Enable"} onCompleted={refresh} />
                              <RunbookUpsertDialog actorEmail={actorEmail} companies={companies} fixedCompanyId={companyId} runbook={runbook} triggerLabel="Edit" buttonVariant="outline" onCompleted={refresh} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <div className="space-y-3 xl:sticky xl:top-20">
              <Card className="admin-side-panel bg-[var(--surface-base)] shadow-none">
                <CardHeader className="pb-1">
                  <CardTitle className="text-base">Recent executions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {runbookExecutions.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">No recent executions.</p>
                  ) : (
                    runbookExecutions.map((execution) => (
                      <div key={execution.id} className="rounded-xl bg-[var(--surface-muted)] p-2.5 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{execution.runbookName ?? execution.runbookId}</p>
                          <Badge variant={statusBadgeVariant(execution.status)}>{execution.status}</Badge>
                        </div>
                        <p className="mt-2 text-[var(--text-muted)]">{execution.dryRun ? "Dry run" : "Live execution"}</p>
                        <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">Started {formatDate(execution.startedAt)}</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}

        {view === "audit" ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
              <div className="admin-panel-header">
                  <div>
                    <CardTitle className="text-base">Audit ledger</CardTitle>
                    <p className="admin-panel-subtitle">Verified operator actions, policy changes, and export history.</p>
                  </div>
                <div className="flex flex-wrap gap-2">
                  <AuditVerifyDialog fixedCompanyId={companyId} triggerLabel="Verify chain" onCompleted={refresh} />
                  <AuditExportDialog fixedCompanyId={companyId} events={data.auditEvents} triggerLabel="Export" onCompleted={refresh} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                <div className="admin-table-search">
                  <Input value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="Search actor, action, target, or reason" className="h-9 shadow-none" />
                </div>
                <div>
                  <Label className="sr-only">Actor</Label>
                  <Select value={auditActorFilter} onValueChange={setAuditActorFilter}>
                    <SelectTrigger className="h-9 shadow-none"><SelectValue placeholder="All actors" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All actors</SelectItem>
                      {auditActors.map((actor) => <SelectItem key={actor} value={actor}>{actor}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {filteredAudit.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="No audit events found" hint="Adjust filters." />
                </div>
              ) : (
                <table className="admin-reference-table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Actor</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Target</th>
                      <th className="px-4 py-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAudit.map((event) => (
                      <tr key={event.id} className="align-top">
                        <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">{formatDate(event.timestamp)}</td>
                        <td className="px-4 py-3">{event.actor ?? "Unknown actor"}</td>
                        <td className="px-4 py-3">{event.action ?? "Unknown action"}</td>
                        <td className="px-4 py-3">
                          <p>{event.entityType ?? "Unknown entity"}</p>
                          <p className="text-xs text-[var(--text-muted)]">{event.entityId ?? event.companyId ?? "No target id"}</p>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{event.reason ?? "No reason provided"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        ) : null}
      </VerticalDataViews>
    </section>
  );
}

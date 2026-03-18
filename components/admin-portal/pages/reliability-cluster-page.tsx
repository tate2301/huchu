"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { fetchReliabilityCluster } from "@/components/admin-portal/api";
import { useAdminShell } from "@/components/admin-portal/shell/admin-shell-context";
import type { ReliabilityClusterData } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString();
}

function getInitialView(view?: string) {
  if (view === "contracts" || view === "runbooks" || view === "audit") return view;
  return "health";
}

function statusBadgeVariant(value: string) {
  const normalized = value.toUpperCase();
  if (normalized === "ACTIVE" || normalized === "SUCCESS" || normalized === "OPEN") return "secondary";
  if (normalized === "FAILED" || normalized === "SUSPENDED" || normalized === "RESOLVED") return "outline";
  return "outline";
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-[var(--border)] px-5 py-10 text-center">
      <p className="text-sm font-semibold text-[var(--text-strong)]">{title}</p>
      <p className="mt-2 text-sm text-[var(--text-muted)]">{hint}</p>
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card className="border-[var(--border)] shadow-none">
      <CardHeader className="space-y-2 pb-3">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-mono text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-xs text-[var(--text-muted)]">{hint}</CardContent>
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

  if (loading) {
    return <Card className="border-[var(--border)]"><CardContent className="py-10 text-sm text-[var(--text-muted)]">Loading reliability cluster...</CardContent></Card>;
  }
  if (!data || error) {
    return (
      <Card className="border-[var(--border)]">
        <CardContent className="space-y-4 py-10">
          <p className="text-sm text-red-700">{error ?? "Reliability data is unavailable."}</p>
          <Button variant="outline" onClick={refresh}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">{companyId ? "Organization scope" : "Platform scope"}</Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">Reliability cluster</Badge>
          </div>
          <h1 className="text-2xl font-semibold">{scopeTitle}</h1>
          <p className="max-w-3xl text-sm text-[var(--text-muted)]">Work incidents, contract posture, automation, and audit evidence from one operational shell without splitting context across separate pages.</p>
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Open incidents" value={openIncidentCount} hint="Live incident work that still needs a response or remediation." />
        <MetricCard label="High risk" value={highRiskCount} hint="Visible reliability issues flagged at the highest severity level." />
        <MetricCard label="Suspended contracts" value={suspendedContracts} hint="Workspaces currently failing contract posture enforcement." />
        <MetricCard label="Enabled runbooks" value={activeRunbooks} hint="Automation that is ready to execute without additional setup." />
      </div>

      <VerticalDataViews items={items} value={view} onValueChange={setView} railLabel="Reliability views">
        {view === "health" ? (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="border-[var(--border)] shadow-none">
              <CardHeader className="gap-4 border-b border-[var(--border)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Incident queue</CardTitle>
                    <CardDescription>Operational incidents with remediation entry points and enough context to act quickly.</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="font-mono">{filteredIncidents.length} incidents</Badge>
                    <Badge variant={highRiskCount > 0 ? "secondary" : "outline"} className="font-mono">{highRiskCount} high risk</Badge>
                  </div>
                </div>
                <div className="w-full md:w-80">
                  <Label className="sr-only">Search incidents</Label>
                  <Input value={healthSearch} onChange={(event) => setHealthSearch(event.target.value)} placeholder="Search workspace, metric, status, or message" className="h-10 rounded-xl" />
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {filteredIncidents.length === 0 ? (
                  <div className="p-6">
                    <EmptyState title="No incidents found" hint="Broaden the search or wait for new health signals to appear." />
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
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
                        <tr key={incident.id} className="border-t border-[var(--border)] align-top">
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

            <div className="space-y-4 xl:sticky xl:top-24">
              <Card className="border-[var(--border)] shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Posture summary</CardTitle>
                  <CardDescription>Keep the live risk picture beside the queue instead of below it.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-2xl bg-[var(--surface-muted)] px-3 py-3"><span className="text-[var(--text-muted)]">Open incidents</span><span className="font-mono text-[var(--text-strong)]">{openIncidentCount}</span></div>
                  <div className="flex items-center justify-between rounded-2xl bg-[var(--surface-muted)] px-3 py-3"><span className="text-[var(--text-muted)]">High risk</span><span className="font-mono text-[var(--text-strong)]">{highRiskCount}</span></div>
                  <div className="flex items-center justify-between rounded-2xl bg-[var(--surface-muted)] px-3 py-3"><span className="text-[var(--text-muted)]">Enabled runbooks</span><span className="font-mono text-[var(--text-strong)]">{activeRunbooks}</span></div>
                </CardContent>
              </Card>

              <Card className="border-[var(--border)] shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Recent metric snapshots</CardTitle>
                  <CardDescription>Latest reliability samples tied to the visible incident context.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.metrics.slice(0, 5).map((metric) => (
                    <div key={metric.id} className="rounded-2xl bg-[var(--surface-muted)] p-3 text-sm">
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
          <Card className="border-[var(--border)] shadow-none">
            <CardHeader className="gap-4 border-b border-[var(--border)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Contract posture</CardTitle>
                  <CardDescription>Current and recommended contract states with direct operator controls where action is available.</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="font-mono">{filteredContracts.length} workspaces</Badge>
                  <Badge variant={suspendedContracts > 0 ? "secondary" : "outline"} className="font-mono">{suspendedContracts} suspended</Badge>
                </div>
              </div>
              <div className="w-full md:w-80">
                <Label className="sr-only">Search contracts</Label>
                <Input value={contractSearch} onChange={(event) => setContractSearch(event.target.value)} placeholder="Search workspace, state, or warning" className="h-10 rounded-xl" />
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {filteredContracts.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="No contract records found" hint="Try a broader search or revisit once commercial posture updates complete." />
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
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
                      <tr key={evaluation.companyId} className="border-t border-[var(--border)] align-top">
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
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="border-[var(--border)] shadow-none">
              <CardHeader className="gap-4 border-b border-[var(--border)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Runbook catalog</CardTitle>
                    <CardDescription>Automation definitions with explicit enablement and execution controls only where they apply.</CardDescription>
                  </div>
                  <Badge variant="outline" className="font-mono">{filteredRunbooks.length} runbooks</Badge>
                </div>
                <div className="w-full md:w-80">
                  <Label className="sr-only">Search runbooks</Label>
                  <Input value={runbookSearch} onChange={(event) => setRunbookSearch(event.target.value)} placeholder="Search runbook name, action type, or schedule" className="h-10 rounded-xl" />
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {filteredRunbooks.length === 0 ? (
                  <div className="p-6">
                    <EmptyState title="No runbooks found" hint="Create a runbook or broaden the current search." />
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
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
                        <tr key={runbook.id} className="border-t border-[var(--border)] align-top">
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

            <div className="space-y-4 xl:sticky xl:top-24">
              <Card className="border-[var(--border)] shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Recent executions</CardTitle>
                  <CardDescription>Latest runs tied to the runbooks currently in view.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {runbookExecutions.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">No recent executions match the current runbook selection.</p>
                  ) : (
                    runbookExecutions.map((execution) => (
                      <div key={execution.id} className="rounded-2xl bg-[var(--surface-muted)] p-3 text-sm">
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
          <Card className="border-[var(--border)] shadow-none">
            <CardHeader className="gap-4 border-b border-[var(--border)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Audit ledger</CardTitle>
                  <CardDescription>Evidence-ready operator activity with actor filtering and export in the same working surface.</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AuditVerifyDialog fixedCompanyId={companyId} triggerLabel="Verify chain" onCompleted={refresh} />
                  <AuditExportDialog fixedCompanyId={companyId} events={data.auditEvents} triggerLabel="Export" onCompleted={refresh} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                <div className="space-y-1">
                  <Label className="sr-only">Search audit</Label>
                  <Input value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="Search actor, action, target, or reason" className="h-10 rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label className="sr-only">Actor</Label>
                  <Select value={auditActorFilter} onValueChange={setAuditActorFilter}>
                    <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="All actors" /></SelectTrigger>
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
                  <EmptyState title="No audit events found" hint="Broaden the filters or export the full ledger from a wider scope." />
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
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
                      <tr key={event.id} className="border-t border-[var(--border)] align-top">
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

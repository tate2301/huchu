"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { CircleUserRound, Clock3, Eye, RefreshCcw, Search } from "@/lib/icons";
import { fetchSupportAccessHub } from "@/components/admin-portal/api";
import { AdminModuleLoading } from "@/components/admin-portal/admin-module-loading";
import {
  AdminStackedBarChart,
  AdminTrendChart,
} from "@/components/charts/admin-headless-charts";
import { useAdminShell } from "@/components/admin-portal/shell/admin-shell-context";
import type { SupportAccessHubData } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { buildRecentDayBuckets, resolveTimestamp } from "@/lib/admin-portal/chart-series";
import {
  SupportApprovalDialog,
  SupportEndDialog,
  SupportRequestDialog,
  SupportStartDialog,
} from "@/components/admin-portal/wizards/identity-hub-wizards";

type SupportView = "requests" | "launch" | "sessions";

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString();
}

function StatusBadge({ value }: { value: unknown }) {
  const label =
    typeof value === "string"
      ? value
      : value === null || value === undefined
        ? "UNKNOWN"
        : String(value);
  const normalized = label.toUpperCase();
  const variant =
    normalized === "ACTIVE" || normalized === "APPROVED"
      ? "secondary"
      : normalized === "REQUESTED"
        ? "outline"
        : normalized === "DENIED" || normalized === "REVOKED" || normalized === "EXPIRED"
          ? "destructive"
          : "outline";

  return <Badge variant={variant}>{label.replaceAll("_", " ")}</Badge>;
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

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="admin-table-search">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-9 pl-10 shadow-none" />
    </div>
  );
}

export function SupportAccessPage({ companyId }: { companyId?: string }) {
  const { actorEmail, companies, activeCompany } = useAdminShell();
  const [view, setView] = useState<SupportView>("requests");
  const [searchByView, setSearchByView] = useState<Record<SupportView, string>>({
    requests: "",
    launch: "",
    sessions: "",
  });
  const deferredSearch = useDeferredValue(searchByView[view]);
  const [data, setData] = useState<SupportAccessHubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchSupportAccessHub(companyId, deferredSearch);
        if (!ignore) {
          setData(payload);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load support access");
          setData(null);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [companyId, deferredSearch, refreshKey, view]);

  const refresh = () => setRefreshKey((value) => value + 1);
  const scopeLabel = companyId ? `${activeCompany?.name ?? "Workspace"} support access` : "Support Access";
  const requestRows = useMemo(() => data?.requests ?? [], [data?.requests]);
  const sessionRows = useMemo(() => data?.sessions ?? [], [data?.sessions]);
  const approvedRequests = requestRows.filter((row) => row.status === "APPROVED");
  const activeSessions = sessionRows.filter((row) => row.status === "ACTIVE");
  const requestQueue = requestRows.filter((row) => row.status === "REQUESTED").length;
  const shadowSessions = activeSessions.filter((row) => row.mode === "SHADOW").length;
  const requestTrendRows = useMemo(() => {
    const buckets = buildRecentDayBuckets(84, 7);

    return buckets.map((bucket) => {
      let requested = 0;
      let approved = 0;

      for (const request of requestRows) {
        const requestedAt = resolveTimestamp(request.requestedAt, request.createdAt);
        const approvedAt = resolveTimestamp(request.approvedAt, request.updatedAt);

        if (requestedAt !== null && requestedAt >= bucket.start && requestedAt < bucket.end) {
          requested += 1;
        }

        if (
          request.status === "APPROVED" &&
          approvedAt !== null &&
          approvedAt >= bucket.start &&
          approvedAt < bucket.end
        ) {
          approved += 1;
        }
      }

      return {
        label: bucket.label,
        tooltipLabel: bucket.tooltipLabel,
        requested,
        approved,
      };
    });
  }, [requestRows]);
  const requestOutcomeRows = useMemo(() => {
    const buckets = buildRecentDayBuckets(84, 7);

    return buckets.map((bucket) => {
      let approved = 0;
      let denied = 0;
      let expired = 0;

      for (const request of requestRows) {
        const decisionAt = resolveTimestamp(
          request.approvedAt,
          request.updatedAt,
          request.expiresAt,
          request.requestedAt,
        );

        if (decisionAt === null || decisionAt < bucket.start || decisionAt >= bucket.end) {
          continue;
        }

        if (request.status === "APPROVED") approved += 1;
        if (request.status === "DENIED" || request.status === "REVOKED") denied += 1;
        if (request.status === "EXPIRED") expired += 1;
      }

      return {
        label: bucket.label,
        tooltipLabel: bucket.tooltipLabel,
        approved,
        denied,
        expired,
      };
    });
  }, [requestRows]);
  const sessionTrendRows = useMemo(() => {
    const buckets = buildRecentDayBuckets(84, 7);

    return buckets.map((bucket) => {
      let started = 0;
      let shadow = 0;

      for (const session of sessionRows) {
        const startedAt = resolveTimestamp(session.startedAt, session.createdAt);
        if (startedAt === null || startedAt < bucket.start || startedAt >= bucket.end) {
          continue;
        }

        started += 1;
        if (session.mode === "SHADOW") shadow += 1;
      }

      return {
        label: bucket.label,
        tooltipLabel: bucket.tooltipLabel,
        started,
        shadow,
      };
    });
  }, [sessionRows]);
  const sessionLifecycleRows = useMemo(() => {
    const buckets = buildRecentDayBuckets(84, 7);

    return buckets.map((bucket) => {
      let ended = 0;
      let expired = 0;
      let revoked = 0;

      for (const session of sessionRows) {
        const endedAt = resolveTimestamp(session.endedAt);
        const updatedAt = resolveTimestamp(session.updatedAt, session.expiresAt);

        if (endedAt !== null && endedAt >= bucket.start && endedAt < bucket.end) {
          ended += 1;
        }

        if (
          session.status === "EXPIRED" &&
          updatedAt !== null &&
          updatedAt >= bucket.start &&
          updatedAt < bucket.end
        ) {
          expired += 1;
        }

        if (
          session.status === "REVOKED" &&
          updatedAt !== null &&
          updatedAt >= bucket.start &&
          updatedAt < bucket.end
        ) {
          revoked += 1;
        }
      }

      return {
        label: bucket.label,
        tooltipLabel: bucket.tooltipLabel,
        ended,
        expired,
        revoked,
      };
    });
  }, [sessionRows]);

  const items = useMemo(
    () => [
      { id: "requests", label: "Requests", count: requestRows.length },
      { id: "launch", label: "Ready to launch", count: approvedRequests.length },
      { id: "sessions", label: "Sessions", count: sessionRows.length },
    ],
    [approvedRequests.length, requestRows.length, sessionRows.length],
  );

  if (loading) {
    return (
      <AdminModuleLoading
        label={companyId ? "Loading workspace support access" : "Loading support access"}
      />
    );
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div className="space-y-2">
          <div className="space-y-1">
            <p className="admin-page-kicker">
              {companyId ? activeCompany?.name ?? "Workspace" : "Platform"} support requests, launch readiness, and live sessions
            </p>
            <h1 className="admin-page-title">{scopeLabel}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SupportRequestDialog
            actorEmail={actorEmail}
            companies={companies}
            fixedCompanyId={companyId}
            triggerLabel="Request support"
            onCompleted={refresh}
          />
          <Button variant="ghost" size="sm" onClick={refresh}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="admin-metric-grid">
        <MetricCard label="Open requests" value={requestQueue} hint="Pending" />
        <MetricCard label="Ready to launch" value={approvedRequests.length} hint="Approved" />
        <MetricCard label="Active sessions" value={activeSessions.length} hint="Live" />
        <MetricCard label="Shadow sessions" value={shadowSessions} hint="Observe only" />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Requests over time</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AdminTrendChart
              rows={requestTrendRows}
              series={[
                { key: "requested", label: "Requested", color: "var(--warning-500)" },
                { key: "approved", label: "Approved", color: "var(--success-500)" },
              ]}
              valueFormatter={(value) => value.toLocaleString()}
              yTickFormatter={(value) => value.toLocaleString()}
              xTickInterval={0}
            />
          </CardContent>
        </Card>
        <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Request outcomes</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AdminStackedBarChart
              rows={requestOutcomeRows}
              series={[
                { key: "approved", label: "Approved", color: "var(--success-500)" },
                { key: "denied", label: "Denied", color: "var(--danger-500)" },
                { key: "expired", label: "Expired", color: "var(--accent-500)" },
              ]}
              valueFormatter={(value) => value.toLocaleString()}
              yTickFormatter={(value) => value.toLocaleString()}
              xTickInterval={0}
            />
          </CardContent>
        </Card>
        <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sessions over time</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AdminTrendChart
              rows={sessionTrendRows}
              series={[
                { key: "started", label: "Started", color: "var(--primary-500)" },
                { key: "shadow", label: "Shadow", color: "var(--accent-500)" },
              ]}
              valueFormatter={(value) => value.toLocaleString()}
              yTickFormatter={(value) => value.toLocaleString()}
              xTickInterval={0}
            />
          </CardContent>
        </Card>
        <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Session lifecycle</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AdminStackedBarChart
              rows={sessionLifecycleRows}
              series={[
                { key: "ended", label: "Ended", color: "var(--primary-500)" },
                { key: "expired", label: "Expired", color: "var(--warning-500)" },
                { key: "revoked", label: "Revoked", color: "var(--danger-500)" },
              ]}
              valueFormatter={(value) => value.toLocaleString()}
              yTickFormatter={(value) => value.toLocaleString()}
              xTickInterval={0}
            />
          </CardContent>
        </Card>
      </div>

      <VerticalDataViews items={items} value={view} onValueChange={(nextValue) => setView(nextValue as SupportView)} railLabel="Support views">
        {error ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardContent className="py-10 text-sm text-red-700">{error}</CardContent>
          </Card>
        ) : null}

        {!error && view === "requests" ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
                <div className="admin-panel-header">
                  <div>
                    <CardTitle className="text-base">Support request queue</CardTitle>
                    <p className="admin-panel-subtitle">Queue and approve inbound support access requests.</p>
                  </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="font-mono">
                    {requestRows.length} requests
                  </Badge>
                  <Badge variant={requestQueue > 0 ? "secondary" : "outline"} className="font-mono">
                    {requestQueue} pending
                  </Badge>
                </div>
              </div>
              <SearchField
                value={searchByView.requests}
                onChange={(value) => setSearchByView((current) => ({ ...current, requests: value }))}
                placeholder="Search requester, workspace, scope, or reason"
              />
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {requestRows.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="No support requests found" hint="Requests will appear here." />
                </div>
              ) : (
                <table className="admin-reference-table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="px-4 py-3">Workspace</th>
                      <th className="px-4 py-3">Requested by</th>
                      <th className="px-4 py-3">Scope</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Requested</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestRows.map((request) => (
                      <tr key={request.id} className="align-top">
                        <td className="px-4 py-3">
                          <p className="font-medium">{request.companyName ?? request.companyId}</p>
                          <p className="text-xs text-[var(--text-muted)]">{request.companySlug ?? request.companyId}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p>{request.requestedBy}</p>
                          <p className="text-xs text-[var(--text-muted)]">{request.reason}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{request.scope}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={request.status} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-[var(--text-muted)]">{formatDate(request.requestedAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            {request.status === "REQUESTED" ? (
                              <>
                                <SupportApprovalDialog actorEmail={actorEmail} request={request} approve={true} triggerLabel="Approve" onCompleted={refresh} />
                                <SupportApprovalDialog actorEmail={actorEmail} request={request} approve={false} triggerLabel="Deny" buttonVariant="destructive" onCompleted={refresh} />
                              </>
                            ) : null}
                            {request.status === "APPROVED" ? (
                              <SupportStartDialog actorEmail={actorEmail} request={request} triggerLabel="Start session" onCompleted={refresh} />
                            ) : null}
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

        {!error && view === "launch" ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
              <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
                <div className="admin-panel-header">
                  <div>
                    <CardTitle className="text-base">Approved requests ready to launch</CardTitle>
                    <p className="admin-panel-subtitle">Start approved sessions and move directly into workspace support.</p>
                  </div>
                  <Badge variant={approvedRequests.length > 0 ? "secondary" : "outline"} className="font-mono">
                    {approvedRequests.length} ready
                  </Badge>
                </div>
                <SearchField
                  value={searchByView.launch}
                  onChange={(value) => setSearchByView((current) => ({ ...current, launch: value }))}
                  placeholder="Search approved request, workspace, scope, or requester"
                />
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {approvedRequests.length === 0 ? (
                  <div className="p-6">
                    <EmptyState title="No approved requests" hint="Nothing ready." />
                  </div>
                ) : (
                  <table className="admin-reference-table w-full text-sm">
                    <thead>
                      <tr>
                        <th className="px-4 py-3">Workspace</th>
                        <th className="px-4 py-3">Requested by</th>
                        <th className="px-4 py-3">Scope</th>
                        <th className="px-4 py-3 text-right">Approved</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvedRequests.map((request) => (
                        <tr key={request.id} className="align-top">
                          <td className="px-4 py-3">
                            <p className="font-medium">{request.companyName ?? request.companyId}</p>
                            <p className="text-xs text-[var(--text-muted)]">{request.companySlug ?? request.companyId}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p>{request.requestedBy}</p>
                            <p className="text-xs text-[var(--text-muted)]">{request.reason}</p>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{request.scope}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-[var(--text-muted)]">{formatDate(request.updatedAt ?? request.requestedAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap justify-end gap-2">
                              <SupportStartDialog actorEmail={actorEmail} request={request} triggerLabel="Launch session" onCompleted={refresh} />
                              {request.companyId ? (
                                <Button asChild variant="outline" size="sm">
                                  <Link href={`/admin/company/${request.companyId}/identity`}>Open identity</Link>
                                </Button>
                              ) : null}
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
                  <CardTitle className="text-base">Launch modes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5 text-sm text-[var(--text-muted)]">
                  <div className="flex items-start gap-2.5 rounded-xl bg-[var(--surface-muted)] px-3 py-2.5">
                    <CircleUserRound className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-strong)]" />
                    <div>
                      <p className="font-medium text-[var(--text-strong)]">Impersonate</p>
                      <p>Act as user.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 rounded-xl bg-[var(--surface-muted)] px-3 py-2.5">
                    <Eye className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-strong)]" />
                    <div>
                      <p className="font-medium text-[var(--text-strong)]">Shadow</p>
                      <p>Observe only.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 rounded-xl bg-[var(--surface-muted)] px-3 py-2.5">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-strong)]" />
                    <div>
                      <p className="font-medium text-[var(--text-strong)]">Expiry</p>
                      <p>Time-bound.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}

        {!error && view === "sessions" ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
                <div className="admin-panel-header">
                  <div>
                    <CardTitle className="text-base">Active and recent sessions</CardTitle>
                    <p className="admin-panel-subtitle">Track who is in a workspace, how they entered, and when the session ends.</p>
                  </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="font-mono">
                    {sessionRows.length} sessions
                  </Badge>
                  <Badge variant={activeSessions.length > 0 ? "secondary" : "outline"} className="font-mono">
                    {activeSessions.length} active
                  </Badge>
                </div>
              </div>
              <SearchField
                value={searchByView.sessions}
                onChange={(value) => setSearchByView((current) => ({ ...current, sessions: value }))}
                placeholder="Search actor, workspace, mode, scope, or status"
              />
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {sessionRows.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="No support sessions found" hint="Sessions will appear here." />
                </div>
              ) : (
                <table className="admin-reference-table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="px-4 py-3">Workspace</th>
                      <th className="px-4 py-3">Actor</th>
                      <th className="px-4 py-3">Mode</th>
                      <th className="px-4 py-3">Scope</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Expires</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionRows.map((session) => (
                      <tr key={session.id} className="align-top">
                        <td className="px-4 py-3">
                          <p className="font-medium">{session.companyName ?? session.companyId}</p>
                          <p className="text-xs text-[var(--text-muted)]">{session.companySlug ?? session.companyId}</p>
                        </td>
                        <td className="px-4 py-3">{session.actor}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{session.mode}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{session.scope}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={session.status} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-[var(--text-muted)]">{formatDate(session.expiresAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            {session.status === "ACTIVE" ? (
                              <SupportEndDialog actorEmail={actorEmail} session={session} triggerLabel="End session" onCompleted={refresh} />
                            ) : (
                              <span className="text-xs text-[var(--text-muted)]">No actions</span>
                            )}
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
      </VerticalDataViews>
    </section>
  );
}

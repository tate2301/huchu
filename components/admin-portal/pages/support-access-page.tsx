"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { CircleUserRound, Clock3, Eye, RefreshCcw, Search } from "lucide-react";
import { fetchSupportAccessHub } from "@/components/admin-portal/api";
import { useAdminShell } from "@/components/admin-portal/shell/admin-shell-context";
import type { SupportAccessHubData } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
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

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  const variant =
    normalized === "ACTIVE" || normalized === "APPROVED"
      ? "secondary"
      : normalized === "REQUESTED"
        ? "outline"
        : normalized === "DENIED" || normalized === "REVOKED" || normalized === "EXPIRED"
          ? "destructive"
          : "outline";

  return <Badge variant={variant}>{value.replaceAll("_", " ")}</Badge>;
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
    <div className="relative w-full md:w-80">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-10 rounded-xl pl-10" />
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
  const requestRows = data?.requests ?? [];
  const sessionRows = data?.sessions ?? [];
  const approvedRequests = requestRows.filter((row) => row.status === "APPROVED");
  const activeSessions = sessionRows.filter((row) => row.status === "ACTIVE");
  const requestQueue = requestRows.filter((row) => row.status === "REQUESTED").length;
  const shadowSessions = activeSessions.filter((row) => row.mode === "SHADOW").length;

  const items = useMemo(
    () => [
      { id: "requests", label: "Requests", count: requestRows.length },
      { id: "launch", label: "Ready to launch", count: approvedRequests.length },
      { id: "sessions", label: "Sessions", count: sessionRows.length },
    ],
    [approvedRequests.length, requestRows.length, sessionRows.length],
  );

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {companyId ? "Organization scope" : "Platform scope"}
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              Support access
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold">{scopeLabel}</h1>
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Open requests" value={requestQueue} hint="Pending" />
        <MetricCard label="Ready to launch" value={approvedRequests.length} hint="Approved" />
        <MetricCard label="Active sessions" value={activeSessions.length} hint="Live" />
        <MetricCard label="Shadow sessions" value={shadowSessions} hint="Observe only" />
      </div>

      <VerticalDataViews items={items} value={view} onValueChange={(nextValue) => setView(nextValue as SupportView)} railLabel="Support views">
        {loading ? (
          <Card className="border-[var(--border)]">
            <CardContent className="py-10 text-sm text-[var(--text-muted)]">Loading support access...</CardContent>
          </Card>
        ) : error ? (
          <Card className="border-[var(--border)]">
            <CardContent className="py-10 text-sm text-red-700">{error}</CardContent>
          </Card>
        ) : null}

        {!loading && !error && view === "requests" ? (
          <Card className="border-[var(--border)] shadow-none">
            <CardHeader className="gap-4 border-b border-[var(--border)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Support request queue</CardTitle>
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
                <table className="w-full text-sm">
                  <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
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
                      <tr key={request.id} className="border-t border-[var(--border)] align-top">
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

        {!loading && !error && view === "launch" ? (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="border-[var(--border)] shadow-none">
              <CardHeader className="gap-4 border-b border-[var(--border)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Approved requests ready to launch</CardTitle>
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
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
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
                        <tr key={request.id} className="border-t border-[var(--border)] align-top">
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

            <div className="space-y-4 xl:sticky xl:top-24">
              <Card className="border-[var(--border)] shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Launch modes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-[var(--text-muted)]">
                  <div className="flex items-start gap-3 rounded-2xl bg-[var(--surface-muted)] p-3">
                    <CircleUserRound className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-strong)]" />
                    <div>
                      <p className="font-medium text-[var(--text-strong)]">Impersonate</p>
                      <p>Act as user.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-2xl bg-[var(--surface-muted)] p-3">
                    <Eye className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-strong)]" />
                    <div>
                      <p className="font-medium text-[var(--text-strong)]">Shadow</p>
                      <p>Observe only.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-2xl bg-[var(--surface-muted)] p-3">
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

        {!loading && !error && view === "sessions" ? (
          <Card className="border-[var(--border)] shadow-none">
            <CardHeader className="gap-4 border-b border-[var(--border)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Active and recent sessions</CardTitle>
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
                <table className="w-full text-sm">
                  <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
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
                      <tr key={session.id} className="border-t border-[var(--border)] align-top">
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

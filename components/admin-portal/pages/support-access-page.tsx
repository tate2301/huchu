"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { CircleUserRound, Clock3, Eye, RefreshCcw, ShieldCheck } from "lucide-react";
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

export function SupportAccessPage({ companyId }: { companyId?: string }) {
  const { actorEmail, companies, activeCompany } = useAdminShell();
  const [view, setView] = useState("requests");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
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
  }, [companyId, deferredSearch, refreshKey]);

  const refresh = () => setRefreshKey((value) => value + 1);
  const scopeLabel = companyId ? `${activeCompany?.name ?? "Workspace"} support access` : "Support Access";
  const requestRows = data?.requests ?? [];
  const sessionRows = data?.sessions ?? [];
  const approvedRequests = requestRows.filter((row) => row.status === "APPROVED");
  const activeSessions = sessionRows.filter((row) => row.status === "ACTIVE");

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
            <Badge variant="secondary" className="rounded-full px-3 py-1">{companyId ? "Organization scope" : "Platform scope"}</Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">Support access</Badge>
          </div>
          <h1 className="text-2xl font-semibold">{scopeLabel}</h1>
          <p className="max-w-3xl text-sm text-[var(--text-muted)]">
            Request, approve, launch, and terminate support sessions with explicit impersonation mode, scope, and expiration controls.
          </p>
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="border-[var(--border)]">
          <CardHeader>
            <CardDescription>Open requests</CardDescription>
            <CardTitle className="text-2xl">{requestRows.filter((row) => row.status === "REQUESTED").length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-[var(--border)]">
          <CardHeader>
            <CardDescription>Approved to launch</CardDescription>
            <CardTitle className="text-2xl">{approvedRequests.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-[var(--border)]">
          <CardHeader>
            <CardDescription>Active sessions</CardDescription>
            <CardTitle className="text-2xl">{activeSessions.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-[var(--border)]">
          <CardHeader>
            <CardDescription>Shadow sessions</CardDescription>
            <CardTitle className="text-2xl">{activeSessions.filter((row) => row.mode === "SHADOW").length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-[var(--border)]">
        <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-base">Control row</CardTitle>
            <CardDescription>Search workspace, requester, actor, session mode, or access reason without leaving support operations.</CardDescription>
          </div>
          <div className="w-full max-w-md">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search support request, actor, workspace, or reason"
              className="h-11 rounded-2xl"
            />
          </div>
        </CardHeader>
      </Card>

      <VerticalDataViews items={items} value={view} onValueChange={setView} railLabel="Support views">
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
          <Card className="border-[var(--border)]">
            <CardHeader>
              <CardTitle className="text-base">Support requests</CardTitle>
              <CardDescription>Time-bound access requests that must be approved before a session starts.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {requestRows.length === 0 ? (
                <EmptyState title="No support requests found" hint="New support requests will appear here once submitted." />
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    <tr>
                      <th className="px-3 py-2">Workspace</th>
                      <th className="px-3 py-2">Requested by</th>
                      <th className="px-3 py-2">Scope</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Requested</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestRows.map((request) => (
                      <tr key={request.id} className="border-t align-top">
                        <td className="px-3 py-3">
                          <p className="font-medium">{request.companyName ?? request.companyId}</p>
                          <p className="text-xs text-[var(--text-muted)]">{request.companySlug ?? request.companyId}</p>
                        </td>
                        <td className="px-3 py-3">
                          <p>{request.requestedBy}</p>
                          <p className="text-xs text-[var(--text-muted)]">{request.reason}</p>
                        </td>
                        <td className="px-3 py-3"><Badge variant="outline">{request.scope}</Badge></td>
                        <td className="px-3 py-3"><StatusBadge value={request.status} /></td>
                        <td className="px-3 py-3 text-xs text-[var(--text-muted)]">{formatDate(request.requestedAt)}</td>
                        <td className="px-3 py-3">
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
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <Card className="border-[var(--border)]">
              <CardHeader>
                <CardTitle className="text-base">Approved requests ready to launch</CardTitle>
                <CardDescription>Launch impersonation or shadow sessions only after approval.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {approvedRequests.length === 0 ? (
                  <EmptyState title="No approved requests" hint="Approved requests will appear here when they are ready to launch." />
                ) : (
                  approvedRequests.map((request) => (
                    <div key={request.id} className="rounded-[18px] border border-[var(--border)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{request.companyName ?? request.companyId}</p>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">{request.requestedBy} | {request.scope.replaceAll("_", " ")}</p>
                        </div>
                        <StatusBadge value={request.status} />
                      </div>
                      <p className="mt-3 text-sm text-[var(--text-muted)]">{request.reason}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <SupportStartDialog actorEmail={actorEmail} request={request} triggerLabel="Launch session" onCompleted={refresh} />
                        {request.companyId ? (
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/admin/company/${request.companyId}/identity`}>Open identity</Link>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-[var(--border)]">
              <CardHeader>
                <CardTitle className="text-base">Session mode guidance</CardTitle>
                <CardDescription>Use the safer mode for the job you are doing.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3">
                <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <CircleUserRound className="h-4 w-4 text-[var(--text-muted)]" />
                    Impersonate
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">Use when you need to reproduce the user experience exactly and take direct action inside their context.</p>
                </div>
                <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Eye className="h-4 w-4 text-[var(--text-muted)]" />
                    Shadow
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">Use when you need visibility and guidance without acting as the user directly.</p>
                </div>
                <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Clock3 className="h-4 w-4 text-[var(--text-muted)]" />
                    Time-bound
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">Every session is explicit, expires automatically, and remains visible in the operator context header.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {!loading && !error && view === "sessions" ? (
          <Card className="border-[var(--border)]">
            <CardHeader>
              <CardTitle className="text-base">Active and recent sessions</CardTitle>
              <CardDescription>Impersonation and shadow sessions with clear actor visibility and end-session controls.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {sessionRows.length === 0 ? (
                <EmptyState title="No support sessions found" hint="Approved support sessions will appear here once started." />
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    <tr>
                      <th className="px-3 py-2">Workspace</th>
                      <th className="px-3 py-2">Actor</th>
                      <th className="px-3 py-2">Mode</th>
                      <th className="px-3 py-2">Scope</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Expires</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionRows.map((session) => (
                      <tr key={session.id} className="border-t align-top">
                        <td className="px-3 py-3">
                          <p className="font-medium">{session.companyName ?? session.companyId}</p>
                          <p className="text-xs text-[var(--text-muted)]">{session.companySlug ?? session.companyId}</p>
                        </td>
                        <td className="px-3 py-3">{session.actor}</td>
                        <td className="px-3 py-3"><Badge variant="outline">{session.mode}</Badge></td>
                        <td className="px-3 py-3"><Badge variant="outline">{session.scope}</Badge></td>
                        <td className="px-3 py-3"><StatusBadge value={session.status} /></td>
                        <td className="px-3 py-3 text-xs text-[var(--text-muted)]">{formatDate(session.expiresAt)}</td>
                        <td className="px-3 py-3">
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

      <Card className="border-[var(--border)]">
        <CardContent className="flex flex-wrap items-center gap-2 py-4 text-sm text-[var(--text-muted)]">
          <ShieldCheck className="h-4 w-4" />
          Use the identity hub for people and permission work, and keep support sessions time-bound and explicit.
          <Link href={companyId ? `/admin/company/${companyId}/identity` : "/admin/identity"} className="ml-auto inline-flex items-center gap-2 font-medium text-[var(--text-strong)] underline-offset-4 hover:underline">
            Open identity hub
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}

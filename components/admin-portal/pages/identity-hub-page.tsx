"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search } from "lucide-react";
import { fetchIdentityHub } from "@/components/admin-portal/api";
import { useAdminShell } from "@/components/admin-portal/shell/admin-shell-context";
import type { IdentityHubData } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import {
  AdminStatusDialog,
  CreateAdminDialog,
  CreateUserDialog,
  PasswordResetDialog,
  SupportApprovalDialog,
  SupportEndDialog,
  SupportRequestDialog,
  SupportStartDialog,
  UserRoleDialog,
  UserStatusDialog,
} from "@/components/admin-portal/wizards/identity-hub-wizards";

type IdentityView = "admins" | "users" | "requests" | "sessions";

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString();
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  const variant =
    normalized === "ACTIVE" || normalized === "APPROVED"
      ? "secondary"
      : normalized === "REQUESTED" || normalized === "PENDING"
        ? "outline"
        : normalized === "DENIED" || normalized === "REVOKED" || normalized === "EXPIRED"
          ? "destructive"
          : "outline";

  return <Badge variant={variant}>{value.replaceAll("_", " ")}</Badge>;
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

export function IdentityHubPage({ companyId }: { companyId?: string }) {
  const { actorEmail, companies, activeCompany } = useAdminShell();
  const [view, setView] = useState<IdentityView>("admins");
  const [searchByView, setSearchByView] = useState<Record<IdentityView, string>>({
    admins: "",
    users: "",
    requests: "",
    sessions: "",
  });
  const deferredSearch = useDeferredValue(searchByView[view]);
  const [data, setData] = useState<IdentityHubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchIdentityHub(companyId, deferredSearch);
        if (!ignore) {
          setData(payload);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load identity hub");
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

  const items = useMemo(
    () => [
      { id: "admins", label: "Admins", count: data?.admins.length ?? 0 },
      { id: "users", label: "Users", count: data?.users.length ?? 0 },
      { id: "requests", label: "Support Requests", count: data?.requests.length ?? 0 },
      { id: "sessions", label: "Sessions", count: data?.sessions.length ?? 0 },
    ],
    [data],
  );

  const refresh = () => setRefreshKey((value) => value + 1);
  const scopeLabel = companyId ? activeCompany?.name ?? "Workspace identity hub" : "Platform identity hub";
  const activeAdmins = data?.admins.filter((admin) => admin.isActive).length ?? 0;
  const activeUsers = data?.users.filter((user) => user.isActive).length ?? 0;
  const pendingRequests = data?.requests.filter((request) => request.status === "REQUESTED").length ?? 0;
  const activeSessions = data?.sessions.filter((session) => session.status === "ACTIVE").length ?? 0;

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div className="space-y-2">
          <div className="space-y-1">
            <p className="admin-page-kicker">
              {companyId ? activeCompany?.name ?? "Workspace" : "Platform"} access posture and operator identities
            </p>
            <h1 className="admin-page-title">{scopeLabel}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CreateAdminDialog
            actorEmail={actorEmail}
            companies={companies}
            fixedCompanyId={companyId}
            triggerLabel="Create admin"
            onCompleted={refresh}
          />
          <CreateUserDialog
            actorEmail={actorEmail}
            companies={companies}
            fixedCompanyId={companyId}
            triggerLabel="Create user"
            buttonVariant="outline"
            onCompleted={refresh}
          />
          <SupportRequestDialog
            actorEmail={actorEmail}
            companies={companies}
            fixedCompanyId={companyId}
            triggerLabel="Request support"
            buttonVariant="outline"
            onCompleted={refresh}
          />
          <Button variant="ghost" size="sm" onClick={refresh}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="admin-metric-grid">
        <MetricCard label="Active admins" value={activeAdmins} hint="Online" />
        <MetricCard label="Active users" value={activeUsers} hint="Enabled" />
        <MetricCard label="Pending requests" value={pendingRequests} hint="Awaiting review" />
        <MetricCard label="Live sessions" value={activeSessions} hint="Open" />
      </div>

      <VerticalDataViews items={items} value={view} onValueChange={(nextValue) => setView(nextValue as IdentityView)} railLabel="Identity views">
        {loading ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardContent className="py-10 text-sm text-[var(--text-muted)]">Loading identity data...</CardContent>
          </Card>
        ) : error ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardContent className="py-10 text-sm text-red-700">{error}</CardContent>
          </Card>
        ) : null}

        {!loading && !error && view === "admins" ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
                <div className="admin-panel-header">
                  <div>
                    <CardTitle className="text-base">Admin operators</CardTitle>
                    <p className="admin-panel-subtitle">Admins with elevated portal access and workspace authority.</p>
                  </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="font-mono">
                    {data?.admins.length ?? 0} total
                  </Badge>
                  <Badge variant="secondary" className="font-mono">
                    {activeAdmins} active
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SearchField
                  value={searchByView.admins}
                  onChange={(value) => setSearchByView((current) => ({ ...current, admins: value }))}
                  placeholder="Search admin name, email, workspace, or role"
                />
                {companyId ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/clients/${companyId}`}>Open workspace overview</Link>
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {!data || data.admins.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="No admins found" hint="Create one or adjust search." />
                </div>
              ) : (
                <table className="admin-reference-table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="px-4 py-3">Admin</th>
                      {!companyId ? <th className="px-4 py-3">Workspace</th> : null}
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Updated</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.admins.map((admin) => (
                      <tr key={admin.id} className="align-top">
                        <td className="px-4 py-3">
                          <p className="font-medium">{admin.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">{admin.email}</p>
                        </td>
                        {!companyId ? (
                          <td className="px-4 py-3">
                            {admin.companyId ? (
                              <Link href={`/admin/clients/${admin.companyId}`} className="text-sm font-medium text-[var(--text-strong)] underline-offset-4 hover:underline">
                                {admin.companyName ?? admin.companyId}
                              </Link>
                            ) : (
                              <span className="text-[var(--text-muted)]">No workspace</span>
                            )}
                          </td>
                        ) : null}
                        <td className="px-4 py-3">
                          <Badge variant="outline">{admin.role}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={admin.isActive ? "ACTIVE" : "INACTIVE"} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-[var(--text-muted)]">{formatDate(admin.updatedAt ?? admin.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            {admin.isActive ? (
                              <AdminStatusDialog actorEmail={actorEmail} admin={admin} activate={false} triggerLabel="Deactivate" onCompleted={refresh} />
                            ) : (
                              <AdminStatusDialog actorEmail={actorEmail} admin={admin} activate={true} triggerLabel="Activate" onCompleted={refresh} />
                            )}
                            <PasswordResetDialog actorEmail={actorEmail} subject={admin} kind="admin" triggerLabel="Reset password" onCompleted={refresh} />
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

        {!loading && !error && view === "users" ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
                <div className="admin-panel-header">
                  <div>
                    <CardTitle className="text-base">Workspace users</CardTitle>
                    <p className="admin-panel-subtitle">Users, roles, and lifecycle changes across platform workspaces.</p>
                  </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="font-mono">
                    {data?.users.length ?? 0} total
                  </Badge>
                  <Badge variant="secondary" className="font-mono">
                    {activeUsers} active
                  </Badge>
                </div>
              </div>
              <SearchField
                value={searchByView.users}
                onChange={(value) => setSearchByView((current) => ({ ...current, users: value }))}
                placeholder="Search user name, email, workspace, or role"
              />
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {!data || data.users.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="No users found" hint="Create one or adjust search." />
                </div>
              ) : (
                <table className="admin-reference-table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="px-4 py-3">User</th>
                      {!companyId ? <th className="px-4 py-3">Workspace</th> : null}
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Updated</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((user) => (
                      <tr key={user.id} className="align-top">
                        <td className="px-4 py-3">
                          <p className="font-medium">{user.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">{user.email}</p>
                        </td>
                        {!companyId ? (
                          <td className="px-4 py-3">
                            <Link href={`/admin/clients/${user.companyId}`} className="text-sm font-medium text-[var(--text-strong)] underline-offset-4 hover:underline">
                              {user.companyName ?? user.companyId}
                            </Link>
                          </td>
                        ) : null}
                        <td className="px-4 py-3">
                          <Badge variant="outline">{user.role}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={user.isActive ? "ACTIVE" : "INACTIVE"} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-[var(--text-muted)]">{formatDate(user.updatedAt ?? user.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <UserRoleDialog actorEmail={actorEmail} user={user} triggerLabel="Change role" onCompleted={refresh} />
                            {user.isActive ? (
                              <UserStatusDialog actorEmail={actorEmail} user={user} activate={false} triggerLabel="Deactivate" onCompleted={refresh} />
                            ) : (
                              <UserStatusDialog actorEmail={actorEmail} user={user} activate={true} triggerLabel="Activate" onCompleted={refresh} />
                            )}
                            <PasswordResetDialog actorEmail={actorEmail} subject={user} kind="user" triggerLabel="Reset password" onCompleted={refresh} />
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

        {!loading && !error && view === "requests" ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
                <div className="admin-panel-header">
                  <div>
                    <CardTitle className="text-base">Support approvals</CardTitle>
                    <p className="admin-panel-subtitle">Approval queue for temporary support access and escalations.</p>
                  </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="font-mono">
                    {data?.requests.length ?? 0} requests
                  </Badge>
                  <Badge variant={pendingRequests > 0 ? "secondary" : "outline"} className="font-mono">
                    {pendingRequests} pending
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
              {!data || data.requests.length === 0 ? (
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
                    {data.requests.map((request) => (
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

        {!loading && !error && view === "sessions" ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
              <div className="admin-panel-header">
                  <div>
                    <CardTitle className="text-base">Support sessions</CardTitle>
                    <p className="admin-panel-subtitle">Track active support access, session mode, and expiry windows.</p>
                  </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="font-mono">
                    {data?.sessions.length ?? 0} sessions
                  </Badge>
                  <Badge variant={activeSessions > 0 ? "secondary" : "outline"} className="font-mono">
                    {activeSessions} active
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
              {!data || data.sessions.length === 0 ? (
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
                    {data.sessions.map((session) => (
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

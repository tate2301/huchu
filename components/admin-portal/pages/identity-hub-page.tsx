"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search, ShieldCheck, Users } from "lucide-react";
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
    <div className="rounded-[22px] border border-dashed border-[var(--border)] px-5 py-10 text-center">
      <p className="text-sm font-semibold text-[var(--text-strong)]">{title}</p>
      <p className="mt-2 text-sm text-[var(--text-muted)]">{hint}</p>
    </div>
  );
}

export function IdentityHubPage({ companyId }: { companyId?: string }) {
  const { actorEmail, companies, activeCompany } = useAdminShell();
  const [view, setView] = useState("admins");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
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
  }, [companyId, deferredSearch, refreshKey]);

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

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {companyId ? "Organization scope" : "Platform scope"}
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              Identity hub
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold">{scopeLabel}</h1>
          <p className="max-w-3xl text-sm text-[var(--text-muted)]">
            Manage admins, users, support requests, and active sessions with guided actions and workspace-aware identity context.
          </p>
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

      <Card className="border-[var(--border)]">
        <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-base">Control row</CardTitle>
            <CardDescription>Search names, emails, workspaces, or support context without leaving the active identity view.</CardDescription>
          </div>
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email, workspace, request, or session"
              className="h-11 rounded-2xl pl-10"
            />
          </div>
        </CardHeader>
      </Card>

      <VerticalDataViews items={items} value={view} onValueChange={setView} railLabel="Identity views">
        {loading ? (
          <Card className="border-[var(--border)]">
            <CardContent className="py-10 text-sm text-[var(--text-muted)]">Loading identity data...</CardContent>
          </Card>
        ) : error ? (
          <Card className="border-[var(--border)]">
            <CardContent className="py-10 text-sm text-red-700">{error}</CardContent>
          </Card>
        ) : null}

        {!loading && !error && view === "admins" ? (
          <Card className="border-[var(--border)]">
            <CardHeader>
              <CardTitle className="text-base">Admins</CardTitle>
              <CardDescription>Platform and workspace administrators with activation and password controls.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {!data || data.admins.length === 0 ? (
                <EmptyState title="No admins found" hint="Create the first workspace admin or broaden the search scope." />
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    <tr>
                      <th className="px-3 py-2">Admin</th>
                      {!companyId ? <th className="px-3 py-2">Workspace</th> : null}
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Updated</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.admins.map((admin) => (
                      <tr key={admin.id} className="border-t align-top">
                        <td className="px-3 py-3">
                          <p className="font-medium">{admin.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">{admin.email}</p>
                        </td>
                        {!companyId ? (
                          <td className="px-3 py-3">
                            {admin.companyId ? (
                              <Link href={`/admin/clients/${admin.companyId}`} className="text-sm font-medium text-[var(--text-strong)] underline-offset-4 hover:underline">
                                {admin.companyName ?? admin.companyId}
                              </Link>
                            ) : (
                              <span className="text-[var(--text-muted)]">No workspace</span>
                            )}
                          </td>
                        ) : null}
                        <td className="px-3 py-3">
                          <Badge variant="outline">{admin.role}</Badge>
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge value={admin.isActive ? "ACTIVE" : "INACTIVE"} />
                        </td>
                        <td className="px-3 py-3 text-xs text-[var(--text-muted)]">{formatDate(admin.updatedAt ?? admin.createdAt)}</td>
                        <td className="px-3 py-3">
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
          <Card className="border-[var(--border)]">
            <CardHeader>
              <CardTitle className="text-base">Users</CardTitle>
              <CardDescription>Workspace users with role, activation, and password controls.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {!data || data.users.length === 0 ? (
                <EmptyState title="No users found" hint="Create a user or widen the search scope." />
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    <tr>
                      <th className="px-3 py-2">User</th>
                      {!companyId ? <th className="px-3 py-2">Workspace</th> : null}
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Updated</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((user) => (
                      <tr key={user.id} className="border-t align-top">
                        <td className="px-3 py-3">
                          <p className="font-medium">{user.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">{user.email}</p>
                        </td>
                        {!companyId ? (
                          <td className="px-3 py-3">
                            <Link href={`/admin/clients/${user.companyId}`} className="text-sm font-medium text-[var(--text-strong)] underline-offset-4 hover:underline">
                              {user.companyName ?? user.companyId}
                            </Link>
                          </td>
                        ) : null}
                        <td className="px-3 py-3">
                          <Badge variant="outline">{user.role}</Badge>
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge value={user.isActive ? "ACTIVE" : "INACTIVE"} />
                        </td>
                        <td className="px-3 py-3 text-xs text-[var(--text-muted)]">{formatDate(user.updatedAt ?? user.createdAt)}</td>
                        <td className="px-3 py-3">
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
          <Card className="border-[var(--border)]">
            <CardHeader>
              <CardTitle className="text-base">Support requests</CardTitle>
              <CardDescription>Time-bound access requests that must be approved before a session starts.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {!data || data.requests.length === 0 ? (
                <EmptyState title="No support requests found" hint="Support requests will appear here after submission." />
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
                    {data.requests.map((request) => (
                      <tr key={request.id} className="border-t align-top">
                        <td className="px-3 py-3">
                          <p className="font-medium">{request.companyName ?? request.companyId}</p>
                          <p className="text-xs text-[var(--text-muted)]">{request.companySlug ?? request.companyId}</p>
                        </td>
                        <td className="px-3 py-3">
                          <p>{request.requestedBy}</p>
                          <p className="text-xs text-[var(--text-muted)]">{request.reason}</p>
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="outline">{request.scope}</Badge>
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge value={request.status} />
                        </td>
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

        {!loading && !error && view === "sessions" ? (
          <Card className="border-[var(--border)]">
            <CardHeader>
              <CardTitle className="text-base">Active and past sessions</CardTitle>
              <CardDescription>Impersonation and shadow sessions with clear actor visibility and termination controls.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {!data || data.sessions.length === 0 ? (
                <EmptyState title="No support sessions found" hint="Approved access sessions will appear here once started." />
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
                    {data.sessions.map((session) => (
                      <tr key={session.id} className="border-t align-top">
                        <td className="px-3 py-3">
                          <p className="font-medium">{session.companyName ?? session.companyId}</p>
                          <p className="text-xs text-[var(--text-muted)]">{session.companySlug ?? session.companyId}</p>
                        </td>
                        <td className="px-3 py-3">{session.actor}</td>
                        <td className="px-3 py-3">
                          <Badge variant="outline">{session.mode}</Badge>
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="outline">{session.scope}</Badge>
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge value={session.status} />
                        </td>
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
          <Users className="h-4 w-4" />
          Identity flows are workspace-aware, autocomplete-first, and audit-friendly. Support sessions remain explicit and time-bound.
          {companyId ? (
            <Link href={`/admin/clients/${companyId}`} className="ml-auto inline-flex items-center gap-2 font-medium text-[var(--text-strong)] underline-offset-4 hover:underline">
              <ShieldCheck className="h-4 w-4" />
              Back to workspace overview
            </Link>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

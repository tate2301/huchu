"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search } from "@/lib/icons";
import { fetchIdentityHub } from "@/components/admin-portal/api";
import { AdminModuleLoading } from "@/components/admin-portal/admin-module-loading";
import { useAdminShell } from "@/components/admin-portal/shell/admin-shell-context";
import type { IdentityHubData } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AdminDonutChart,
  AdminTrendChart,
} from "@/components/charts/admin-headless-charts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  buildRecentDayBuckets,
  resolveTimestamp,
} from "@/lib/admin-portal/chart-series";

type IdentityView = "admins" | "users" | "requests" | "sessions";
type DistributionDatum = {
  id: string;
  label: string;
  value: number;
  tone?: "default" | "warning" | "danger" | "success";
};

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
      : normalized === "REQUESTED" || normalized === "PENDING"
        ? "outline"
        : normalized === "DENIED" ||
            normalized === "REVOKED" ||
            normalized === "EXPIRED"
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

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Card className="admin-metric-card shadow-none">
      <CardHeader className="space-y-1 pb-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-mono text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-[11px] text-[var(--text-muted)]">
        {hint}
      </CardContent>
    </Card>
  );
}

function titleCaseToken(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s.-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function countBy<T>(
  items: T[],
  getKey: (item: T) => string | null | undefined,
) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = String(getKey(item) || "UNKNOWN");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
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
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 pl-10 shadow-none"
      />
    </div>
  );
}

export function IdentityHubPage({ companyId }: { companyId?: string }) {
  const { actorEmail, companies, activeCompany } = useAdminShell();
  const [view, setView] = useState<IdentityView>("admins");
  const [searchByView, setSearchByView] = useState<
    Record<IdentityView, string>
  >({
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
          setError(
            err instanceof Error ? err.message : "Failed to load identity hub",
          );
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
      {
        id: "requests",
        label: "Support Requests",
        count: data?.requests.length ?? 0,
      },
      { id: "sessions", label: "Sessions", count: data?.sessions.length ?? 0 },
    ],
    [data],
  );

  const refresh = () => setRefreshKey((value) => value + 1);
  const scopeLabel = companyId
    ? `${activeCompany?.name ?? "Workspace"} identity`
    : "Identity";
  const activeAdmins =
    data?.admins.filter((admin) => admin.isActive).length ?? 0;
  const activeUsers = data?.users.filter((user) => user.isActive).length ?? 0;
  const pendingRequests =
    data?.requests.filter((request) => request.status === "REQUESTED").length ??
    0;
  const activeSessions =
    data?.sessions.filter((session) => session.status === "ACTIVE").length ?? 0;
  const expiringSoonSessions =
    data?.sessions.filter((session) => {
      if (session.status !== "ACTIVE" || !session.expiresAt) return false;
      const expiresAt = new Date(session.expiresAt).getTime();
      const now = Date.now();
      return expiresAt > now && expiresAt - now <= 24 * 60 * 60 * 1000;
    }).length ?? 0;
  const adminUserRatio =
    activeUsers > 0 ? (activeAdmins / activeUsers).toFixed(2) : "0.00";

  const adminRoleRows = useMemo<DistributionDatum[]>(() => {
    return Array.from(countBy(data?.admins ?? [], (admin) => admin.role))
      .map(([label, value]) => ({
        id: label,
        label: titleCaseToken(label),
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [data?.admins]);

  const userRoleRows = useMemo<DistributionDatum[]>(() => {
    return Array.from(countBy(data?.users ?? [], (user) => user.role))
      .map(([label, value]) => ({
        id: label,
        label: titleCaseToken(label),
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [data?.users]);

  const sessionModeRows = useMemo<DistributionDatum[]>(() => {
    return Array.from(countBy(data?.sessions ?? [], (session) => session.mode))
      .map(([label, value]) => ({
        id: label,
        label: titleCaseToken(label),
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [data?.sessions]);

  const peopleTrendRows = useMemo(() => {
    const buckets = buildRecentDayBuckets(84, 7);
    const adminTimes = (data?.admins ?? [])
      .map((admin) => resolveTimestamp(admin.createdAt))
      .filter((value): value is number => value !== null);
    const userTimes = (data?.users ?? [])
      .map((user) => resolveTimestamp(user.createdAt))
      .filter((value): value is number => value !== null);

    return buckets.map((bucket) => {
      let admins = 0;
      let users = 0;

      for (const value of adminTimes) {
        if (value >= bucket.start && value < bucket.end) admins += 1;
      }
      for (const value of userTimes) {
        if (value >= bucket.start && value < bucket.end) users += 1;
      }

      return {
        label: bucket.label,
        tooltipLabel: bucket.tooltipLabel,
        admins,
        users,
      };
    });
  }, [data?.admins, data?.users]);

  const supportTrendRows = useMemo(() => {
    const buckets = buildRecentDayBuckets(84, 7);
    const requestTimes = (data?.requests ?? [])
      .map((request) =>
        resolveTimestamp(request.requestedAt, request.createdAt),
      )
      .filter((value): value is number => value !== null);
    const sessionTimes = (data?.sessions ?? [])
      .map((session) => resolveTimestamp(session.startedAt, session.createdAt))
      .filter((value): value is number => value !== null);

    return buckets.map((bucket) => {
      let requests = 0;
      let sessions = 0;

      for (const value of requestTimes) {
        if (value >= bucket.start && value < bucket.end) requests += 1;
      }
      for (const value of sessionTimes) {
        if (value >= bucket.start && value < bucket.end) sessions += 1;
      }

      return {
        label: bucket.label,
        tooltipLabel: bucket.tooltipLabel,
        requests,
        sessions,
      };
    });
  }, [data?.requests, data?.sessions]);

  const requestDecisionTrendRows = useMemo(() => {
    const buckets = buildRecentDayBuckets(84, 7);
    const requests = data?.requests ?? [];

    return buckets.map((bucket) => {
      let newRequests = 0;
      let approved = 0;
      let closed = 0;

      for (const request of requests) {
        const requestedAt = resolveTimestamp(
          request.requestedAt,
          request.createdAt,
        );
        if (
          requestedAt !== null &&
          requestedAt >= bucket.start &&
          requestedAt < bucket.end
        ) {
          newRequests += 1;
        }

        const approvedAt = resolveTimestamp(
          request.approvedAt,
          request.updatedAt,
        );
        if (
          (request.status === "APPROVED" || request.status === "ACTIVE") &&
          approvedAt !== null &&
          approvedAt >= bucket.start &&
          approvedAt < bucket.end
        ) {
          approved += 1;
        }

        const closedAt = resolveTimestamp(
          request.updatedAt,
          request.approvedAt,
        );
        if (
          (request.status === "DENIED" ||
            request.status === "REVOKED" ||
            request.status === "EXPIRED") &&
          closedAt !== null &&
          closedAt >= bucket.start &&
          closedAt < bucket.end
        ) {
          closed += 1;
        }
      }

      return {
        label: bucket.label,
        tooltipLabel: bucket.tooltipLabel,
        newRequests,
        approved,
        closed,
      };
    });
  }, [data?.requests]);

  const sessionActivityTrendRows = useMemo(() => {
    const buckets = buildRecentDayBuckets(84, 7);
    const sessions = data?.sessions ?? [];

    return buckets.map((bucket) => {
      let started = 0;
      let ended = 0;
      let revoked = 0;

      for (const session of sessions) {
        const startedAt = resolveTimestamp(
          session.startedAt,
          session.createdAt,
        );
        if (
          startedAt !== null &&
          startedAt >= bucket.start &&
          startedAt < bucket.end
        ) {
          started += 1;
        }

        const endedAt = resolveTimestamp(session.endedAt, session.updatedAt);
        if (
          endedAt !== null &&
          endedAt >= bucket.start &&
          endedAt < bucket.end &&
          session.status !== "ACTIVE"
        ) {
          ended += 1;
        }

        if (
          (session.status === "REVOKED" || session.status === "EXPIRED") &&
          endedAt !== null &&
          endedAt >= bucket.start &&
          endedAt < bucket.end
        ) {
          revoked += 1;
        }
      }

      return {
        label: bucket.label,
        tooltipLabel: bucket.tooltipLabel,
        started,
        ended,
        revoked,
      };
    });
  }, [data?.sessions]);

  if (loading) {
    return (
      <AdminModuleLoading
        label={
          companyId ? "Loading workspace identity" : "Loading identity hub"
        }
      />
    );
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div className="space-y-2">
          <div className="space-y-1">
            <p className="admin-page-kicker">
              {companyId ? (activeCompany?.name ?? "Workspace") : "Platform"}{" "}
              access and people
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
        <MetricCard
          label="Admins online"
          value={activeAdmins}
          hint="Active now"
        />
        <MetricCard
          label="Users active"
          value={activeUsers}
          hint="Enabled now"
        />
        <MetricCard
          label="Requests waiting"
          value={pendingRequests}
          hint="Need review"
        />
        <MetricCard
          label="Sessions live"
          value={activeSessions}
          hint="Open now"
        />
        <MetricCard
          label="Admin/user ratio"
          value={Number(adminUserRatio)}
          hint={`${adminUserRatio} to 1`}
        />
        <MetricCard
          label="Ending in 24h"
          value={expiringSoonSessions}
          hint="Live sessions"
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">People over time</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AdminTrendChart
              rows={peopleTrendRows}
              series={[
                {
                  key: "admins",
                  label: "Admins",
                  color: "var(--primary-500)",
                },
                {
                  key: "users",
                  label: "Users",
                  color: "var(--success-500)",
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
            <CardTitle className="text-base">Support over time</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AdminTrendChart
              rows={supportTrendRows}
              series={[
                {
                  key: "requests",
                  label: "Requests",
                  color: "var(--warning-500)",
                },
                {
                  key: "sessions",
                  label: "Sessions",
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

      <div className="grid gap-3 xl:grid-cols-2">
        <Card className=" bg-[var(--surface-base)] shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Request decisions over time
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AdminTrendChart
              rows={requestDecisionTrendRows}
              series={[
                {
                  key: "newRequests",
                  label: "New requests",
                  color: "var(--warning-500)",
                },
                {
                  key: "approved",
                  label: "Approved",
                  color: "var(--success-500)",
                },
                {
                  key: "closed",
                  label: "Closed",
                  color: "var(--danger-500)",
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
            <CardTitle className="text-base">
              Session activity over time
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AdminTrendChart
              rows={sessionActivityTrendRows}
              series={[
                {
                  key: "started",
                  label: "Started",
                  color: "var(--accent-500)",
                },
                {
                  key: "ended",
                  label: "Ended",
                  color: "var(--primary-500)",
                },
                {
                  key: "revoked",
                  label: "Revoked",
                  color: "var(--danger-500)",
                },
              ]}
              valueFormatter={(value) => value.toLocaleString()}
              yTickFormatter={(value) => value.toLocaleString()}
              xTickInterval={0}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Admin roles</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AdminDonutChart rows={adminRoleRows} valueLabel="Admins" />
          </CardContent>
        </Card>
        <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">User roles</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AdminDonutChart rows={userRoleRows} valueLabel="Users" />
          </CardContent>
        </Card>
        <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Session mode</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AdminDonutChart rows={sessionModeRows} valueLabel="Sessions" />
          </CardContent>
        </Card>
      </div>

      <VerticalDataViews
        items={items}
        value={view}
        onValueChange={(nextValue) => setView(nextValue as IdentityView)}
        railLabel="Identity views"
      >
        {error ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardContent className="py-10 text-sm text-red-700">
              {error}
            </CardContent>
          </Card>
        ) : null}

        {!error && view === "admins" ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
              <div className="admin-panel-header">
                <div>
                  <CardTitle className="text-base">Admins</CardTitle>
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
                  onChange={(value) =>
                    setSearchByView((current) => ({
                      ...current,
                      admins: value,
                    }))
                  }
                  placeholder="Search admin name, email, workspace, or role"
                />
                {companyId ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/clients/${companyId}`}>
                      Open workspace overview
                    </Link>
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {!data || data.admins.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No admins found"
                    hint="Create one or adjust search."
                  />
                </div>
              ) : (
                <table className="admin-reference-table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="px-4 py-3">Admin</th>
                      {!companyId ? (
                        <th className="px-4 py-3">Workspace</th>
                      ) : null}
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
                          <p className="text-xs text-[var(--text-muted)]">
                            {admin.email}
                          </p>
                        </td>
                        {!companyId ? (
                          <td className="px-4 py-3">
                            {admin.companyId ? (
                              <Link
                                href={`/admin/clients/${admin.companyId}`}
                                className="text-sm font-medium text-[var(--text-strong)] underline-offset-4 hover:underline"
                              >
                                {admin.companyName ?? admin.companyId}
                              </Link>
                            ) : (
                              <span className="text-[var(--text-muted)]">
                                No workspace
                              </span>
                            )}
                          </td>
                        ) : null}
                        <td className="px-4 py-3">
                          <Badge variant="outline">{admin.role}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            value={admin.isActive ? "ACTIVE" : "INACTIVE"}
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-[var(--text-muted)]">
                          {formatDate(admin.updatedAt ?? admin.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            {admin.isActive ? (
                              <AdminStatusDialog
                                actorEmail={actorEmail}
                                admin={admin}
                                activate={false}
                                triggerLabel="Deactivate"
                                onCompleted={refresh}
                              />
                            ) : (
                              <AdminStatusDialog
                                actorEmail={actorEmail}
                                admin={admin}
                                activate={true}
                                triggerLabel="Activate"
                                onCompleted={refresh}
                              />
                            )}
                            <PasswordResetDialog
                              actorEmail={actorEmail}
                              subject={admin}
                              kind="admin"
                              triggerLabel="Reset password"
                              onCompleted={refresh}
                            />
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

        {!error && view === "users" ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
              <div className="admin-panel-header">
                <div>
                  <CardTitle className="text-base">Users</CardTitle>
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
                onChange={(value) =>
                  setSearchByView((current) => ({ ...current, users: value }))
                }
                placeholder="Search user name, email, workspace, or role"
              />
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {!data || data.users.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No users found"
                    hint="Create one or adjust search."
                  />
                </div>
              ) : (
                <table className="admin-reference-table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="px-4 py-3">User</th>
                      {!companyId ? (
                        <th className="px-4 py-3">Workspace</th>
                      ) : null}
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
                          <p className="text-xs text-[var(--text-muted)]">
                            {user.email}
                          </p>
                        </td>
                        {!companyId ? (
                          <td className="px-4 py-3">
                            <Link
                              href={`/admin/clients/${user.companyId}`}
                              className="text-sm font-medium text-[var(--text-strong)] underline-offset-4 hover:underline"
                            >
                              {user.companyName ?? user.companyId}
                            </Link>
                          </td>
                        ) : null}
                        <td className="px-4 py-3">
                          <Badge variant="outline">{user.role}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            value={user.isActive ? "ACTIVE" : "INACTIVE"}
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-[var(--text-muted)]">
                          {formatDate(user.updatedAt ?? user.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <UserRoleDialog
                              actorEmail={actorEmail}
                              user={user}
                              triggerLabel="Change role"
                              onCompleted={refresh}
                            />
                            {user.isActive ? (
                              <UserStatusDialog
                                actorEmail={actorEmail}
                                user={user}
                                activate={false}
                                triggerLabel="Deactivate"
                                onCompleted={refresh}
                              />
                            ) : (
                              <UserStatusDialog
                                actorEmail={actorEmail}
                                user={user}
                                activate={true}
                                triggerLabel="Activate"
                                onCompleted={refresh}
                              />
                            )}
                            <PasswordResetDialog
                              actorEmail={actorEmail}
                              subject={user}
                              kind="user"
                              triggerLabel="Reset password"
                              onCompleted={refresh}
                            />
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

        {!error && view === "requests" ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
              <div className="admin-panel-header">
                <div>
                  <CardTitle className="text-base">Support requests</CardTitle>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="font-mono">
                    {data?.requests.length ?? 0} requests
                  </Badge>
                  <Badge
                    variant={pendingRequests > 0 ? "secondary" : "outline"}
                    className="font-mono"
                  >
                    {pendingRequests} pending
                  </Badge>
                </div>
              </div>
              <SearchField
                value={searchByView.requests}
                onChange={(value) =>
                  setSearchByView((current) => ({
                    ...current,
                    requests: value,
                  }))
                }
                placeholder="Search requester, workspace, scope, or reason"
              />
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {!data || data.requests.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No support requests found"
                    hint="Requests will appear here."
                  />
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
                          <p className="font-medium">
                            {request.companyName ?? request.companyId}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {request.companySlug ?? request.companyId}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p>{request.requestedBy}</p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {request.reason}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{request.scope}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={request.status} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-[var(--text-muted)]">
                          {formatDate(request.requestedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            {request.status === "REQUESTED" ? (
                              <>
                                <SupportApprovalDialog
                                  actorEmail={actorEmail}
                                  request={request}
                                  approve={true}
                                  triggerLabel="Approve"
                                  onCompleted={refresh}
                                />
                                <SupportApprovalDialog
                                  actorEmail={actorEmail}
                                  request={request}
                                  approve={false}
                                  triggerLabel="Deny"
                                  buttonVariant="destructive"
                                  onCompleted={refresh}
                                />
                              </>
                            ) : null}
                            {request.status === "APPROVED" ? (
                              <SupportStartDialog
                                actorEmail={actorEmail}
                                request={request}
                                triggerLabel="Start session"
                                onCompleted={refresh}
                              />
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

        {!error && view === "sessions" ? (
          <Card className="admin-surface bg-[var(--surface-base)] shadow-none">
            <CardHeader className="gap-3 border-b border-[var(--edge-subtle)] pb-3">
              <div className="admin-panel-header">
                <div>
                  <CardTitle className="text-base">Support sessions</CardTitle>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="font-mono">
                    {data?.sessions.length ?? 0} sessions
                  </Badge>
                  <Badge
                    variant={activeSessions > 0 ? "secondary" : "outline"}
                    className="font-mono"
                  >
                    {activeSessions} active
                  </Badge>
                </div>
              </div>
              <SearchField
                value={searchByView.sessions}
                onChange={(value) =>
                  setSearchByView((current) => ({
                    ...current,
                    sessions: value,
                  }))
                }
                placeholder="Search actor, workspace, mode, scope, or status"
              />
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {!data || data.sessions.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No support sessions found"
                    hint="Sessions will appear here."
                  />
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
                          <p className="font-medium">
                            {session.companyName ?? session.companyId}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {session.companySlug ?? session.companyId}
                          </p>
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
                        <td className="px-4 py-3 text-right font-mono text-xs text-[var(--text-muted)]">
                          {formatDate(session.expiresAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            {session.status === "ACTIVE" ? (
                              <SupportEndDialog
                                actorEmail={actorEmail}
                                session={session}
                                triggerLabel="End session"
                                onCompleted={refresh}
                              />
                            ) : (
                              <span className="text-xs text-[var(--text-muted)]">
                                No actions
                              </span>
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

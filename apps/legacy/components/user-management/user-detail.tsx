"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  Alert,
  Avatar,
  Badge,
  Button as DsButton,
  Field,
  Input,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@corelithzw/react";

import { ClientDate } from "@corelithzw/ui/components/client-date";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import { dsConfirm } from "@corelithzw/ui/components/ds-confirm";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { PermissionMatrix } from "@corelithzw/shell/permission-matrix";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import { ArrowLeft, RefreshCcw, ShieldCheck, Trash2, UserCheck, UserX } from "@corelithzw/ui/lib/icons";
import { getAllowedUserRoleOptionsForWorkspace } from "@corelithzw/platform/vertical-roles";
import {
  changeManagedUserRole,
  deleteManagedUser,
  fetchManagedUserAudit,
  fetchManagedUserDetail,
  resetManagedUserPassword,
  resetUserPermissions,
  setManagedUserStatus,
  setUserPermission,
  type ManagedUserRole,
  type PermissionEntry,
  type PermissionState,
} from "@corelithzw/platform/user-management-api";

const ACCOUNT_EVENT_LABELS: Record<string, string> = {
  USER_CREATE: "Account created",
  USER_SET_STATUS: "Status changed",
  USER_RESET_PASSWORD: "Password reset",
  USER_CHANGE_ROLE: "Role changed",
  USER_SET_FEATURE_ACCESS: "Feature access changed",
  USER_RESET_FEATURE_ACCESS: "Permissions reset",
  USER_SET_PERMISSION: "Permission changed",
  USER_DELETE: "Account deleted",
};

export function UserDetail({ userId }: { userId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const enabledFeatures = (session?.user as { enabledFeatures?: string[] } | undefined)
    ?.enabledFeatures;
  const workspaceProfile = (session?.user as { workspaceProfile?: string } | undefined)
    ?.workspaceProfile;

  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const [newPassword, setNewPassword] = React.useState("");

  const detailQuery = useQuery({
    queryKey: ["managed-user", userId],
    queryFn: () => fetchManagedUserDetail(userId),
  });

  const auditQuery = useQuery({
    queryKey: ["managed-user", userId, "audit"],
    queryFn: () => fetchManagedUserAudit(userId),
  });

  const roleOptions = React.useMemo(
    () =>
      getAllowedUserRoleOptionsForWorkspace({
        workspaceProfile,
        enabledFeatures,
      }).filter((role) => role.value !== "CLERK") as Array<{
        value: ManagedUserRole;
        label: string;
      }>,
    [enabledFeatures, workspaceProfile],
  );

  const detail = detailQuery.data;
  const user = detail?.user;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["managed-user", userId] });
    queryClient.invalidateQueries({ queryKey: ["preferences", "organization", "users"] });
  }

  const permissionMutation = useMutation({
    mutationFn: setUserPermission,
    onSuccess: (result) => {
      queryClient.setQueryData(["managed-user", userId], (current: typeof detail) =>
        current
          ? { ...current, groups: result.groups, overrideCount: result.overrideCount }
          : current,
      );
      queryClient.invalidateQueries({ queryKey: ["managed-user", userId, "audit"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to change that permission",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
      refresh();
    },
    onSettled: () => setPendingKey(null),
  });

  const resetPermissionsMutation = useMutation({
    mutationFn: () => resetUserPermissions(userId),
    onSuccess: (result) => {
      queryClient.setQueryData(["managed-user", userId], (current: typeof detail) =>
        current
          ? { ...current, groups: result.groups, overrideCount: result.overrideCount }
          : current,
      );
      toast({
        title: "Permissions reset",
        description: "This account follows its role again.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["managed-user", userId, "audit"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to reset permissions",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: setManagedUserStatus,
    onSuccess: () => {
      toast({ title: "Status updated", variant: "success" });
      refresh();
    },
    onError: (error) => {
      toast({
        title: "Unable to update status",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const roleMutation = useMutation({
    mutationFn: changeManagedUserRole,
    onSuccess: () => {
      toast({
        title: "Role changed",
        description: "Permissions left on role default moved with it.",
        variant: "success",
      });
      refresh();
    },
    onError: (error) => {
      toast({
        title: "Unable to change role",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: resetManagedUserPassword,
    onSuccess: () => {
      setNewPassword("");
      toast({ title: "Password reset", variant: "success" });
    },
    onError: (error) => {
      toast({
        title: "Unable to reset password",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteManagedUser(userId),
    onSuccess: () => {
      toast({ title: "Account deleted", variant: "success" });
      router.push("/preferences/organization/users");
    },
    onError: (error) => {
      toast({
        title: "Unable to delete this account",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  function handlePermissionChange(entry: PermissionEntry, state: PermissionState) {
    if (state === entry.state) return;
    setPendingKey(entry.id);
    permissionMutation.mutate({ userId, kind: entry.kind, key: entry.key, state });
  }

  async function handleSuspend() {
    if (!user) return;
    const nextActive = !user.isActive;
    const confirmed = await dsConfirm({
      title: nextActive ? "Reactivate account" : "Suspend account",
      description: nextActive
        ? `${user.email} will be able to sign in again.`
        : `${user.email} will be signed out and blocked from signing in. Their records stay where they are.`,
      variant: nextActive ? "default" : "warning",
      confirmLabel: nextActive ? "Reactivate" : "Suspend",
    });
    if (confirmed) statusMutation.mutate({ userId, isActive: nextActive });
  }

  async function handleDelete() {
    if (!user) return;
    const confirmed = await dsConfirm({
      title: "Delete this account",
      description: `${user.email} will be removed permanently. If they own records that must keep their history, suspend the account instead.`,
      variant: "danger",
      confirmLabel: "Delete account",
    });
    if (confirmed) deleteMutation.mutate();
  }

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (detailQuery.error || !detail || !user) {
    return (
      <Alert tone="danger" title="User not found">
        {detailQuery.error
          ? getApiErrorMessage(detailQuery.error)
          : "This account may have been deleted."}
      </Alert>
    );
  }

  const auditRows = auditQuery.data?.data ?? [];

  return (
    <div className="space-y-5">
      <Link
        href="/preferences/organization/users"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All users
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar size="lg" name={user.name} src={user.image ?? undefined} />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{user.name}</h2>
            <p className="truncate text-sm text-[var(--text-muted)]">{user.email}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge tone="outline">{user.role}</Badge>
              <Badge tone={user.isActive ? "success" : "warn"}>
                {user.isActive ? "Active" : "Suspended"}
              </Badge>
              {detail.overrideCount > 0 ? (
                <Badge tone="info">
                  {detail.overrideCount} permission
                  {detail.overrideCount === 1 ? "" : "s"} off role
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        {detail.canMutateAccount ? (
          <div className="flex flex-wrap items-center gap-2">
            <DsButton
              type="button"
              variant="secondary"
              size="sm"
              startIcon={
                user.isActive ? (
                  <UserX className="size-4" aria-hidden="true" />
                ) : (
                  <UserCheck className="size-4" aria-hidden="true" />
                )
              }
              loading={statusMutation.isPending}
              onClick={handleSuspend}
            >
              {user.isActive ? "Suspend" : "Reactivate"}
            </DsButton>
            <DsButton
              type="button"
              variant="ghost"
              size="sm"
              startIcon={<Trash2 className="size-4" aria-hidden="true" />}
              loading={deleteMutation.isPending}
              onClick={handleDelete}
            >
              Delete
            </DsButton>
          </div>
        ) : null}
      </div>

      <Tabs defaultValue="permissions">
        <TabsList>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="permissions" className="pt-4">
          {!detail.canEditPermissions ? (
            <Alert tone="info" title="Read-only">
              You can see what this person may do. Changing it is limited to admins and
              managers, and nobody may change their own permissions.
            </Alert>
          ) : null}

          <div className="pt-3">
            <PermissionMatrix
              groups={detail.groups}
              canEdit={detail.canEditPermissions}
              pendingKey={pendingKey}
              overrideCount={detail.overrideCount}
              isResetting={resetPermissionsMutation.isPending}
              onChange={handlePermissionChange}
              onReset={() => resetPermissionsMutation.mutate()}
            />
          </div>
        </TabsContent>

        <TabsContent value="audit" className="pt-4">
          {auditQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : auditRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              Nothing has been recorded against this account yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {auditRows.map((row) => (
                <li key={row.id} className="flex gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)]">
                    <ShieldCheck
                      className="size-3.5 text-[var(--text-muted)]"
                      aria-hidden="true"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium">
                        {ACCOUNT_EVENT_LABELS[row.eventType] ?? row.eventType}
                      </span>
                      <span className="text-sm text-[var(--text-subtle)]">
                        <ClientDate value={row.createdAt} mode="datetime" />
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-muted)]">{row.message}</p>
                    {row.actor ? (
                      <p className="text-sm text-[var(--text-subtle)]">by {row.actor}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="account" className="space-y-5 pt-4">
          <dl className="divide-y divide-[var(--border-subtle)]">
            <div className="flex items-center justify-between py-2">
              <dt className="text-sm text-[var(--text-muted)]">Created</dt>
              <dd className="text-sm">
                <ClientDate value={user.createdAt} mode="date" />
              </dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-sm text-[var(--text-muted)]">Last updated</dt>
              <dd className="text-sm">
                <ClientDate value={user.updatedAt} mode="datetime" />
              </dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-sm text-[var(--text-muted)]">Phone</dt>
              <dd className="text-sm">{user.phone ?? "—"}</dd>
            </div>
          </dl>

          {detail.canMutateAccount ? (
            <>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Role</h3>
                <p className="text-sm text-[var(--text-muted)]">
                  Changing the role moves every permission still set to role default.
                  Anything explicitly allowed or denied stays where it is.
                </p>
                <Field label="Role">
                  <Select
                    value={user.role}
                    disabled={roleMutation.isPending}
                    onChange={(event) =>
                      roleMutation.mutate({
                        userId,
                        role: event.target.value as ManagedUserRole,
                      })
                    }
                  >
                    {roleOptions.some((role) => role.value === user.role) ? null : (
                      <option value={user.role}>{user.role}</option>
                    )}
                    {roleOptions.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Password</h3>
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="New password" className="min-w-56 flex-1">
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="Minimum 8 characters"
                    />
                  </Field>
                  <DsButton
                    type="button"
                    variant="secondary"
                    startIcon={<RefreshCcw className="size-4" aria-hidden="true" />}
                    disabled={newPassword.trim().length < 8}
                    loading={passwordMutation.isPending}
                    onClick={() => passwordMutation.mutate({ userId, newPassword })}
                  >
                    Reset password
                  </DsButton>
                </div>
              </section>
            </>
          ) : (
            <Alert tone="info" title="Read-only">
              Role, password and account status are changed by a superadmin.
            </Alert>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

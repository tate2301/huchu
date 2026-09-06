"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  Alert,
  Badge,
  Button,
  Drawer,
  Field,
  Input,
  Select,
  type DataTableColumn,
} from "@corelithzw/react";

import { DsDataTable } from "@corelithzw/ui/corelith/ds-data-table";
import { PageActions } from "@/components/layout/page-chrome";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import { getAllowedUserRoleOptionsForWorkspace } from "@corelithzw/platform/vertical-roles";
import {
  changeManagedUserRole,
  createManagedUser,
  fetchManagedUsers,
  resetManagedUserPassword,
  setManagedUserStatus,
  type ManagedUserRole,
  type ManagedUserSummary,
} from "@corelithzw/platform/user-management-api";
import { Plus, RefreshCcw, ShieldCheck, UserCheck } from "@corelithzw/ui/lib/icons";
import { dsConfirm } from "@corelithzw/ui/components/ds-confirm";

type RoleFilter = "ALL" | ManagedUserRole;
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

function formatDate(value: string | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function defaultRole(roles: ManagedUserRole[]): ManagedUserRole {
  if (roles.includes("OPERATOR")) return "OPERATOR";
  if (roles.includes("MANAGER")) return "MANAGER";
  return roles[0] ?? "MANAGER";
}

export function UsersPreferences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const sessionRole = (session?.user as { role?: string } | undefined)?.role;
  const enabledFeatures = (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures;
  const workspaceProfile = (session?.user as { workspaceProfile?: string } | undefined)?.workspaceProfile;
  const canMutate = sessionRole === "SUPERADMIN";

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
  const managedRoles = React.useMemo(
    () => roleOptions.map((role) => role.value),
    [roleOptions],
  );

  const [search, setSearch] = React.useState("");
  const [submittedSearch, setSubmittedSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<RoleFilter>("ALL");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("ALL");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createDraft, setCreateDraft] = React.useState({
    name: "",
    email: "",
    password: "",
    role: defaultRole(managedRoles),
  });
  const [passwordTarget, setPasswordTarget] = React.useState<{
    userId: string;
    userEmail: string;
    newPassword: string;
  } | null>(null);
  const [roleTarget, setRoleTarget] = React.useState<{
    userId: string;
    userEmail: string;
    role: ManagedUserRole;
  } | null>(null);

  React.useEffect(() => {
    if (!managedRoles.includes(createDraft.role)) {
      setCreateDraft((current) => ({ ...current, role: defaultRole(managedRoles) }));
    }
  }, [createDraft.role, managedRoles]);

  React.useEffect(() => {
    setPage(1);
  }, [pageSize, roleFilter, statusFilter, submittedSearch]);

  const usersQuery = useQuery({
    queryKey: [
      "preferences",
      "organization",
      "users",
      page,
      pageSize,
      submittedSearch,
      roleFilter,
      statusFilter,
    ],
    queryFn: () =>
      fetchManagedUsers({
        role: roleFilter === "ALL" ? undefined : roleFilter,
        active:
          statusFilter === "ALL"
            ? undefined
            : statusFilter === "ACTIVE",
        search: submittedSearch || undefined,
        page,
        limit: pageSize,
      }),
    enabled: managedRoles.length > 0,
  });

  const users = usersQuery.data?.data ?? [];
  const pagination = usersQuery.data?.pagination;

  const createMutation = useMutation({
    mutationFn: createManagedUser,
    onSuccess: () => {
      toast({
        title: "User created",
        description: "User account was created.",
        variant: "success",
      });
      setCreateOpen(false);
      setCreateDraft({
        name: "",
        email: "",
        password: "",
        role: defaultRole(managedRoles),
      });
      queryClient.invalidateQueries({ queryKey: ["preferences", "organization", "users"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to create user",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: setManagedUserStatus,
    onSuccess: () => {
      toast({
        title: "User status updated",
        description: "User account status was changed.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["preferences", "organization", "users"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to update user status",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: resetManagedUserPassword,
    onSuccess: () => {
      toast({
        title: "Password reset",
        description: "The managed user password was reset.",
        variant: "success",
      });
      setPasswordTarget(null);
    },
    onError: (error) => {
      toast({
        title: "Unable to reset password",
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
        description: "The managed user role was updated.",
        variant: "success",
      });
      setRoleTarget(null);
      queryClient.invalidateQueries({ queryKey: ["preferences", "organization", "users"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to change role",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  async function toggleStatus(user: ManagedUserSummary) {
    const nextActive = !user.isActive;
    const confirmed = await dsConfirm({
      title: nextActive ? "Activate user" : "Deactivate user",
      description: `${nextActive ? "Activate" : "Deactivate"} ${user.email}.`,
      variant: nextActive ? "default" : "warning",
      confirmLabel: nextActive ? "Activate" : "Deactivate",
    });
    if (confirmed) {
      statusMutation.mutate({ userId: user.id, isActive: nextActive });
    }
  }

  const columns: DataTableColumn<ManagedUserSummary>[] = [
      {
        key: "user",
        header: "User",
        render: (row) => (
          <Link
            href={`/preferences/organization/users/${row.id}`}
            className="block underline decoration-[var(--border)] underline-offset-2 hover:decoration-[var(--text)]"
          >
            <div>{row.name}</div>
            <div className="t-caption t-muted">{row.email}</div>
          </Link>
        ),
      },
      {
        key: "role",
        header: "Role",
        width: "12rem",
        render: (row) => <Badge tone="outline">{row.role}</Badge>,
      },
      {
        key: "status",
        header: "Status",
        width: "8rem",
        render: (row) => (
          <Badge tone={row.isActive ? "success" : "outline"}>
            {row.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        key: "updated",
        header: "Updated",
        width: "12rem",
        render: (row) => <span className="t-mono">{formatDate(row.updatedAt ?? row.createdAt)}</span>,
      },
      ...(canMutate
        ? [
            {
              key: "actions",
              header: "Actions",
              width: "22rem",
              render: (row: ManagedUserSummary) => (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    startIcon={<ShieldCheck className="size-4" aria-hidden="true" />}
                    asChild
                  >
                    <Link href={`/preferences/organization/users/${row.id}`}>Permissions</Link>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    loading={statusMutation.isPending}
                    onClick={() => toggleStatus(row)}
                  >
                    {row.isActive ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    startIcon={<RefreshCcw className="size-4" aria-hidden="true" />}
                    onClick={() =>
                      setPasswordTarget({
                        userId: row.id,
                        userEmail: row.email,
                        newPassword: "",
                      })
                    }
                  >
                    Password
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    startIcon={<UserCheck className="size-4" aria-hidden="true" />}
                    onClick={() =>
                      setRoleTarget({
                        userId: row.id,
                        userEmail: row.email,
                        role: managedRoles.includes(row.role as ManagedUserRole)
                          ? (row.role as ManagedUserRole)
                          : defaultRole(managedRoles),
                      })
                    }
                  >
                    Role
                  </Button>
                </div>
              ),
            } satisfies DataTableColumn<ManagedUserSummary>,
          ]
        : []),
  ];

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    createMutation.mutate({
      name: createDraft.name.trim(),
      email: createDraft.email.trim(),
      password: createDraft.password,
      role: createDraft.role,
    });
  }

  function handlePasswordReset(event: React.FormEvent) {
    event.preventDefault();
    if (!passwordTarget) return;
    passwordMutation.mutate({
      userId: passwordTarget.userId,
      newPassword: passwordTarget.newPassword,
    });
  }

  function handleRoleChange(event: React.FormEvent) {
    event.preventDefault();
    if (!roleTarget) return;
    roleMutation.mutate({
      userId: roleTarget.userId,
      role: roleTarget.role,
    });
  }

  return (
    <div className="space-y-4">
      {!canMutate ? (
        <Alert tone="info" title="Read-only directory">
          Managers can browse users here. User creation, password reset, status, and role changes are limited to superadmins.
        </Alert>
      ) : null}

      {/* Only for somebody who can actually create one: a manager browsing a
          read-only directory gets a bar with nothing in it rather than a
          button that refuses. */}
      {canMutate ? (
        <PageActions>
          <Button
            type="button"
            variant="primary"
            size="sm"
            startIcon={<Plus className="size-4" aria-hidden="true" />}
            onClick={() => setCreateOpen(true)}
          >
            New user
          </Button>
        </PageActions>
      ) : null}

      <DsDataTable
        ariaLabel="Users"
        rows={users}
        columns={columns}
        getRowId={(row) => row.id}
        searchValue={search}
        searchPlaceholder="Search users"
        onSearchChange={setSearch}
        onSearchSubmit={() => setSubmittedSearch(search)}
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Role filter"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
            >
              <option value="ALL">All roles</option>
              {roleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Status filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </div>
        }
        isLoading={usersQuery.isLoading}
        loadingLabel="Fetching users"
        error={usersQuery.error ? getApiErrorMessage(usersQuery.error) : null}
        errorTitle="Unable to load users"
        emptyTitle="No users found"
        emptyDescription="Managed user accounts will appear here when they are created."
        page={pagination?.page ?? page}
        pageCount={pagination?.pages ?? 1}
        pageSize={pagination?.limit ?? pageSize}
        pageSizeOptions={[10, 25, 50]}
        total={pagination?.total ?? users.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New user"
        description="Provision a managed user account for this workspace."
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-user-preferences-form"
              loading={createMutation.isPending}
            >
              Create user
            </Button>
          </div>
        }
      >
        <form id="create-user-preferences-form" className="space-y-4" onSubmit={handleCreate}>
          <Field label="Name" required>
            <Input
              value={createDraft.name}
              onChange={(event) =>
                setCreateDraft((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
          </Field>
          <Field label="Email" required>
            <Input
              type="email"
              value={createDraft.email}
              onChange={(event) =>
                setCreateDraft((current) => ({ ...current, email: event.target.value }))
              }
              required
            />
          </Field>
          <Field label="Temporary password" required>
            <Input
              type="password"
              value={createDraft.password}
              onChange={(event) =>
                setCreateDraft((current) => ({ ...current, password: event.target.value }))
              }
              required
            />
          </Field>
          <Field label="Role" required>
            <Select
              value={createDraft.role}
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  role: event.target.value as ManagedUserRole,
                }))
              }
              required
            >
              {roleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </Select>
          </Field>
        </form>
      </Drawer>

      <Drawer
        open={Boolean(passwordTarget)}
        onClose={() => setPasswordTarget(null)}
        title="Reset password"
        description={passwordTarget?.userEmail}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPasswordTarget(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="reset-user-password-preferences-form"
              loading={passwordMutation.isPending}
            >
              Reset password
            </Button>
          </div>
        }
      >
        <form
          id="reset-user-password-preferences-form"
          className="space-y-4"
          onSubmit={handlePasswordReset}
        >
          <Field label="New password" required>
            <Input
              type="password"
              value={passwordTarget?.newPassword ?? ""}
              onChange={(event) =>
                setPasswordTarget((current) =>
                  current ? { ...current, newPassword: event.target.value } : current,
                )
              }
              required
            />
          </Field>
        </form>
      </Drawer>

      <Drawer
        open={Boolean(roleTarget)}
        onClose={() => setRoleTarget(null)}
        title="Change role"
        description={roleTarget?.userEmail}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRoleTarget(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="change-user-role-preferences-form"
              loading={roleMutation.isPending}
            >
              Save role
            </Button>
          </div>
        }
      >
        <form id="change-user-role-preferences-form" className="space-y-4" onSubmit={handleRoleChange}>
          <Field label="Role" required>
            <Select
              value={roleTarget?.role ?? defaultRole(managedRoles)}
              onChange={(event) =>
                setRoleTarget((current) =>
                  current ? { ...current, role: event.target.value as ManagedUserRole } : current,
                )
              }
              required
            >
              {roleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </Select>
          </Field>
        </form>
      </Drawer>
    </div>
  );
}

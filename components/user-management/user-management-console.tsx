"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { ManagementShell } from "@/components/settings/management-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableQueryState } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  changeManagedUserRole,
  createManagedUser,
  fetchManagedUserFeatureAccess,
  fetchManagedUsers,
  resetManagedUserFeatureAccess,
  setManagedUserFeatureAccess,
  type ManagedUserFeatureAccessEntry,
  type ManagedUserSummary,
  resetManagedUserPassword,
  setManagedUserStatus,
  type ManagedUserRole,
} from "@/lib/user-management-api";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  type LucideIcon,
  ManageAccounts,
  Plus,
  ShieldCheck,
  UserX,
} from "@/lib/icons";
import { hasTokenFeature } from "@/lib/platform/gating/token-check";

export type UserManagementMode =
  | "directory"
  | "create"
  | "status"
  | "password-reset"
  | "role-change";

type RoleFilter = "MANAGED" | "MANAGER" | "CLERK";
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";
type FeatureAccessBlockedReason = "COMPANY_DISABLED" | "TEMPLATE_BLOCKED";
type ManagedUserTargetBase = {
  userId: string;
  userEmail: string;
};

const USER_FEATURE_ACCESS_KEY = "admin.user-management.feature-access";

const modeMeta: Record<UserManagementMode, { title: string; description: string }> = {
  directory: {
    title: "User Directory",
    description: "Browse manager and clerk accounts for this organization.",
  },
  create: {
    title: "Create User",
    description: "Provision new manager or clerk accounts.",
  },
  status: {
    title: "User Status",
    description: "Activate or deactivate manager and clerk accounts.",
  },
  "password-reset": {
    title: "Reset User Password",
    description: "Reset credentials for manager and clerk users.",
  },
  "role-change": {
    title: "Change User Role",
    description: "Move users between manager and clerk roles.",
  },
};

function formatTimestamp(value: string | undefined): string {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

function defaultRoleForMode(mode: UserManagementMode): ManagedUserRole {
  return mode === "create" ? "CLERK" : "MANAGER";
}

function toManagedRole(role: string | undefined): ManagedUserRole | null {
  if (role === "MANAGER" || role === "CLERK") return role;
  return null;
}

function getBlockedFeatureLabel(reason: FeatureAccessBlockedReason | null): string {
  if (reason === "COMPANY_DISABLED") return "Company Disabled";
  if (reason === "TEMPLATE_BLOCKED") return "Template Blocked";
  return "Unavailable";
}

export function UserManagementConsole({ mode }: { mode: UserManagementMode }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const sessionRole = (session?.user as { role?: string } | undefined)?.role;
  const enabledFeatures = (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures;

  const canView =
    sessionRole === "SUPERADMIN" ||
    (sessionRole === "MANAGER" && mode === "directory");
  const canMutate = sessionRole === "SUPERADMIN";
  const canManageFeatureAccess =
    canMutate && hasTokenFeature(enabledFeatures, USER_FEATURE_ACCESS_KEY);
  const actionsVisible = {
    status: mode === "directory" || mode === "status",
    password: mode === "directory" || mode === "password-reset",
    role: mode === "directory" || mode === "role-change",
    featureAccess: mode === "directory" && canManageFeatureAccess,
  };

  const [queryState, setQueryState] = React.useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  });
  const [roleFilter, setRoleFilter] = React.useState<RoleFilter>("MANAGED");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("ALL");
  const [featureQueryState, setFeatureQueryState] = React.useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 20,
    search: "",
  });

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createDraft, setCreateDraft] = React.useState({
    name: "",
    email: "",
    password: "",
    role: defaultRoleForMode(mode),
  });

  const [statusTarget, setStatusTarget] = React.useState<
    (ManagedUserTargetBase & {
      isActive: boolean;
    }) | null
  >(null);
  const [passwordTarget, setPasswordTarget] = React.useState<
    (ManagedUserTargetBase & {
      newPassword: string;
    }) | null
  >(null);
  const [roleTarget, setRoleTarget] = React.useState<
    (ManagedUserTargetBase & {
      role: ManagedUserRole;
    }) | null
  >(null);
  const [featureTarget, setFeatureTarget] = React.useState<
    (ManagedUserTargetBase & {
      role: ManagedUserRole;
    }) | null
  >(null);

  React.useEffect(() => {
    if (mode === "create" && canMutate) {
      setCreateOpen(true);
    }
  }, [canMutate, mode]);

  const featureTargetUserId = featureTarget?.userId;

  React.useEffect(() => {
    if (!featureTargetUserId) return;
    setFeatureQueryState({
      mode: "paginated",
      page: 1,
      pageSize: 20,
      search: "",
    });
  }, [featureTargetUserId]);

  const usersQuery = useQuery({
    queryKey: [
      "managed-users",
      queryState.page,
      queryState.pageSize,
      queryState.search,
      roleFilter,
      statusFilter,
    ],
    queryFn: () =>
      fetchManagedUsers({
        role:
          roleFilter === "MANAGED"
            ? "MANAGER,CLERK"
            : roleFilter,
        active:
          statusFilter === "ALL"
            ? undefined
            : statusFilter === "ACTIVE",
        search: queryState.search || undefined,
        page: queryState.page,
        limit: queryState.pageSize,
      }),
    enabled: canView,
  });

  const users = React.useMemo(() => usersQuery.data?.data ?? [], [usersQuery.data?.data]);
  const usersById = React.useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );

  const featureAccessQuery = useQuery({
    queryKey: ["managed-user-feature-access", featureTarget?.userId],
    queryFn: () => fetchManagedUserFeatureAccess(featureTarget!.userId),
    enabled: Boolean(featureTarget?.userId) && canManageFeatureAccess,
  });
  const featureRows = featureAccessQuery.data?.features ?? [];
  const totalRows = usersQuery.data?.pagination.total ?? users.length;
  const totalPages = usersQuery.data?.pagination.pages ?? 1;

  const refreshUsers = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["managed-users"] });
  }, [queryClient]);

  const createUserMutation = useMutation({
    mutationFn: createManagedUser,
    onSuccess: () => {
      toast({
        title: "User created",
        description: "User account was created successfully.",
        variant: "success",
      });
      setCreateOpen(false);
      setCreateDraft({
        name: "",
        email: "",
        password: "",
        role: defaultRoleForMode(mode),
      });
      refreshUsers();
    },
    onError: (error) => {
      toast({
        title: "Unable to create user",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const setStatusMutation = useMutation({
    mutationFn: setManagedUserStatus,
    onSuccess: () => {
      toast({
        title: "Status updated",
        description: "User status was updated successfully.",
        variant: "success",
      });
      setStatusTarget(null);
      refreshUsers();
    },
    onError: (error) => {
      toast({
        title: "Unable to update status",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: resetManagedUserPassword,
    onSuccess: () => {
      toast({
        title: "Password reset",
        description: "User password was reset successfully.",
        variant: "success",
      });
      setPasswordTarget(null);
      refreshUsers();
    },
    onError: (error) => {
      toast({
        title: "Unable to reset password",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const roleChangeMutation = useMutation({
    mutationFn: changeManagedUserRole,
    onSuccess: () => {
      toast({
        title: "Role updated",
        description: "User role was updated successfully.",
        variant: "success",
      });
      setRoleTarget(null);
      refreshUsers();
    },
    onError: (error) => {
      toast({
        title: "Unable to update role",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const setFeatureAccessMutation = useMutation({
    mutationFn: setManagedUserFeatureAccess,
    onSuccess: () => {
      toast({
        title: "Feature access updated",
        description: "Per-user feature access was updated successfully.",
        variant: "success",
      });
      queryClient.invalidateQueries({
        queryKey: ["managed-user-feature-access", featureTarget?.userId],
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to update feature access",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const resetFeatureAccessMutation = useMutation({
    mutationFn: resetManagedUserFeatureAccess,
    onSuccess: () => {
      toast({
        title: "Feature access reset",
        description: "User feature access was reset to role defaults.",
        variant: "success",
      });
      queryClient.invalidateQueries({
        queryKey: ["managed-user-feature-access", featureTarget?.userId],
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to reset feature access",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const featureColumns: ColumnDef<ManagedUserFeatureAccessEntry>[] = [
    {
      id: "feature",
      header: "Feature",
      cell: ({ row }) => (
        <div className="space-y-1">
          <div className="font-medium">{row.original.name}</div>
          <div className="font-mono text-xs text-muted-foreground">
            {row.original.featureKey}
          </div>
        </div>
      ),
    },
    {
      id: "domain",
      header: "Domain",
      cell: ({ row }) => (
        <Badge variant="outline" className="uppercase">
          {row.original.domain}
        </Badge>
      ),
    },
    {
      id: "availability",
      header: "Availability",
      cell: ({ row }) => {
        if (row.original.available) {
          return <Badge variant="secondary">Available</Badge>;
        }
        return (
          <Badge variant="destructive">
            {getBlockedFeatureLabel(
              row.original.blockedReason as FeatureAccessBlockedReason | null,
            )}
          </Badge>
        );
      },
    },
    {
      id: "access",
      header: "Access",
      cell: ({ row }) => {
        const entry = row.original;
        if (!entry.available) {
          return <Badge variant="outline">Not Assignable</Badge>;
        }

        const nextEnabled = !entry.isEnabled;
        return (
          <Button
            type="button"
            size="sm"
            variant={entry.isEnabled ? "outline" : "default"}
            disabled={setFeatureAccessMutation.isPending || !featureTarget?.userId}
            onClick={() => {
              if (!featureTarget?.userId) return;
              setFeatureAccessMutation.mutate({
                userId: featureTarget.userId,
                featureKey: entry.featureKey,
                isEnabled: nextEnabled,
              });
            }}
          >
            {entry.isEnabled ? "Enabled" : "Disabled"}
          </Button>
        );
      },
    },
  ];

  const columns = React.useMemo<ColumnDef<ManagedUserSummary>[]>(
    () => {
      const baseColumns: ColumnDef<ManagedUserSummary>[] = [
        {
          accessorKey: "name",
          header: "Name",
          cell: ({ row }) => (
            <div className="font-medium">{row.original.name}</div>
          ),
        },
        {
          accessorKey: "email",
          header: "Email",
          cell: ({ row }) => (
            <span className="font-mono text-xs">{row.original.email}</span>
          ),
        },
        {
          accessorKey: "role",
          header: "Role",
          cell: ({ row }) => (
            <Badge variant="outline">{row.original.role}</Badge>
          ),
        },
        {
          id: "status",
          header: "Status",
          cell: ({ row }) => (
            <Badge variant={row.original.isActive ? "secondary" : "destructive"}>
              {row.original.isActive ? "Active" : "Inactive"}
            </Badge>
          ),
        },
        {
          id: "updatedAt",
          header: "Updated",
          cell: ({ row }) => (
            <span className="font-mono text-xs">
              {formatTimestamp(row.original.updatedAt)}
            </span>
          ),
        },
      ];

      if (!canMutate) {
        return baseColumns;
      }

      return [
        ...baseColumns,
        {
          id: "actions",
          header: "Actions",
          cell: ({ row }) => {
            const managedRole = toManagedRole(row.original.role);
            const rowActions: Array<{
              key: string;
              label: string;
              icon: LucideIcon;
              onClick: () => void;
            }> = [];

            if (actionsVisible.status) {
              rowActions.push({
                key: "status",
                label: row.original.isActive ? "Deactivate" : "Activate",
                icon: row.original.isActive ? UserX : CheckCircle2,
                onClick: () =>
                  setStatusTarget({
                    userId: row.original.id,
                    userEmail: row.original.email,
                    isActive: !row.original.isActive,
                  }),
              });
            }

            if (actionsVisible.password) {
              rowActions.push({
                key: "password",
                label: "Reset Password",
                icon: ManageAccounts,
                onClick: () =>
                  setPasswordTarget({
                    userId: row.original.id,
                    userEmail: row.original.email,
                    newPassword: "",
                  }),
              });
            }

            if (actionsVisible.role) {
              rowActions.push({
                key: "role",
                label: "Change Role",
                icon: ArrowRightLeft,
                onClick: () =>
                  setRoleTarget({
                    userId: row.original.id,
                    userEmail: row.original.email,
                    role: row.original.role === "MANAGER" ? "CLERK" : "MANAGER",
                  }),
              });
            }

            if (actionsVisible.featureAccess && managedRole) {
              rowActions.push({
                key: "feature",
                label: "Feature Access",
                icon: ShieldCheck,
                onClick: () =>
                  setFeatureTarget({
                    userId: row.original.id,
                    userEmail: row.original.email,
                    role: managedRole,
                  }),
              });
            }

            if (rowActions.length === 0) {
              return null;
            }

            const [primaryAction, ...moreActions] = rowActions;
            const PrimaryIcon = primaryAction.icon;

            return (
              <div className="flex justify-end">
                <div className="inline-flex items-center overflow-hidden rounded-[10px] border border-[var(--edge-subtle)] bg-background shadow-[var(--surface-frame-shadow)]">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="rounded-none border-r border-[var(--edge-subtle)] px-3"
                    onClick={primaryAction.onClick}
                  >
                    <PrimaryIcon className="mr-1.5 h-4 w-4" />
                    {primaryAction.label}
                  </Button>

                  {moreActions.length > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="sm" variant="ghost" className="rounded-none px-2.5">
                          <ChevronDown className="h-4 w-4" />
                          <span className="sr-only">More user actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {moreActions.map((action) => {
                          const ActionIcon = action.icon;
                          return (
                            <DropdownMenuItem key={action.key} onClick={action.onClick}>
                              <ActionIcon className="h-4 w-4" />
                              <span>{action.label}</span>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </div>
            );
          },
        },
      ];
    },
    [
      actionsVisible.featureAccess,
      actionsVisible.password,
      actionsVisible.role,
      actionsVisible.status,
      canMutate,
    ],
  );

  const heading = modeMeta[mode];
  const openFeatureAccessFromFirstManagedUser = React.useCallback(() => {
    const firstManagedUser = users.find((user) => toManagedRole(user.role));
    const managedRole = toManagedRole(firstManagedUser?.role);
    if (!firstManagedUser || !managedRole) return;
    setFeatureTarget({
      userId: firstManagedUser.id,
      userEmail: firstManagedUser.email,
      role: managedRole,
    });
  }, [users]);

  const showHeaderActions = canMutate && (mode === "directory" || mode === "create");
  const headerActions = showHeaderActions ? (
    <div className="inline-flex items-center overflow-hidden rounded-[10px] border border-[var(--edge-subtle)] bg-background shadow-[var(--surface-frame-shadow)]">
      <Button type="button" className="rounded-none border-r border-[var(--edge-subtle)] px-3" onClick={() => setCreateOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" />
        New User
      </Button>
      {mode === "directory" ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" className="rounded-none px-3">
              More
              <ChevronDown className="ml-1.5 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() =>
                setStatusTarget({
                  userId: "",
                  userEmail: "",
                  isActive: true,
                })}
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Set Status</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                setPasswordTarget({
                  userId: "",
                  userEmail: "",
                  newPassword: "",
                })}
            >
              <ManageAccounts className="h-4 w-4" />
              <span>Reset Password</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                setRoleTarget({
                  userId: "",
                  userEmail: "",
                  role: "CLERK",
                })}
            >
              <ArrowRightLeft className="h-4 w-4" />
              <span>Change Role</span>
            </DropdownMenuItem>
            {actionsVisible.featureAccess ? (
              <DropdownMenuItem disabled={users.length === 0} onClick={openFeatureAccessFromFirstManagedUser}>
                <ShieldCheck className="h-4 w-4" />
                <span>Manage Feature Access</span>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  ) : null;

  if (!canView) {
    return (
      <ManagementShell area="users" title={heading.title} description={heading.description}>
        <Alert variant="destructive">
          <AlertTitle>Access restricted</AlertTitle>
          <AlertDescription>
            {mode === "directory"
              ? "User Management directory is available to superadmins and managers only."
              : "Only SUPERADMIN can access this user-management action route."}
          </AlertDescription>
        </Alert>
      </ManagementShell>
    );
  }

  return (
    <ManagementShell area="users" title={heading.title} description={heading.description} actions={headerActions}>
      {!canMutate ? (
        <Alert>
          <AlertTitle>Read-only mode for your role</AlertTitle>
          <AlertDescription>
            You can browse users, but only SUPERADMIN can create or mutate user accounts.
          </AlertDescription>
        </Alert>
      ) : null}

      {canMutate && mode === "directory" && !canManageFeatureAccess ? (
        <Alert>
          <AlertTitle>Feature access controls unavailable</AlertTitle>
          <AlertDescription>
            Enable the <span className="font-mono text-xs">{USER_FEATURE_ACCESS_KEY}</span> feature to
            manage per-user feature access templates and overrides.
          </AlertDescription>
        </Alert>
      ) : null}

      {usersQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load users</AlertTitle>
          <AlertDescription>{getApiErrorMessage(usersQuery.error)}</AlertDescription>
        </Alert>
      ) : null}

      {usersQuery.isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : (
        <DataTable
          data={users}
          columns={columns}
          queryState={queryState}
          onQueryStateChange={(next) =>
            setQueryState((current) => ({
              ...current,
              ...next,
            }))
          }
          features={{ sorting: false, globalFilter: true, pagination: true }}
          pagination={{
            enabled: true,
            server: true,
            total: totalRows,
            totalPages,
          }}
          searchPlaceholder="Search by name or email"
          searchSubmitLabel="Search"
          tableClassName="text-sm"
          noResultsText="No users found for current filters."
          toolbar={
            <>
              <Select
                value={roleFilter}
                onValueChange={(value) => {
                  setRoleFilter(value as RoleFilter);
                  setQueryState((current) => ({ ...current, page: 1 }));
                }}
              >
                <SelectTrigger className="h-8 w-[190px]">
                  <SelectValue placeholder="Role filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANAGED">All Managed Roles</SelectItem>
                  <SelectItem value="MANAGER">Managers</SelectItem>
                  <SelectItem value="CLERK">Clerks</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as StatusFilter);
                  setQueryState((current) => ({ ...current, page: 1 }));
                }}
              >
                <SelectTrigger className="h-8 w-[180px]">
                  <SelectValue placeholder="Status filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
            <DialogDescription>Create a manager or clerk account.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold">Name</label>
              <Input
                value={createDraft.name}
                onChange={(event) =>
                  setCreateDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Full name"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">Email</label>
              <Input
                value={createDraft.email}
                onChange={(event) =>
                  setCreateDraft((current) => ({ ...current, email: event.target.value }))}
                placeholder="user@company.com"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">Password</label>
              <Input
                type="password"
                value={createDraft.password}
                onChange={(event) =>
                  setCreateDraft((current) => ({ ...current, password: event.target.value }))}
                placeholder="Minimum 8 characters"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">Role</label>
              <Select
                value={createDraft.role}
                onValueChange={(value) =>
                  setCreateDraft((current) => ({
                    ...current,
                    role: value as ManagedUserRole,
                  }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="CLERK">Clerk</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={createUserMutation.isPending}
              onClick={() =>
                createUserMutation.mutate({
                  name: createDraft.name,
                  email: createDraft.email,
                  password: createDraft.password,
                  role: createDraft.role,
                })}
            >
              {createUserMutation.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null);
        }}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Set User Status</DialogTitle>
            <DialogDescription>
              {statusTarget?.userEmail
                ? `Update status for ${statusTarget.userEmail}`
                : "Select a user and set status."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold">User</label>
              <Select
                value={statusTarget?.userId || "__none"}
                onValueChange={(value) => {
                  if (value === "__none") return;
                  const selected = usersById.get(value);
                  if (!selected) return;
                  setStatusTarget((current) =>
                    current
                      ? {
                          ...current,
                          userId: selected.id,
                          userEmail: selected.email,
                          isActive: selected.isActive,
                        }
                      : current);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Select user</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {`${user.name} (${user.email})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">Status</label>
              <Select
                value={statusTarget?.isActive ? "ACTIVE" : "INACTIVE"}
                onValueChange={(value) =>
                  setStatusTarget((current) =>
                    current
                      ? {
                          ...current,
                          isActive: value === "ACTIVE",
                        }
                      : current)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStatusTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!statusTarget?.userId || setStatusMutation.isPending}
              onClick={() => {
                if (!statusTarget) return;
                setStatusMutation.mutate({
                  userId: statusTarget.userId,
                  isActive: statusTarget.isActive,
                });
              }}
            >
              {setStatusMutation.isPending ? "Saving..." : "Apply Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(passwordTarget)}
        onOpenChange={(open) => {
          if (!open) setPasswordTarget(null);
        }}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              {passwordTarget?.userEmail
                ? `Reset password for ${passwordTarget.userEmail}`
                : "Select a user and enter a new password."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold">User</label>
              <Select
                value={passwordTarget?.userId || "__none"}
                onValueChange={(value) => {
                  if (value === "__none") return;
                  const selected = usersById.get(value);
                  if (!selected) return;
                  setPasswordTarget((current) =>
                    current
                      ? {
                          ...current,
                          userId: selected.id,
                          userEmail: selected.email,
                        }
                      : current);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Select user</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {`${user.name} (${user.email})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">New Password</label>
              <Input
                type="password"
                value={passwordTarget?.newPassword ?? ""}
                onChange={(event) =>
                  setPasswordTarget((current) =>
                    current
                      ? {
                          ...current,
                          newPassword: event.target.value,
                        }
                      : current)}
                placeholder="Minimum 8 characters"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPasswordTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                !passwordTarget?.userId ||
                passwordTarget.newPassword.trim().length < 8 ||
                resetPasswordMutation.isPending
              }
              onClick={() => {
                if (!passwordTarget) return;
                resetPasswordMutation.mutate({
                  userId: passwordTarget.userId,
                  newPassword: passwordTarget.newPassword,
                });
              }}
            >
              {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(roleTarget)}
        onOpenChange={(open) => {
          if (!open) setRoleTarget(null);
        }}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
            <DialogDescription>
              {roleTarget?.userEmail
                ? `Set role for ${roleTarget.userEmail}`
                : "Select a user and assign a role."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold">User</label>
              <Select
                value={roleTarget?.userId || "__none"}
                onValueChange={(value) => {
                  if (value === "__none") return;
                  const selected = usersById.get(value);
                  if (!selected) return;
                  setRoleTarget((current) =>
                    current
                      ? {
                          ...current,
                          userId: selected.id,
                          userEmail: selected.email,
                          role: selected.role === "MANAGER" ? "CLERK" : "MANAGER",
                        }
                      : current);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Select user</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {`${user.name} (${user.email})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">Role</label>
              <Select
                value={roleTarget?.role ?? "CLERK"}
                onValueChange={(value) =>
                  setRoleTarget((current) =>
                    current
                      ? {
                          ...current,
                          role: value as ManagedUserRole,
                        }
                      : current)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="CLERK">Clerk</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRoleTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!roleTarget?.userId || roleChangeMutation.isPending}
              onClick={() => {
                if (!roleTarget) return;
                roleChangeMutation.mutate({
                  userId: roleTarget.userId,
                  role: roleTarget.role,
                });
              }}
            >
              {roleChangeMutation.isPending ? "Saving..." : "Apply Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(featureTarget)}
        onOpenChange={(open) => {
          if (!open) setFeatureTarget(null);
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Manage Feature Access</DialogTitle>
            <DialogDescription>
              {featureTarget?.userEmail
                ? `Set feature access for ${featureTarget.userEmail}. Effective access is company access ∩ role template ∩ user overrides.`
                : "Select a managed user and configure feature access."}
            </DialogDescription>
          </DialogHeader>

          {featureAccessQuery.error ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load feature access</AlertTitle>
              <AlertDescription>{getApiErrorMessage(featureAccessQuery.error)}</AlertDescription>
            </Alert>
          ) : null}

          {featureAccessQuery.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <DataTable
              data={featureRows}
              columns={featureColumns}
              queryState={featureQueryState}
              onQueryStateChange={(next) =>
                setFeatureQueryState((current) => ({
                  ...current,
                  ...next,
                }))
              }
              features={{ sorting: false, globalFilter: true, pagination: true }}
              searchPlaceholder="Search by feature name or key"
              searchSubmitLabel="Search"
              tableClassName="text-sm"
              noResultsText="No features found for current filters."
              toolbar={
                <>
                  <Badge variant="outline">
                    {featureRows.filter((entry) => entry.isEnabled).length} Enabled
                  </Badge>
                  <Badge variant="outline">
                    {featureRows.filter((entry) => entry.available).length} Assignable
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!featureTarget?.userId || resetFeatureAccessMutation.isPending}
                    onClick={() => {
                      if (!featureTarget?.userId) return;
                      resetFeatureAccessMutation.mutate({
                        userId: featureTarget.userId,
                      });
                    }}
                  >
                    {resetFeatureAccessMutation.isPending ? "Resetting..." : "Reset to Role Default"}
                  </Button>
                </>
              }
            />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFeatureTarget(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ManagementShell>
  );
}

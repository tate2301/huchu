"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { PageHeading } from "@/components/layout/page-heading";
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
  fetchManagedUsers,
  type ManagedUserSummary,
  resetManagedUserPassword,
  setManagedUserStatus,
  type ManagedUserRole,
} from "@/lib/user-management-api";
import { getApiErrorMessage } from "@/lib/api-client";
import { ChevronDown } from "@/lib/icons";

export type UserManagementMode =
  | "directory"
  | "create"
  | "status"
  | "password-reset"
  | "role-change";

type RoleFilter = "MANAGED" | "MANAGER" | "CLERK";
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";
type ManagedUserTargetBase = {
  userId: string;
  userEmail: string;
};

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

export function UserManagementConsole({ mode }: { mode: UserManagementMode }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const sessionRole = (session?.user as { role?: string } | undefined)?.role;

  const canView =
    sessionRole === "SUPERADMIN" ||
    (sessionRole === "MANAGER" && mode === "directory");
  const canMutate = sessionRole === "SUPERADMIN";
  const actionsVisible = {
    status: mode === "directory" || mode === "status",
    password: mode === "directory" || mode === "password-reset",
    role: mode === "directory" || mode === "role-change",
  };

  const [queryState, setQueryState] = React.useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  });
  const [roleFilter, setRoleFilter] = React.useState<RoleFilter>("MANAGED");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("ALL");

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

  React.useEffect(() => {
    if (mode === "create" && canMutate) {
      setCreateOpen(true);
    }
  }, [canMutate, mode]);

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
          cell: ({ row }) => (
            <div className="flex flex-wrap justify-end gap-2">
              {actionsVisible.status ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setStatusTarget({
                      userId: row.original.id,
                      userEmail: row.original.email,
                      isActive: !row.original.isActive,
                    })}
                >
                  {row.original.isActive ? "Deactivate" : "Activate"}
                </Button>
              ) : null}
              {actionsVisible.password ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setPasswordTarget({
                      userId: row.original.id,
                      userEmail: row.original.email,
                      newPassword: "",
                    })}
                >
                  Reset Password
                </Button>
              ) : null}
              {actionsVisible.role ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setRoleTarget({
                      userId: row.original.id,
                      userEmail: row.original.email,
                      role: row.original.role === "MANAGER" ? "CLERK" : "MANAGER",
                    })}
                >
                  Change Role
                </Button>
              ) : null}
            </div>
          ),
        },
      ];
    },
    [actionsVisible.password, actionsVisible.role, actionsVisible.status, canMutate],
  );

  const heading = modeMeta[mode];

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeading title={heading.title} description={heading.description} />
        <Alert variant="destructive">
          <AlertTitle>Access restricted</AlertTitle>
          <AlertDescription>
            {mode === "directory"
              ? "User Management directory is available to superadmins and managers only."
              : "Only SUPERADMIN can access this user-management action route."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading title={heading.title} description={heading.description} />

      {!canMutate ? (
        <Alert>
          <AlertTitle>Read-only mode for your role</AlertTitle>
          <AlertDescription>
            You can browse users, but only SUPERADMIN can create or mutate user accounts.
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

              {canMutate && mode === "directory" ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setCreateOpen(true)}
                  >
                    New User
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" size="sm" variant="outline">
                        More Actions
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
                        Set Status
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          setPasswordTarget({
                            userId: "",
                            userEmail: "",
                            newPassword: "",
                          })}
                      >
                        Reset Password
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          setRoleTarget({
                            userId: "",
                            userEmail: "",
                            role: "CLERK",
                          })}
                      >
                        Change Role
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : null}
              {canMutate && mode === "create" ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                >
                  New User
                </Button>
              ) : null}
            </>
          }
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
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
        <DialogContent className="max-w-md">
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
        <DialogContent className="max-w-md">
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
        <DialogContent className="max-w-md">
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
    </div>
  );
}

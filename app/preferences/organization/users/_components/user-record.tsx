"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import {
  ActivityTrail,
  HeaderAction,
  RecordHeader,
  SectionHeading,
  StatusBadge,
  type ActivityEvent,
  type ActivityTone,
} from "@/components/management/ui";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { PermissionMatrix } from "@/components/user-management/permission-matrix";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  ArrowLeft,
  History,
  ShieldCheck,
  Trash2,
  Warning,
} from "@/lib/icons";
import { getAllowedUserRoleOptionsForWorkspace } from "@/lib/platform/vertical-roles";
import {
  changeManagedUserRole,
  deleteManagedUser,
  fetchManagedUserAudit,
  fetchManagedUserDetail,
  resetManagedUserPassword,
  resetUserPermissions,
  setManagedUserStatus,
  setUserPermission,
  type ManagedUserAuditRow,
  type ManagedUserRole,
  type PermissionEntry,
  type PermissionState,
} from "@/lib/user-management-api";

import {
  CreateField,
  CreateSheet,
  DETAIL_CONTROL_CLASS,
  DetailGrid,
  DetailRow,
  DetailSelect,
  DetailValue,
} from "@/app/management/master-data/operations/_components/register-fields";

import { initialsOf } from "./initials";
import styles from "./users.module.css";

/** Every register on this surface links its trail out to the same log. */
const FULL_LOG_HREF = "/preferences/organization/activity";

/**
 * The record half of the Users register, drawn from `Main.dc.html`.
 *
 * Presentation only. Every query key, every mutation and both permission gates
 * (`canMutateAccount`, `canEditPermissions`, both computed by
 * `/api/users/[id]`) are the ones this surface already used; what changed is
 * where they are drawn. The three tabs the old page carried are gone — a tab
 * strip over Permissions / Audit / Account was three pages wearing one title,
 * and the board draws one record with its sections in order.
 *
 * The fields use the register's own `132px / minmax(0, 320px)` grid from
 * `app/management/master-data/operations/_components/register-fields`, which is
 * the same grid every other register on this surface draws — a label beside its
 * control rather than over it, because a register record is read far more often
 * than it is edited.
 */
export function UserRecord({ userId }: { userId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const enabledFeatures = (session?.user as { enabledFeatures?: string[] } | undefined)
    ?.enabledFeatures;
  const workspaceProfile = (session?.user as { workspaceProfile?: string } | undefined)
    ?.workspaceProfile;

  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const [resetOpen, setResetOpen] = React.useState(false);
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
      setResetOpen(false);
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
      queryClient.invalidateQueries({ queryKey: ["preferences", "organization", "users"] });
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

  async function handleStatusChange(nextActive: boolean) {
    if (!user || nextActive === user.isActive) return;
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
      <div className="space-y-4" role="status" aria-label="Loading this account">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full max-w-[470px]" />
      </div>
    );
  }

  if (detailQuery.error || !detail || !user) {
    return (
      <div
        role="alert"
        /* The same banner the list column draws when a refresh fails
           (States.dc.html): a #F6E2DD tint and #7A2419 ink, no border. The
           only bordered thing in this palette is a Retry button. */
        className="flex max-w-[470px] items-center gap-2 rounded-lg bg-[#F6E2DD] px-[10px] py-[9px] text-[13px]/[1.4] font-medium text-[#7A2419]"
      >
        <Warning className="size-3.5 shrink-0" aria-hidden="true" />
        {detailQuery.error ? getApiErrorMessage(detailQuery.error) : "No such account"}
      </div>
    );
  }

  const auditRows = auditQuery.data?.data ?? [];
  const events = auditRows.map(toActivityEvent);
  const permissionCount = detail.groups.reduce(
    (total, group) => total + group.entries.length,
    0,
  );
  const roleLabel =
    roleOptions.find((role) => role.value === user.role)?.label ?? user.role;

  return (
    <>
      {/* The way back to the list below 900px, where the register shows one
          column. The selection is the URL here, so it is a link and not a
          setState — the list is a route of its own. */}
      <Link
        href="/preferences/organization/users"
        className="mb-3 hidden items-center gap-2 text-[13px]/[1.4] font-medium text-[#565C69] max-[899px]:inline-flex"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Users
      </Link>

      <RecordHeader
        title={user.name || user.email}
        /* The mark is the person, so the tile is their avatar: a circle in the
           selected-row grey, not the square entity tile. */
        className="[&>span:first-of-type]:rounded-full [&>span:first-of-type]:bg-[#E8EBF0] [&>span:first-of-type]:text-[#16181D]"
        /* `aria-hidden`: the initials are the name again, two letters of it,
           and a reader should hear "Amara Nyoni" once. `ActivityTrail` hides
           its identical avatar the same way. */
        mark={
          <span className={styles.headerMark} aria-hidden="true">
            {initialsOf(user.name || user.email)}
          </span>
        }
        /* Rule 5: `context="header"` renders nothing for a healthy account, so
           this is safe to pass unconditionally. */
        badge={
          <StatusBadge context="header" tone={user.isActive ? "success" : "neutral"}>
            Suspended
          </StatusBadge>
        }
        action={
          detail.canMutateAccount ? (
            /* No icon: Main.dc.html draws the header's one verb as a plain
               32px label button, and rule 10 says an icon beside a word that
               already says the thing is decoration.

               The board's word is "Send a reset link". Nothing sends a link:
               `/api/users/password-reset` takes a password and sets it, so the
               verb says what the button does. */
            <HeaderAction onClick={() => setResetOpen(true)}>Reset password</HeaderAction>
          ) : undefined
        }
        /* Rule 9: no overflow at all rather than a menu of refusals. */
        overflow={
          detail.canMutateAccount ? (
            <DropdownMenuItem onSelect={() => void handleDelete()}>
              <Trash2 aria-hidden="true" />
              Delete account
            </DropdownMenuItem>
          ) : undefined
        }
      />

      {/* Bare, with no tile. `Departments.dc.html` and `JobGrades.dc.html` give
          their one "Details" section the brand tile, but `Main.dc.html` — the
          board for *this* record — draws its field sections ("Account",
          "Assignment") as type alone and tiles only the trail below them. This
          record has no single "Details" section for the brand tile to mark, and
          rule 10 does not allow a glyph that carries no meaning. */}
      <SectionHeading>Account</SectionHeading>
      <DetailGrid>
        {/* No PATCH exists for a name, an email or a phone number, so they are
            facts rather than inputs. */}
        <Fact label="Email">{user.email}</Fact>

        {detail.canMutateAccount ? (
          <DetailRow label="Role">
            {(id) => (
              <DetailSelect
                id={id}
                value={user.role}
                disabled={roleMutation.isPending}
                onValueChange={(value) =>
                  roleMutation.mutate({ userId, role: value as ManagedUserRole })
                }
              >
                {roleOptions.some((role) => role.value === user.role) ? null : (
                  <SelectItem value={user.role}>{user.role}</SelectItem>
                )}
                {roleOptions.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </DetailSelect>
            )}
          </DetailRow>
        ) : (
          <Fact label="Role">{roleLabel}</Fact>
        )}

        {detail.canMutateAccount ? (
          <DetailRow label="Status">
            {(id) => (
              <DetailSelect
                id={id}
                value={user.isActive ? "ACTIVE" : "INACTIVE"}
                disabled={statusMutation.isPending}
                onValueChange={(value) => void handleStatusChange(value === "ACTIVE")}
              >
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Suspended</SelectItem>
              </DetailSelect>
            )}
          </DetailRow>
        ) : (
          <Fact label="Status">{user.isActive ? "Active" : "Suspended"}</Fact>
        )}

        {/* The board's fourth row, in the board's own position — a read-only
            fact, because nothing sets it: `/api/users/[id]` reads the newest
            `auth.login.success` event for this address out of the audit
            ledger. Null is an account that has never signed in, and it says so
            rather than drawing an em-dash the reader has to interpret. */}
        <Fact label="Last seen">
          {user.lastSignInAt ? formatDateTime(user.lastSignInAt) : "Never signed in"}
        </Fact>

        {user.phone ? <Fact label="Phone">{user.phone}</Fact> : null}

        <Fact label="Last updated">{formatDateTime(user.updatedAt)}</Fact>
        <Fact label="Created">{formatDateTime(user.createdAt)}</Fact>
      </DetailGrid>

      <SectionHeading icon={ShieldCheck} count={permissionCount}>
        Permissions
      </SectionHeading>
      <PermissionMatrix
        groups={detail.groups}
        canEdit={detail.canEditPermissions}
        pendingKey={pendingKey}
        overrideCount={detail.overrideCount}
        isResetting={resetPermissionsMutation.isPending}
        onChange={handlePermissionChange}
        onReset={() => resetPermissionsMutation.mutate()}
      />

      {/* `chainVerified` is deliberately not passed: nothing here walked
          `prevEventHash` back to the first event, and `/api/users/[id]/audit`
          merges two tables by `createdAt`, so row order proves nothing. */}
      {auditQuery.isLoading ? (
        <>
          <SectionHeading icon={History}>Activity</SectionHeading>
          <Skeleton className="h-24 w-full max-w-[470px]" />
        </>
      ) : (
        <ActivityTrail
          events={events}
          fullLogHref={FULL_LOG_HREF}
          formatTime={formatDateTime}
        />
      )}

      <CreateSheet
        open={resetOpen}
        onOpenChange={(open) => {
          setResetOpen(open);
          if (!open) setNewPassword("");
        }}
        title="Reset password"
        submitLabel="Reset password"
        busy={passwordMutation.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          passwordMutation.mutate({ userId, newPassword });
        }}
      >
        <CreateField label="New password">
          {(id) => (
            <Input
              id={id}
              type="password"
              required
              minLength={8}
              value={newPassword}
              className={DETAIL_CONTROL_CLASS}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          )}
        </CreateField>
      </CreateSheet>
    </>
  );
}

/**
 * A read-only row of the details grid.
 *
 * `DetailRow` draws a `<label>` for the control beside it; a fact has no
 * control to point at, so its name is a span. The type is the grid's own meta
 * rung (`400 12/1.45 #5E6573`), the same as the label column beside it.
 */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className={styles.factLabel}>{label}</span>
      <DetailValue>{children}</DetailValue>
    </>
  );
}

/**
 * `/api/users/[id]/audit` merges `ProvisioningEvent` (what was done to this
 * account) with `PlatformAuditEvent` (what this account did) into one row
 * shape. The provisioning half uses underscored event types, so the tone is
 * derived here rather than left to `activityToneFor`, which reads the suffix
 * after a dot.
 */
function toActivityEvent(row: ManagedUserAuditRow): ActivityEvent {
  return {
    id: row.id,
    eventType: row.eventType,
    createdAt: row.createdAt,
    summary: row.message || ACCOUNT_EVENT_LABELS[row.eventType] || row.eventType,
    actor: row.actor,
    tone: row.kind === "ACCOUNT" ? accountEventTone(row.eventType) : undefined,
  };
}

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

function accountEventTone(eventType: string): ActivityTone {
  if (eventType.endsWith("_CREATE")) return "success";
  if (eventType.endsWith("_DELETE")) return "danger";
  if (eventType.includes("RESET")) return "warn";
  if (eventType.startsWith("USER_SET") || eventType.startsWith("USER_CHANGE")) {
    return "brand";
  }
  return "neutral";
}

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_TIME.format(date);
}

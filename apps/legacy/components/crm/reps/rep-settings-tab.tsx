"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Badge } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { PermissionMatrix } from "@/components/user-management/permission-matrix";
import { getApiErrorMessage } from "@/lib/api-client";
import { ExternalLink } from "@/lib/icons";
import {
  fetchManagedUserDetail,
  resetUserPermissions,
  setUserPermission,
  type PermissionEntry,
  type PermissionState,
} from "@/lib/user-management-api";

/**
 * What this person is allowed to do, on the page where you were thinking
 * about them.
 *
 * A rep is a user, so their permissions have always been editable — in
 * Settings, under a different name, three clicks away from the record that
 * prompted the question. Somebody looking at a rep's pipeline and wondering
 * why they cannot issue quotes should be able to answer it here rather than
 * navigating away and hunting for the right row in a directory.
 *
 * It is the same screen, not a second one: same API, same three states, same
 * component. Account lifecycle — suspending, deleting, resetting a password —
 * deliberately stays in Settings, because those are things you do to an
 * account, not to a salesperson.
 */
export function RepSettingsTab({ repId, repName }: { repId: string; repName: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["managed-user", repId],
    queryFn: () => fetchManagedUserDetail(repId),
  });

  const detail = detailQuery.data;

  const permissionMutation = useMutation({
    mutationFn: setUserPermission,
    onSuccess: (result) => {
      queryClient.setQueryData(["managed-user", repId], (current: typeof detail) =>
        current
          ? { ...current, groups: result.groups, overrideCount: result.overrideCount }
          : current,
      );
    },
    onError: (error) => {
      toast({
        title: "Unable to change that permission",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["managed-user", repId] });
    },
    onSettled: () => setPendingKey(null),
  });

  const resetMutation = useMutation({
    mutationFn: () => resetUserPermissions(repId),
    onSuccess: (result) => {
      queryClient.setQueryData(["managed-user", repId], (current: typeof detail) =>
        current
          ? { ...current, groups: result.groups, overrideCount: result.overrideCount }
          : current,
      );
      toast({
        title: "Permissions reset",
        description: `${repName} follows their role again.`,
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to reset permissions",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  function handleChange(entry: PermissionEntry, state: PermissionState) {
    if (state === entry.state) return;
    setPendingKey(entry.id);
    permissionMutation.mutate({ userId: repId, kind: entry.kind, key: entry.key, state });
  }

  if (detailQuery.isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (detailQuery.error || !detail) {
    // A 403 here is the common case, not a failure: reps can read each other's
    // pipelines but not each other's permissions.
    return (
      <Alert tone="info" title="Permissions are not yours to see">
        {detailQuery.error
          ? getApiErrorMessage(detailQuery.error)
          : "An admin or manager can configure what this person may do."}
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--text-strong)]">What {repName} can do</h3>
          <p className="text-sm text-[var(--text-muted)]">
            Their role answers most of this. Anything set to allow or deny here
            overrides the role and stays put when the role changes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone="outline">{detail.user.role}</Badge>
          <Badge tone={detail.user.isActive ? "success" : "warn"}>
            {detail.user.isActive ? "Active" : "Suspended"}
          </Badge>
        </div>
      </div>

      {!detail.canEditPermissions ? (
        <Alert tone="info" title="Read-only">
          Nobody may change their own permissions, and only an admin or manager may
          change anybody else&apos;s.
        </Alert>
      ) : null}

      <PermissionMatrix
        groups={detail.groups}
        canEdit={detail.canEditPermissions}
        pendingKey={pendingKey}
        overrideCount={detail.overrideCount}
        isResetting={resetMutation.isPending}
        onChange={handleChange}
        onReset={() => resetMutation.mutate()}
      />

      <div className="border-t border-[var(--border-subtle)] pt-4">
        <h3 className="text-base font-semibold text-[var(--text-strong)]">The account itself</h3>
        <p className="text-sm text-[var(--text-muted)]">
          Suspending, deleting, changing the role or resetting the password are things
          done to an account rather than to a salesperson, so they live with the rest
          of user management — along with the audit log of everything done to it.
        </p>
        <Button type="button" variant="secondary" size="sm" className="mt-2" asChild>
          <Link href={`/preferences/organization/users/${repId}`}>
            Open the account
            <ExternalLink className="ml-1.5 size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

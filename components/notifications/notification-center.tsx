"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { NotificationRichBody } from "@/components/notifications/notification-renderers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useToast } from "@/components/ui/use-toast";
import { useNotificationStream } from "@/hooks/use-notification-stream";
import {
  archiveNotifications,
  fetchNotifications,
  markNotificationsRead,
  type NotificationAction,
  type NotificationListItem,
  type NotificationSeverity,
} from "@/lib/api";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { canAccessCapabilityWithToken } from "@/lib/platform/gating/token-check";
import { CheckCircle2, Loader2 } from "@/lib/icons";
import { cn } from "@/lib/utils";

type FilterMode = "unread" | "all";

function severityBadgeVariant(severity: NotificationSeverity) {
  if (severity === "CRITICAL") return "destructive";
  if (severity === "WARNING") return "secondary";
  return "outline";
}

function formatType(type: string) {
  return type
    .replace(/^HR_/, "HR ")
    .replace(/^OPS_/, "OPS ")
    .replace(/_/g, " ");
}

function actionButtonVariant(action: NotificationAction) {
  return action.variant ?? "outline";
}

/** Whether this workspace has the notification centre at all. */
export function useNotificationsEnabled() {
  const { data: session } = useSession();
  const enabledFeatures = (
    session?.user as { enabledFeatures?: string[] } | undefined
  )?.enabledFeatures;
  return (
    canAccessCapabilityWithToken("notification.center.widget", enabledFeatures).allowed &&
    canAccessCapabilityWithToken("notification.center.stream", enabledFeatures).allowed
  );
}

/**
 * How many are unread, for the account menu's pill and the logo tile's dot
 * (00-foundations 5.3.6). Shares the `["notifications"]` prefix, so marking
 * one read in the panel refreshes it.
 */
export function useUnreadNotificationCount(): number {
  const enabled = useNotificationsEnabled();
  const { data } = useQuery({
    queryKey: ["notifications", "unread-count"],
    enabled,
    queryFn: () => fetchNotifications({ unreadOnly: true, limit: 1 }),
    staleTime: 5000,
    refetchInterval: 30000,
  });
  return enabled ? (data?.unreadCount ?? 0) : 0;
}

/**
 * The notification panel, anchored to `children`: drawn to the right of the
 * rail from the account menu's "Notifications" (the logo tile), or under the
 * app bar's bell (`side="bottom"`).
 *
 * One instance holds the live stream (`live`); the stream refreshes every
 * `["notifications"]` query, so a second instance stays current without one.
 */
export function NotificationCenter({
  open,
  onOpenChange,
  children,
  side = "right",
  align = "start",
  live = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  side?: "right" | "bottom";
  align?: "start" | "end";
  live?: boolean;
}) {
  const centerEnabled = useNotificationsEnabled();
  const [filterMode, setFilterMode] = useState<FilterMode>("unread");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications", filterMode],
    enabled: centerEnabled && open,
    queryFn: () =>
      fetchNotifications({
        unreadOnly: filterMode === "unread",
        limit: 30,
      }),
    staleTime: 5000,
    refetchInterval: 30000,
  });

  const invalidateNotifications = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }, [queryClient]);

  useNotificationStream(invalidateNotifications, centerEnabled && live);

  const items = useMemo(() => data?.data ?? [], [data]);
  const unreadCount = data?.unreadCount ?? 0;
  const featureDisabled =
    error instanceof ApiError &&
    error.status === 403 &&
    /feature disabled/i.test(error.message);
  const unreadIds = useMemo(
    () => items.filter((item) => !item.isRead).map((item) => item.recipientId),
    [items],
  );

  const markReadMutation = useMutation({
    mutationFn: (input: { recipientIds: string[]; actionTaken?: string }) =>
      markNotificationsRead(input),
    onSuccess: invalidateNotifications,
    onError: (mutationError) => {
      toast({
        title: "Unable to update notifications",
        description: getApiErrorMessage(mutationError),
        variant: "destructive",
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (input: { recipientIds: string[] }) =>
      archiveNotifications(input),
    onSuccess: invalidateNotifications,
    onError: (mutationError) => {
      toast({
        title: "Unable to archive notifications",
        description: getApiErrorMessage(mutationError),
        variant: "destructive",
      });
    },
  });

  const quickActionMutation = useMutation({
    mutationFn: async (input: {
      item: NotificationListItem;
      action: NotificationAction;
    }) => {
      await fetchJson(input.action.href, {
        method: input.action.method ?? "POST",
      });
      await markNotificationsRead({
        recipientIds: [input.item.recipientId],
        actionTaken: input.action.key,
      });
    },
    onSuccess: () => {
      const queryPrefixes = [
        ["notifications"],
        ["payroll-runs"],
        ["payroll-periods"],
        ["disbursement-batches"],
        ["compensation-profiles"],
        ["compensation-rules"],
        ["gold-shift-allocations"],
        ["employee-payments"],
        ["approval-history"],
        ["work-orders"],
        ["compliance", "permits"],
        ["compliance", "incidents"],
      ];
      queryPrefixes.forEach((queryKey) => {
        queryClient.invalidateQueries({ queryKey });
      });
      toast({
        title: "Action completed",
        description: "The workflow has been updated.",
      });
    },
    onError: (mutationError) => {
      toast({
        title: "Unable to complete action",
        description: getApiErrorMessage(mutationError),
        variant: "destructive",
      });
    },
  });

  const runQuickAction = (
    item: NotificationListItem,
    action: NotificationAction,
  ) => {
    if (action.kind !== "api") return;
    if (action.confirmMessage && !window.confirm(action.confirmMessage)) {
      return;
    }
    quickActionMutation.mutate({ item, action });
  };

  if (!centerEnabled || featureDisabled) {
    return <>{children}</>;
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (nextOpen) invalidateNotifications();
      }}
    >
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent side={side} align={align} sideOffset={side === "right" ? 12 : 6} className="w-[min(96vw,520px)] p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <p className="m-0 text-[13px] font-semibold">Notifications</p>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={filterMode === "unread" ? "secondary" : "ghost"}
              onClick={() => setFilterMode("unread")}
            >
              Unread
            </Button>
            <Button
              size="sm"
              variant={filterMode === "all" ? "secondary" : "ghost"}
              onClick={() => setFilterMode("all")}
            >
              All
            </Button>
          </div>
        </div>
        <div className="h-px bg-[var(--line)]" />

        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-muted-foreground">
            {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={unreadIds.length === 0 || markReadMutation.isPending}
            onClick={() => markReadMutation.mutate({ recipientIds: unreadIds })}
          >
            Mark all read
          </Button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-3 pb-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading notifications...
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {getApiErrorMessage(error)}
            </div>
          ) : items.length === 0 ? null : (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.recipientId}
                  className={cn(
                    "rounded-md border p-3",
                    item.isRead ? "bg-card" : "bg-primary/5 border-primary/30",
                  )}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant={severityBadgeVariant(item.severity)}>
                      {item.severity}
                    </Badge>
                    <Badge variant="outline">{formatType(item.type)}</Badge>
                    {!item.isRead ? (
                      <span className="ml-auto h-2 w-2 rounded-full bg-primary" />
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm font-semibold">{item.title}</p>
                    <NotificationRichBody item={item} />
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(item.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {item.actions.map((action) => {
                      if (action.kind === "link") {
                        return (
                          <Button
                            key={action.key}
                            size="sm"
                            variant={actionButtonVariant(action)}
                            asChild
                          >
                            <Link
                              href={action.href}
                              onClick={() => {
                                if (!item.isRead) {
                                  markReadMutation.mutate({
                                    recipientIds: [item.recipientId],
                                    actionTaken: action.key,
                                  });
                                }
                              }}
                            >
                              {action.label}
                            </Link>
                          </Button>
                        );
                      }

                      return (
                        <Button
                          key={action.key}
                          size="sm"
                          variant={actionButtonVariant(action)}
                          disabled={quickActionMutation.isPending}
                          onClick={() => runQuickAction(item, action)}
                        >
                          {action.label}
                        </Button>
                      );
                    })}

                    {!item.isRead ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={markReadMutation.isPending}
                        onClick={() =>
                          markReadMutation.mutate({
                            recipientIds: [item.recipientId],
                          })
                        }
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Mark read
                      </Button>
                    ) : null}

                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={archiveMutation.isPending}
                      onClick={() =>
                        archiveMutation.mutate({
                          recipientIds: [item.recipientId],
                        })
                      }
                    >
                      Archive
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

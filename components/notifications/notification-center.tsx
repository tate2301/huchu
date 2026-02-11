"use client"

import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { NotificationRichBody } from "@/components/notifications/notification-renderers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/use-toast"
import { useNotificationStream } from "@/hooks/use-notification-stream"
import {
  archiveNotifications,
  fetchNotifications,
  markNotificationsRead,
  type NotificationAction,
  type NotificationListItem,
  type NotificationSeverity,
} from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"
import { Bell, CheckCircle2, Loader2 } from "@/lib/icons"
import { cn } from "@/lib/utils"

type FilterMode = "unread" | "all"

function severityBadgeVariant(severity: NotificationSeverity) {
  if (severity === "CRITICAL") return "destructive"
  if (severity === "WARNING") return "secondary"
  return "outline"
}

function formatType(type: string) {
  return type
    .replace(/^HR_/, "HR ")
    .replace(/^OPS_/, "OPS ")
    .replace(/_/g, " ")
}

function actionButtonVariant(action: NotificationAction) {
  return action.variant ?? "outline"
}

export function NotificationCenter() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [filterMode, setFilterMode] = useState<FilterMode>("unread")

  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications", filterMode],
    queryFn: () =>
      fetchNotifications({
        unreadOnly: filterMode === "unread",
        limit: 30,
      }),
    staleTime: 5000,
    refetchInterval: 30000,
  })

  const invalidateNotifications = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] })
  }, [queryClient])

  useNotificationStream(invalidateNotifications)

  const items = useMemo(() => data?.data ?? [], [data])
  const unreadCount = data?.unreadCount ?? 0
  const unreadIds = useMemo(
    () => items.filter((item) => !item.isRead).map((item) => item.recipientId),
    [items],
  )

  const markReadMutation = useMutation({
    mutationFn: (input: { recipientIds: string[]; actionTaken?: string }) =>
      markNotificationsRead(input),
    onSuccess: invalidateNotifications,
    onError: (mutationError) => {
      toast({
        title: "Unable to update notifications",
        description: getApiErrorMessage(mutationError),
        variant: "destructive",
      })
    },
  })

  const archiveMutation = useMutation({
    mutationFn: (input: { recipientIds: string[] }) => archiveNotifications(input),
    onSuccess: invalidateNotifications,
    onError: (mutationError) => {
      toast({
        title: "Unable to archive notifications",
        description: getApiErrorMessage(mutationError),
        variant: "destructive",
      })
    },
  })

  const quickActionMutation = useMutation({
    mutationFn: async (input: { item: NotificationListItem; action: NotificationAction }) => {
      await fetchJson(input.action.href, {
        method: input.action.method ?? "POST",
      })
      await markNotificationsRead({
        recipientIds: [input.item.recipientId],
        actionTaken: input.action.key,
      })
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
      ]
      queryPrefixes.forEach((queryKey) => {
        queryClient.invalidateQueries({ queryKey })
      })
      toast({
        title: "Action completed",
        description: "The workflow has been updated.",
      })
    },
    onError: (mutationError) => {
      toast({
        title: "Unable to complete action",
        description: getApiErrorMessage(mutationError),
        variant: "destructive",
      })
    },
  })

  const runQuickAction = (item: NotificationListItem, action: NotificationAction) => {
    if (action.kind !== "api") return
    if (action.confirmMessage && !window.confirm(action.confirmMessage)) {
      return
    }
    quickActionMutation.mutate({ item, action })
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) invalidateNotifications()
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 ? (
            <span className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-[min(96vw,520px)] p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0">Notification Centre</DropdownMenuLabel>
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
        <DropdownMenuSeparator />

        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs text-muted-foreground">
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
          ) : items.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No notifications in this view.
            </div>
          ) : (
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
                    <Badge variant={severityBadgeVariant(item.severity)}>{item.severity}</Badge>
                    <Badge variant="outline">{formatType(item.type)}</Badge>
                    {!item.isRead ? <span className="ml-auto h-2 w-2 rounded-full bg-primary" /> : null}
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm font-semibold">{item.title}</p>
                    <NotificationRichBody item={item} />
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {item.actions.map((action) => {
                      if (action.kind === "link") {
                        return (
                          <Button key={action.key} size="sm" variant={actionButtonVariant(action)} asChild>
                            <Link
                              href={action.href}
                              onClick={() => {
                                if (!item.isRead) {
                                  markReadMutation.mutate({
                                    recipientIds: [item.recipientId],
                                    actionTaken: action.key,
                                  })
                                }
                              }}
                            >
                              {action.label}
                            </Link>
                          </Button>
                        )
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
                      )
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

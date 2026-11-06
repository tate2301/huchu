"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Icon, Kit, Segmented } from "@/components/core";
import { useEmergencyAlerts } from "@/components/alerts/emergency-alert-host";
import { InboxRow, InboxSkeleton, rowFromItem } from "@/components/notifications/inbox-row";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useToast } from "@/components/ui/use-toast";
import { fetchNotifications } from "@/lib/api";
import { ApiError, getApiErrorMessage } from "@/lib/api-client";
import { fetchInbox, markAllInboxRead, markInboxRead, type InboxItem } from "@/lib/inbox/api";
import { todayAndEarlier } from "@/lib/inbox/describe";
import { canAccessCapabilityWithToken } from "@/lib/platform/gating/token-check";

import styles from "./inbox.module.css";

/** How many rows the bell shows before "See all". */
const BELL_ROWS = 8;

type BellView = "needs" | "all";

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
  const { feed: emergencyFeed } = useEmergencyAlerts();
  const { data } = useQuery({
    queryKey: ["notifications", "unread-count"],
    enabled,
    queryFn: () => fetchNotifications({ unreadOnly: true, limit: 1 }),
    staleTime: 5000,
    refetchInterval: 30000,
  });
  const emergencyCount = emergencyFeed?.counts.total ?? 0;
  return (enabled ? (data?.unreadCount ?? 0) : 0) + emergencyCount;
}

/** Mark read, mark all read: both refresh every `["notifications"]` query, the bell's count with them. */
export function useInboxMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const refresh = React.useCallback(() => queryClient.invalidateQueries({ queryKey: ["notifications"] }), [queryClient]);
  const onError = (error: unknown) =>
    toast({ title: "The notifications did not update", description: getApiErrorMessage(error), variant: "destructive" });

  const markRead = useMutation({
    mutationFn: (ids: string[]) => markInboxRead(ids),
    onMutate: async (ids) => {
      // Read at once: the dot goes before the server answers.
      queryClient.setQueriesData<{ items: InboxItem[] } | undefined>({ queryKey: ["notifications", "inbox"] }, (data) =>
        data && Array.isArray(data.items)
          ? { ...data, items: data.items.map((item) => (ids.includes(item.id) ? { ...item, isRead: true } : item)) }
          : data,
      );
    },
    onSettled: refresh,
    onError,
  });
  const markAll = useMutation({ mutationFn: markAllInboxRead, onSettled: refresh, onError });
  return { markRead, markAll };
}

/**
 * The bell's panel, anchored to `children`: under the app bar's bell
 * (`side="bottom"`), or to the right of the rail from the account menu.
 *
 * Needs you, or everything; up to eight rows by today and earlier. A row goes
 * to its record and is read. See all opens /activity, where each one opens
 * one level deeper.
 */
export function NotificationCenter({
  open,
  onOpenChange,
  children,
  side = "right",
  align = "start",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  side?: "right" | "bottom";
  align?: "start" | "end";
}) {
  const centerEnabled = useNotificationsEnabled();
  const { feed: emergencyFeed } = useEmergencyAlerts();
  if (!centerEnabled && (emergencyFeed?.counts.total ?? 0) === 0) return <>{children}</>;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent side={side} align={align} sideOffset={side === "right" ? 12 : 6} className="w-auto p-0">
        {open ? <BellPanel onClose={() => onOpenChange(false)} /> : null}
      </PopoverContent>
    </Popover>
  );
}

function BellPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [view, setView] = React.useState<BellView>("needs");
  const { markRead, markAll } = useInboxMutations();
  const {
    feed: emergencyFeed,
    openEmergencyDialog,
    runSingleWorkflow,
    runningItemId,
  } = useEmergencyAlerts();
  const now = useNow();

  const inbox = useQuery({
    queryKey: ["notifications", "inbox", "bell", view],
    queryFn: () => fetchInbox({ view, limit: BELL_ROWS }),
    staleTime: 5000,
    refetchInterval: 30000,
  });

  const items = inbox.data?.items ?? [];
  const emergencyItems = emergencyFeed?.items ?? [];
  const groups = todayAndEarlier(items, now);
  const needs = (inbox.data?.counts.needs ?? 0) + emergencyItems.length;
  const unread = inbox.data?.counts.unread ?? 0;
  const featureOff = inbox.error instanceof ApiError && inbox.error.status === 403;

  return (
    <Kit className={styles.bell}>
      <div className={styles.bellHead}>
        <Segmented<BellView>
          label="Show"
          value={view}
          onChange={setView}
          items={[
            { value: "needs", label: "Needs you", count: needs > 0 ? needs : undefined },
            { value: "all", label: "Everything" },
          ]}
        />
        <Link
          href="/preferences/notifications"
          className={`${styles.link} ${styles.iconLink} end`}
          style={{ marginLeft: "auto" }}
          aria-label="Notification settings"
          title="Notification settings"
          onClick={onClose}
        >
          <Icon name="gear" />
        </Link>
      </div>

      <div className={styles.bellList}>
        {emergencyItems.length > 0 ? (
          <section aria-label="Day close and emergency alerts" className="mb-1 border-b border-[var(--color-line)] pb-2">
            <div className={styles.day} style={{ justifyContent: "space-between" }}>
              <h3 className="flex items-center gap-1.5 font-semibold text-[var(--color-ink)]">
                <span
                  aria-hidden="true"
                  className={
                    emergencyFeed?.counts.critical
                      ? "inline-block size-2 rounded-full bg-red-600"
                      : "inline-block size-2 rounded-full bg-amber-500"
                  }
                />
                Close the day ({emergencyItems.length})
              </h3>
              <button
                type="button"
                className={styles.link}
                style={{ height: 22, padding: "0 6px", fontSize: 12 }}
                onClick={() => {
                  onClose();
                  openEmergencyDialog();
                }}
              >
                Open workflow
              </button>
            </div>
            <ul className={styles.list}>
              {emergencyItems.slice(0, 4).map((alert) => {
                const isRunning = runningItemId === alert.id;
                return (
                  <li key={alert.id} className={styles.row} data-unread="true">
                    <div className="flex flex-col gap-1.5 rounded-[8px] px-3 py-2">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--color-muted)]">
                        <span className="font-medium text-[var(--color-ink-2)]">
                          {alert.moduleLabel} · {alert.dayLabel}
                        </span>
                        {alert.isPastDay ? (
                          <span className="rounded bg-red-500/15 px-1.5 py-0.5 font-medium text-red-700 dark:text-red-300">
                            Overdue
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[13px] font-medium leading-snug text-[var(--color-ink)]">
                        {alert.title}
                      </div>
                      <div className="text-[12px] text-[var(--color-muted)]">{alert.summary}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Link
                          href={alert.shortcut.href}
                          className={styles.link}
                          style={{ height: 24, padding: "0 8px", fontSize: 12, background: "var(--color-fill)" }}
                          onClick={onClose}
                        >
                          {alert.shortcut.label} →
                        </Link>
                        {alert.workflow?.canRunInPlace ? (
                          <button
                            type="button"
                            disabled={isRunning}
                            className={styles.link}
                            style={{
                              height: 24,
                              padding: "0 8px",
                              fontSize: 12,
                              fontWeight: 500,
                              color: "var(--color-accent)",
                            }}
                            onClick={() => void runSingleWorkflow({ item: alert })}
                          >
                            {isRunning ? "Closing…" : alert.workflow.label}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {inbox.isLoading ? (
          <InboxSkeleton rows={4} />
        ) : featureOff ? (
          emergencyItems.length === 0 ? (
            <p className={styles.quiet}>Notifications are off for this workspace.</p>
          ) : null
        ) : inbox.isError ? (
          <p className={styles.quiet} role="alert">
            The notifications did not load.{" "}
            <button type="button" className={styles.link} style={{ height: "auto", padding: 0, textDecoration: "underline" }} onClick={() => void inbox.refetch()}>
              Try again
            </button>
          </p>
        ) : items.length === 0 ? (
          emergencyItems.length === 0 ? (
            <p className={styles.quiet}>{view === "needs" ? "Nothing needs you." : "No notifications yet."}</p>
          ) : null
        ) : (
          groups.map((group) => (
            <section key={group.key} aria-labelledby={`bell-${group.key}`}>
              <div className={styles.day}>
                <h3 id={`bell-${group.key}`}>{group.label}</h3>
              </div>
              <ul className={styles.list}>
                {group.items.map((item) => {
                  const row = rowFromItem(item);
                  const read = () => {
                    if (!item.isRead) markRead.mutate([item.id]);
                    onClose();
                  };
                  return (
                    <InboxRow
                      key={item.id}
                      row={row.href ? row : { ...row, href: `/activity?view=all&n=${item.id}` }}
                      now={now}
                      as="link"
                      onActivate={read}
                      onOpen={read}
                      onMarkRead={() => markRead.mutate([item.id])}
                    />
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className={styles.bellFoot}>
        <button
          type="button"
          className={styles.link}
          onClick={() => {
            onClose();
            router.push(view === "needs" ? "/activity" : "/activity?view=all");
          }}
        >
          See all
          <Icon name="chev" />
        </button>
        <button type="button" className={styles.link} disabled={unread === 0 || markAll.isPending} onClick={() => markAll.mutate()}>
          Mark all read
        </button>
      </div>
    </Kit>
  );
}

/** "Now", for relative times; moves once a minute. */
export function useNow(): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

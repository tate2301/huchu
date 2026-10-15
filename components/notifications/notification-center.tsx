"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Icon, Kit, Segmented } from "@/components/core";
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
  const { data } = useQuery({
    queryKey: ["notifications", "unread-count"],
    enabled,
    queryFn: () => fetchNotifications({ unreadOnly: true, limit: 1 }),
    staleTime: 5000,
    refetchInterval: 30000,
  });
  return enabled ? (data?.unreadCount ?? 0) : 0;
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
  if (!centerEnabled) return <>{children}</>;

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
  const now = useNow();

  const inbox = useQuery({
    queryKey: ["notifications", "inbox", "bell", view],
    queryFn: () => fetchInbox({ view, limit: BELL_ROWS }),
    staleTime: 5000,
    refetchInterval: 30000,
  });

  const items = inbox.data?.items ?? [];
  const groups = todayAndEarlier(items, now);
  const needs = inbox.data?.counts.needs ?? 0;
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
        {inbox.isLoading ? (
          <InboxSkeleton rows={4} />
        ) : featureOff ? (
          <p className={styles.quiet}>Notifications are off for this workspace.</p>
        ) : inbox.isError ? (
          <p className={styles.quiet} role="alert">
            The notifications did not load.{" "}
            <button type="button" className={styles.link} style={{ height: "auto", padding: 0, textDecoration: "underline" }} onClick={() => void inbox.refetch()}>
              Try again
            </button>
          </p>
        ) : items.length === 0 ? (
          <p className={styles.quiet}>{view === "needs" ? "Nothing needs you." : "No notifications yet."}</p>
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

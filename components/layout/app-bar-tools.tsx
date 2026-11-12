"use client";

import * as React from "react";

import { useShell } from "@/components/layout/shell-state";
import { ChromeIcon } from "@/components/layout/sidebar/parts";
import { useVaneStatus } from "@/components/vane/use-vane";
import {
  NotificationCenter,
  useNotificationsEnabled,
  useUnreadNotificationCount,
} from "@/components/notifications/notification-center";
import { useEmergencyAlerts } from "@/components/alerts/emergency-alert-host";
import { cn } from "@/lib/utils";

import bar from "./app-bar.module.css";

const noopSubscribe = () => () => {};

/** Search everything: an icon (Ctrl K) that opens the one command palette. */
export function SearchTrigger() {
  const shell = useShell();
  return (
    <button
      type="button"
      aria-label="Search, Ctrl K"
      title="Search · Ctrl K"
      aria-keyshortcuts="Meta+K Control+K"
      aria-expanded={shell.commandOpen}
      className={bar.tool}
      onClick={() => shell.setCommandOpen(true)}
    >
      <ChromeIcon name="search" className={bar.ic} />
    </button>
  );
}

/**
 * The bell: a quiet dot while something is new (red when something is
 * critical), never a count; the count is in its name. It opens the
 * notification panel under it.
 */
export function NotificationsBell() {
  const enabled = useNotificationsEnabled();
  const unread = useUnreadNotificationCount();
  const { feed: emergencyFeed } = useEmergencyAlerts();
  // One panel for the shell: the bell and the command palette both open it.
  const { notificationsOpen: open, setNotificationsOpen: setOpen } = useShell();
  // The count comes from the browser's cache, so it is drawn after hydration.
  const mounted = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  const hasEmergencyAlerts = (emergencyFeed?.counts.total ?? 0) > 0;
  const critical = (emergencyFeed?.counts.critical ?? 0) > 0;
  if (!enabled && !hasEmergencyAlerts) return null;
  const count = mounted ? unread : 0;
  const label = count > 0 ? `Notifications, ${count} new` : "Notifications";
  return (
    <NotificationCenter open={open} onOpenChange={setOpen} side="bottom" align="end">
      <button type="button" aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open} className={bar.tool} onClick={() => setOpen(true)}>
        <ChromeIcon name="bell" className={bar.ic} />
        {count > 0 ? <span aria-hidden="true" className={cn(bar.dot, critical && bar.crit)} /> : null}
      </button>
    </NotificationCenter>
  );
}

/**
 * Vane: its mark, "Vane", the count of what is ready for this person and a
 * dot while it works; pressed while its panel is open (Ctrl J). Under 1100px
 * and on a phone, the mark and the dot.
 */
export function VaneBarButton() {
  const shell = useShell();
  const status = useVaneStatus();
  const count = status.data?.open ?? 0;
  const working = Boolean(status.data?.working);
  return (
    <button
      type="button"
      className={bar.vane}
      aria-pressed={shell.vaneOpen}
      aria-label={count > 0 ? `Vane, ${count} ready for you` : "Vane"}
      aria-keyshortcuts="Control+J Meta+J"
      onClick={() => {
        if (shell.drawerOpen) shell.setDrawerOpen(false);
        shell.setVaneOpen(!shell.vaneOpen);
      }}
    >
      <ChromeIcon name="vane" className={bar.ic} />
      <span className={bar.vaneWord}>Vane</span>
      {count > 0 ? <span className={bar.vaneCount}>{count > 99 ? "99+" : count}</span> : null}
      {working ? <span className={bar.live} aria-hidden="true" /> : null}
    </button>
  );
}

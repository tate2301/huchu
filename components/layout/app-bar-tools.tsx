"use client";

import * as React from "react";

import { useShell } from "@/components/layout/shell-state";
import { OfflineStatusButton } from "@/components/layout/offline-status-button";
import {
  NotificationCenter,
  useNotificationsEnabled,
  useUnreadNotificationCount,
} from "@/components/notifications/notification-center";
import { Bell, MagnifyingGlass, SidebarSimple } from "@/lib/icons";
import { cn } from "@/lib/utils";

const ICON_BUTTON =
  "relative flex size-8 shrink-0 items-center justify-center rounded-[8px] border-0 bg-transparent text-[var(--ink-3)] hover:bg-[var(--hover)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]";

/** Hides or shows the panel beside the rail, as the panel's own button and Cmd/Ctrl+B do. */
export function SidebarToggle() {
  const shell = useShell();
  const label = shell.panelShown ? "Hide the sidebar" : "Show the sidebar";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-keyshortcuts="Meta+B Control+B"
      className={ICON_BUTTON}
      onClick={shell.togglePanel}
    >
      <SidebarSimple className="size-[18px]" aria-hidden="true" />
    </button>
  );
}

/**
 * The bar's way into search: a field-shaped trigger (an icon on a phone). It
 * opens the one command palette; the panel's Search and Cmd/Ctrl+K open the
 * same one.
 */
export function SearchTrigger({ compact = false }: { compact?: boolean }) {
  const shell = useShell();
  if (compact) {
    return (
      <button
        type="button"
        aria-label="Search records and actions"
        className={cn(ICON_BUTTON, "size-11")}
        onClick={() => shell.setCommandOpen(true)}
      >
        <MagnifyingGlass className="size-5" aria-hidden="true" />
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label="Search records and actions"
      aria-keyshortcuts="Meta+K Control+K"
      onClick={() => shell.setCommandOpen(true)}
      className="flex h-8 w-36 shrink-0 items-center gap-2 rounded-[8px] border-0 bg-[var(--ground)] px-2.5 text-left text-[13px] text-[var(--ink-3)] hover:text-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)] min-[1100px]:w-56"
    >
      <MagnifyingGlass className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">Search</span>
      <kbd className="shrink-0 font-mono text-[var(--ink-3)]" style={{ fontSize: 11 }}>
        ⌘K
      </kbd>
    </button>
  );
}

/** The bell with its unread count, opening the notification panel under it. */
export function NotificationsBell({ compact = false }: { compact?: boolean }) {
  const enabled = useNotificationsEnabled();
  const unread = useUnreadNotificationCount();
  const [open, setOpen] = React.useState(false);
  // The count comes from the browser's cache, so it is drawn after hydration.
  const mounted = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  if (!enabled) return null;
  const count = mounted ? unread : 0;
  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  return (
    <NotificationCenter open={open} onOpenChange={setOpen} side="bottom" align="end" live={false}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(ICON_BUTTON, compact && "size-11")}
        onClick={() => setOpen(true)}
      >
        <Bell className="size-[18px]" aria-hidden="true" />
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--action)] px-1 font-mono font-semibold leading-none text-white"
            style={{ fontSize: 10 }}
          >
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
    </NotificationCenter>
  );
}

const noopSubscribe = () => () => {};

/** The device's sync state, opening the offline panel. */
export function DeviceStatus({ compact = false }: { compact?: boolean }) {
  return <OfflineStatusButton className={cn("rounded-[8px] text-[var(--ink-3)]", compact && "size-11")} />;
}

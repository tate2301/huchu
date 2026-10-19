"use client";

import * as React from "react";

import { useShell } from "@/components/layout/shell-state";
import { OfflineStatusButton } from "@/components/layout/offline-status-button";
import {
  NotificationCenter,
  useNotificationsEnabled,
  useUnreadNotificationCount,
} from "@/components/notifications/notification-center";
import { Bell, MagnifyingGlass } from "@/lib/icons";
import { cn } from "@/lib/utils";


/** The kit's quiet icon button (`.btn-quiet.btn-icon`): 32px, ink 2, a fill on hover. */
const ICON_BUTTON =
  "relative flex size-8 shrink-0 items-center justify-center rounded-[7px] border-0 bg-transparent text-[var(--ink-2)] hover:bg-[var(--tray)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]";

/**
 * Search everything: a field-shaped trigger 240px wide, as the kit draws it
 * (`.tb-find`), an icon below 1100px and on a phone. It opens the one command
 * palette, as Ctrl K does.
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
  // The owner, 19 Oct: Search is an icon button on the far right (Ctrl K), never a wide field in the bar.
  return (
    <button
      type="button"
      aria-label="Search everything, Ctrl K"
      title="Search · Ctrl K"
      aria-keyshortcuts="Meta+K Control+K"
      className={ICON_BUTTON}
      onClick={() => shell.setCommandOpen(true)}
    >
      <MagnifyingGlass className="size-4" aria-hidden="true" />
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
    <NotificationCenter open={open} onOpenChange={setOpen} side="bottom" align="end">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(ICON_BUTTON, compact && "size-11")}
        onClick={() => setOpen(true)}
      >
        <Bell weight="fill" className="size-4" aria-hidden="true" />
        {/* A quiet dot, not a count: the panel's Needs you says how many. The name carries the number. */}
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[var(--action)] shadow-[0_0_0_2px_var(--surface)]"
          />
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

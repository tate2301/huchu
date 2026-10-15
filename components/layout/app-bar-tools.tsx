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

import { Kbd, Kit } from "@/components/core";

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
  return (
    <>
      <button
        type="button"
        aria-label="Search everything"
        aria-keyshortcuts="Meta+K Control+K"
        className={cn(ICON_BUTTON, "min-[1100px]:hidden")}
        onClick={() => shell.setCommandOpen(true)}
      >
        <MagnifyingGlass className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Search everything"
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => shell.setCommandOpen(true)}
        className="flex h-8 w-[240px] shrink-0 items-center gap-2 rounded-[6px] border-0 bg-[var(--surface)] px-3 text-left text-[14px] text-[var(--ink-3)] shadow-[0_0_0_1px_color-mix(in_oklab,var(--ink)_7%,transparent),0_1px_2px_color-mix(in_oklab,var(--ink)_5%,transparent)] hover:shadow-[0_0_0_1px_var(--line-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)] max-[1099px]:hidden"
      >
        <MagnifyingGlass className="size-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">Search everything</span>
        <Kit contents>
          <Kbd>Ctrl K</Kbd>
        </Kit>
      </button>
    </>
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

"use client";

import * as React from "react";
import Link from "next/link";

import { OfflineStatusDialog } from "@/components/layout/offline-status-row";
import { useOfflineRuntime } from "@/components/offline/offline-runtime";
import { OFFLINE_STATUS_WORD } from "@/lib/offline/status-words";
import type { ChromeIconName } from "@/lib/nav/chrome";
import type { OfflineStatus } from "@/lib/offline/types";
import { cn } from "@/lib/utils";

import { ChromeIcon, CorelithMark } from "./parts";
import styles from "./sidebar.module.css";

const noopSubscribe = () => () => {};

const FOOT_SYNC = {
  ONLINE: { icon: "ready", tone: "ok" },
  OFFLINE: { icon: "offline", tone: "warn" },
  ATTENTION: { icon: "attention", tone: "bad" },
  SYNCING: { icon: "syncing", tone: "ok" },
  PREPARING: { icon: "syncing", tone: "ok" },
  UPDATE_READY: { icon: "update", tone: "ok" },
} as const satisfies Record<OfflineStatus, { icon: ChromeIconName; tone: "ok" | "warn" | "bad" }>;

/** The device's state in the foot's words: what the Tools board on the App bar page draws. */
function useFootSync() {
  const { status } = useOfflineRuntime();
  // The device's state is the browser's own, so it is drawn after hydration.
  const mounted = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  const shown: OfflineStatus = mounted ? status : "ONLINE";
  return { word: OFFLINE_STATUS_WORD[shown], ...FOOT_SYNC[shown] };
}

/**
 * The foot of every sidebar: the device's sync state, then Management, Help
 * and Collapse, and the Corelith mark. Management and Collapse are left out
 * where they have no place (inside Management, on the phone).
 */
export function SidebarFoot({
  management,
  onCollapse,
  onNavigate,
}: {
  management?: { href: string; current: boolean } | null;
  onCollapse?: () => void;
  onNavigate?: () => void;
}) {
  const sync = useFootSync();
  const [deviceOpen, setDeviceOpen] = React.useState(false);
  return (
    <div className={styles.foot}>
      <div className={styles.footRow}>
        <button
          type="button"
          className={cn(styles.sync, sync.tone === "warn" && styles.warn, sync.tone === "bad" && styles.bad)}
          onClick={() => setDeviceOpen(true)}
        >
          <ChromeIcon name={sync.icon} className={styles.ic14} />
          <span className={styles.syncWord}>{sync.word}</span>
        </button>
        {management ? (
          <Link
            href={management.href}
            className={styles.ib}
            aria-label="Management"
            aria-current={management.current ? "page" : undefined}
            onClick={onNavigate}
          >
            <ChromeIcon name="management" className={styles.ic} />
          </Link>
        ) : null}
        <Link href="/help" className={styles.ib} aria-label="Help" onClick={onNavigate}>
          <ChromeIcon name="help" className={styles.ic} />
        </Link>
        {onCollapse ? (
          <button type="button" className={styles.ib} aria-label="Collapse the sidebar, [" aria-keyshortcuts="[" onClick={onCollapse}>
            <ChromeIcon name="collapse" className={styles.ic} />
          </button>
        ) : null}
      </div>
      <div className={styles.brand}>
        <CorelithMark className={styles.brandMark} />
        <span>
          <b>Corelith</b>
        </span>
      </div>
      <OfflineStatusDialog open={deviceOpen} onOpenChange={setDeviceOpen} />
    </div>
  );
}

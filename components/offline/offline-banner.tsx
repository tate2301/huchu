"use client";

/**
 * The connectivity strip: shown only while the line is down, and says only
 * when it went. What is waiting, and what can still be done, is in Device sync.
 */

import { WifiOff } from "@/lib/icons";
import { useOfflineRuntime } from "@/components/offline/offline-runtime";
import { formatSyncTime } from "@/components/layout/offline-runtime-panel";
import { cn } from "@/lib/utils";

export function OfflineBanner({ className }: { className?: string }) {
  const { isOffline, lastOnlineAt } = useOfflineRuntime();
  if (!isOffline) return null;

  const since = formatSyncTime(lastOnlineAt);
  return (
    <div
      role="status"
      className={cn(
        "flex h-10 items-center gap-2 border-b border-[var(--border-default)] bg-[var(--status-warning-bg)] px-4 text-[13px] font-medium text-[var(--status-warning-text)]",
        className,
      )}
    >
      <WifiOff size={16} className="shrink-0" aria-hidden />
      <span className="truncate">No connection{since ? ` since ${since}` : ""}</span>
    </div>
  );
}

"use client";

import { useState, type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { OfflineRuntimePanel } from "@/components/layout/offline-runtime-panel";
import { getOfflineStatusTone } from "@/components/layout/offline-status-tone";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useOfflineRuntime } from "@/components/providers/offline-provider";

export function OfflineStatusIndicator() {
  const { status, statusLabel, pendingCount, blockingCount, syncNow } =
    useOfflineRuntime();
  const tone = getOfflineStatusTone(status);
  const StatusIcon = tone.icon;
  const [open, setOpen] = useState(false);
  const hasUrgency = pendingCount > 0 || blockingCount > 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div className="inline-flex items-center gap-2">
        <SheetTrigger asChild>
          <button
            type="button"
            aria-expanded={open}
            style={{ "--status-chip": `var(${tone.colorVar})` } as CSSProperties}
            className={[
              "group inline-flex h-8 items-center gap-2 overflow-hidden rounded-full border px-3 text-xs font-medium outline-none",
              "border-[color-mix(in_srgb,var(--status-chip)_16%,transparent)] bg-[color-mix(in_srgb,var(--status-chip)_12%,var(--surface-base))] text-[var(--status-chip)]",
              "transition-[transform,background-color,border-color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              "motion-safe:hover:-translate-y-px motion-safe:hover:scale-[1.015] motion-safe:active:scale-[0.985]",
              "hover:bg-[color-mix(in_srgb,var(--status-chip)_16%,var(--surface-base))] focus-visible:ring-2 focus-visible:ring-ring/25",
              open
                ? "shadow-[0_10px_24px_-18px_rgba(17,17,17,0.3)]"
                : "shadow-[0_6px_18px_-18px_rgba(17,17,17,0.22)]",
            ].join(" ")}
          >
            <StatusIcon
              className={[
                "size-3.5 transition-transform duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:group-hover:scale-[1.12]",
                tone.iconClassName ?? "",
              ].join(" ")}
            />
            <span
              className={[
                "transition-[transform,opacity] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                open ? "motion-safe:translate-x-[1px]" : "",
              ].join(" ")}
            >
              {statusLabel}
            </span>
            {pendingCount > 0 ? (
              <span
                className={[
                  "rounded-full bg-[color-mix(in_srgb,var(--status-chip)_10%,var(--surface-base))] px-1.5 py-0.5 font-mono tabular-nums text-[color-mix(in_srgb,var(--status-chip)_72%,var(--text-strong))]",
                  "transition-[transform,opacity,background-color] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-1 motion-safe:duration-200",
                  hasUrgency ? "motion-safe:group-hover:scale-[1.06]" : "",
                ].join(" ")}
              >
                {pendingCount}
              </span>
            ) : null}
            {blockingCount > 0 ? (
              <span
                className={[
                  "rounded-full bg-[color-mix(in_srgb,var(--status-chip)_10%,var(--surface-base))] px-1.5 py-0.5 font-mono tabular-nums text-[color-mix(in_srgb,var(--status-chip)_72%,var(--text-strong))]",
                  "transition-[transform,opacity,background-color] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-1 motion-safe:duration-200",
                  "motion-safe:group-hover:scale-[1.06]",
                ].join(" ")}
              >
                !{blockingCount}
              </span>
            ) : null}
          </button>
        </SheetTrigger>
        {status !== "SYNCING" && pendingCount > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={[
              "h-8 rounded-full px-3 text-[12px] font-medium text-[var(--text-muted)] hover:text-foreground",
              "transition-[transform,opacity,color,background-color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-1 motion-safe:duration-200",
              "motion-safe:hover:-translate-y-px motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.985]",
            ].join(" ")}
            onClick={() => void syncNow({ force: true })}
          >
            Sync
          </Button>
        ) : null}
      </div>
      <SheetContent
        side="right"
        size="md"
        inset
        className="overflow-hidden bg-[color-mix(in_srgb,var(--surface-base)_96%,white)] p-0 shadow-[var(--shadow-popover)] sm:max-w-[36rem]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Sync and offline</SheetTitle>
          <SheetDescription>
            Current connectivity, warmup readiness, queued sync activity, and app update state.
          </SheetDescription>
        </SheetHeader>
        <OfflineRuntimePanel />
      </SheetContent>
    </Sheet>
  );
}

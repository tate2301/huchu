"use client";

import { useState, type CSSProperties } from "react";

import { OfflineRuntimePanel } from "@/components/layout/offline-runtime-panel";
import { getOfflineStatusTone } from "@/components/layout/offline-status-tone";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useOfflineRuntime } from "@/components/providers/offline-provider";

export function OfflineStatusIndicator() {
  const { status, statusLabel, pendingCount, blockingCount } =
    useOfflineRuntime();
  const tone = getOfflineStatusTone(status);
  const StatusIcon = tone.icon;
  const [open, setOpen] = useState(false);
  const hasUrgency = pendingCount > 0 || blockingCount > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        style={{ "--status-chip": `var(${tone.colorVar})` } as CSSProperties}
        className={[
          "group inline-flex h-8 items-center gap-2 overflow-hidden font-medium outline-none",
          "bg-[color-mix(in_srgb,var(--status-chip)_16%,var(--surface-base))] text-[var(--status-chip)]",
          "transition-[transform,background-color,border-color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          "motion-safe:hover:-translate-y-px motion-safe:hover:scale-[1.015] motion-safe:active:scale-[0.985]",
          "hover:bg-[color-mix(in_srgb,var(--status-chip)_20%,var(--surface-base))] focus-visible:ring-2 focus-visible:ring-ring/25",
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
      </DialogTrigger>

      <DialogContent
        size="md"
        inset={false}
        className="overflow-hidden border-[color-mix(in_srgb,var(--border-default)_78%,transparent)] bg-[color-mix(in_srgb,var(--surface-base)_98%,white)] p-0 shadow-[0_28px_60px_-40px_rgba(17,17,17,0.35)] sm:max-w-[40rem]"
      >
        <OfflineRuntimePanel />
      </DialogContent>
    </Dialog>
  );
}

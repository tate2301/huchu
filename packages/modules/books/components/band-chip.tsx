"use client";

import { cn } from "@corelithzw/ui/lib/utils";

/**
 * A labelled figure pinned in the page band.
 *
 * The design gives most accounting pages one or two of these — Open $61,240,
 * Overdue $14,280, Period Aug 2026, Difference 0.00. They sit in the 44px band
 * that never scrolls away, which is the whole point: these are the two or three
 * numbers you need still in view when you are forty rows down a ledger and have
 * forgotten what you were checking against.
 *
 * Deliberately not a `Badge`. A badge is a status word; this is a label and a
 * value with different weights and inks, and the value is mono so a figure that
 * updates does not shift the chip's width on every keystroke of a filter.
 */

export type BandChipTone = "mute" | "ok" | "warn" | "bad" | "info";

const TONE: Record<BandChipTone, { bg: string; bd: string; fg: string; value: string }> = {
  mute: {
    bg: "var(--surface-muted)",
    bd: "var(--border)",
    fg: "var(--text-muted)",
    value: "var(--text-strong)",
  },
  ok: {
    bg: "var(--badge-ok-bg)",
    bd: "var(--tone-success-bd)",
    fg: "var(--badge-ok-fg)",
    value: "var(--badge-ok-fg)",
  },
  warn: {
    bg: "var(--badge-warn-bg)",
    bd: "var(--tone-warn-bd)",
    fg: "var(--badge-warn-fg)",
    value: "var(--badge-warn-fg)",
  },
  bad: {
    bg: "var(--badge-bad-bg)",
    bd: "var(--tone-danger-bd)",
    fg: "var(--badge-bad-fg)",
    value: "var(--badge-bad-fg)",
  },
  info: {
    bg: "var(--brand-soft)",
    bd: "var(--brand-100)",
    fg: "var(--brand-strong)",
    value: "var(--brand-strong)",
  },
};

export function BandChip({
  label,
  value,
  tone = "mute",
  className,
}: {
  label: string;
  value: string;
  tone?: BandChipTone;
  className?: string;
}) {
  const palette = TONE[tone];
  return (
    <span
      className={cn("flex h-6 shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5", className)}
      style={{ background: palette.bg, borderColor: palette.bd }}
    >
      <span className="text-sm" style={{ color: palette.fg }}>
        {label}
      </span>
      <span
        className="font-mono text-sm font-bold tabular-nums"
        style={{ color: palette.value }}
      >
        {value}
      </span>
    </span>
  );
}

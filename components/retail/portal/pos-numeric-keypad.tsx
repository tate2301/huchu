"use client";

import { Delete } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { PosKeypadAction } from "./pos-numeric-input";

type PosNumericKeypadProps = {
  onAction: (action: PosKeypadAction) => void;
  presets?: Array<{ label: string; value: string }>;
  className?: string;
};

const KEYS: Array<{ label: string; action: PosKeypadAction }> = [
  { label: "1", action: { type: "digit", value: "1" } },
  { label: "2", action: { type: "digit", value: "2" } },
  { label: "3", action: { type: "digit", value: "3" } },
  { label: "4", action: { type: "digit", value: "4" } },
  { label: "5", action: { type: "digit", value: "5" } },
  { label: "6", action: { type: "digit", value: "6" } },
  { label: "7", action: { type: "digit", value: "7" } },
  { label: "8", action: { type: "digit", value: "8" } },
  { label: "9", action: { type: "digit", value: "9" } },
  { label: ".", action: { type: "decimal" } },
  { label: "0", action: { type: "digit", value: "0" } },
];

/* ── Style constants ─────────────────────────────────────────── */

const base =
  "flex items-center justify-center rounded-2xl border font-semibold select-none transition-all duration-75 active:scale-[0.92] active:shadow-none h-[3.5rem]";

const numKey = cn(
  base,
  "border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-strong)] text-xl font-bold",
  "shadow-[0_2px_0_var(--border-default)] hover:bg-[var(--surface-muted)]",
  "hover:border-[color-mix(in_srgb,var(--action-primary-bg)_35%,var(--border-default))]",
);

const presetKey = cn(
  base,
  "border-emerald-200 bg-emerald-50 text-emerald-700 text-[12px] font-bold",
  "shadow-[0_2px_0_rgba(16,185,129,0.2)] hover:bg-emerald-100 hover:border-emerald-300",
);

const backspaceKey = cn(
  base,
  "border-[var(--border-default)] bg-[var(--surface-muted)] text-[var(--text-muted)]",
  "shadow-[0_2px_0_var(--border-default)] hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700",
);

const clearKey = cn(
  base,
  "border-red-200 bg-red-50 text-red-600 text-sm font-black tracking-wide",
  "shadow-[0_2px_0_rgba(239,68,68,0.2)] hover:bg-red-100 hover:border-red-300",
);

export function PosNumericKeypad({
  onAction,
  presets = [],
  className,
}: PosNumericKeypadProps) {
  const hasPresets = presets.length > 0;
  const cols = hasPresets ? "grid-cols-4" : "grid-cols-3";

  const rows = [
    KEYS.slice(0, 3),  // 1 2 3
    KEYS.slice(3, 6),  // 4 5 6
    KEYS.slice(6, 9),  // 7 8 9
    KEYS.slice(9, 11), // . 0
  ];

  return (
    <div className={cn("grid gap-2", cols, className)}>
      {/* Row 0: 1 2 3 | preset 0 */}
      {rows[0].map((key) => (
        <button key={key.label} type="button" className={numKey} onClick={() => onAction(key.action)}>
          {key.label}
        </button>
      ))}
      {hasPresets && presets[0] ? (
        <button type="button" className={presetKey} onClick={() => onAction({ type: "preset", value: presets[0].value })}>
          {presets[0].label}
        </button>
      ) : hasPresets ? <div /> : null}

      {/* Row 1: 4 5 6 | preset 1 */}
      {rows[1].map((key) => (
        <button key={key.label} type="button" className={numKey} onClick={() => onAction(key.action)}>
          {key.label}
        </button>
      ))}
      {hasPresets && presets[1] ? (
        <button type="button" className={presetKey} onClick={() => onAction({ type: "preset", value: presets[1].value })}>
          {presets[1].label}
        </button>
      ) : hasPresets ? <div /> : null}

      {/* Row 2: 7 8 9 | preset 2 */}
      {rows[2].map((key) => (
        <button key={key.label} type="button" className={numKey} onClick={() => onAction(key.action)}>
          {key.label}
        </button>
      ))}
      {hasPresets && presets[2] ? (
        <button type="button" className={presetKey} onClick={() => onAction({ type: "preset", value: presets[2].value })}>
          {presets[2].label}
        </button>
      ) : hasPresets ? <div /> : null}

      {/* Row 3: . 0 ⌫ C */}
      {rows[3].map((key) => (
        <button key={key.label} type="button" className={numKey} onClick={() => onAction(key.action)}>
          {key.label}
        </button>
      ))}
      <button type="button" className={backspaceKey} onClick={() => onAction({ type: "backspace" })}>
        <Delete className="h-5 w-5" />
      </button>
      <button type="button" className={clearKey} onClick={() => onAction({ type: "clear" })}>
        CLR
      </button>
    </div>
  );
}

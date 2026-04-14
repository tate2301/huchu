"use client";

import { cn } from "@/lib/utils";
import type { PosKeypadAction } from "./pos-numeric-input";

type PosNumericKeypadProps = {
  onAction: (action: PosKeypadAction) => void;
  presets?: Array<{ label: string; value: string }>;
  className?: string;
};

const KEYS: Array<{ label: string; action: PosKeypadAction; span?: string }> = [
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

const btnBase =
  "flex items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] font-semibold text-[var(--text-strong)] select-none transition-transform duration-75 active:scale-[0.95] active:bg-[var(--surface-muted)] hover:bg-[var(--surface-muted)] h-[3.25rem]";

const presetBtn =
  "flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold text-xs select-none transition-transform duration-75 active:scale-[0.95] active:bg-emerald-100 hover:bg-emerald-100 h-[3.25rem]";

const clearBtn =
  "flex items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 font-semibold text-xs select-none transition-transform duration-75 active:scale-[0.95] active:bg-red-100 hover:bg-red-100 h-[3.25rem]";

const backspaceBtn =
  "flex items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700 font-semibold select-none transition-transform duration-75 active:scale-[0.95] active:bg-amber-100 hover:bg-amber-100 h-[3.25rem]";

export function PosNumericKeypad({
  onAction,
  presets = [],
  className,
}: PosNumericKeypadProps) {
  const hasPresets = presets.length > 0;
  const cols = hasPresets ? "grid-cols-4" : "grid-cols-3";

  // Build rows: row0=[1,2,3], row1=[4,5,6], row2=[7,8,9], row3=[.,0,⌫,C]
  const rows = [
    KEYS.slice(0, 3),
    KEYS.slice(3, 6),
    KEYS.slice(6, 9),
    KEYS.slice(9, 11), // . and 0
  ];

  return (
    <div className={cn("grid gap-1.5", cols, className)}>
      {/* Row 0: 1 2 3 [preset0] */}
      {rows[0].map((key) => (
        <button
          key={key.label}
          type="button"
          className={cn(btnBase, "text-lg")}
          onClick={() => onAction(key.action)}
        >
          {key.label}
        </button>
      ))}
      {hasPresets && presets[0] ? (
        <button
          type="button"
          className={presetBtn}
          onClick={() => onAction({ type: "preset", value: presets[0].value })}
        >
          {presets[0].label}
        </button>
      ) : null}

      {/* Row 1: 4 5 6 [preset1] */}
      {rows[1].map((key) => (
        <button
          key={key.label}
          type="button"
          className={cn(btnBase, "text-lg")}
          onClick={() => onAction(key.action)}
        >
          {key.label}
        </button>
      ))}
      {hasPresets && presets[1] ? (
        <button
          type="button"
          className={presetBtn}
          onClick={() => onAction({ type: "preset", value: presets[1].value })}
        >
          {presets[1].label}
        </button>
      ) : hasPresets ? (
        <div />
      ) : null}

      {/* Row 2: 7 8 9 [preset2] */}
      {rows[2].map((key) => (
        <button
          key={key.label}
          type="button"
          className={cn(btnBase, "text-lg")}
          onClick={() => onAction(key.action)}
        >
          {key.label}
        </button>
      ))}
      {hasPresets && presets[2] ? (
        <button
          type="button"
          className={presetBtn}
          onClick={() => onAction({ type: "preset", value: presets[2].value })}
        >
          {presets[2].label}
        </button>
      ) : hasPresets ? (
        <div />
      ) : null}

      {/* Row 3: . 0 ⌫ C */}
      {rows[3].map((key) => (
        <button
          key={key.label}
          type="button"
          className={cn(btnBase, "text-lg")}
          onClick={() => onAction(key.action)}
        >
          {key.label}
        </button>
      ))}
      <button
        type="button"
        className={backspaceBtn}
        onClick={() => onAction({ type: "backspace" })}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
          <line x1="18" y1="9" x2="12" y2="15" />
          <line x1="12" y1="9" x2="18" y2="15" />
        </svg>
      </button>
      <button
        type="button"
        className={clearBtn}
        onClick={() => onAction({ type: "clear" })}
      >
        C
      </button>
    </div>
  );
}

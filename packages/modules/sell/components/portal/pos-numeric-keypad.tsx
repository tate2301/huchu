"use client";

import { Delete } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";
import type { PosKeypadAction } from "./pos-numeric-input";

type PosNumericKeypadProps = {
  onAction: (action: PosKeypadAction) => void;
  presets?: Array<{ label: string; value: string }>;
  className?: string;
  /**
   * S-7.5. Off for the PIN pad. A key that does nothing on a lock screen is a key
   * a cashier presses twice before deciding the till has frozen, and dropping it
   * leaves the bottom row as 0 · backspace · clear, which fits the three-column
   * grid exactly.
   */
  decimal?: boolean;
  /**
   * Off for the checkout pad, where CLR lives beside the amount readout instead.
   *
   * The three-column grid holds 12 slots over four rows. The PIN pad fills them
   * exactly — nine digits, `0`, backspace, clear — but the checkout pad also
   * carries the decimal point, and a thirteenth key wrapped CLR onto a fifth
   * row of its own. That cost a whole 56px row on a 768px-tall tablet to render
   * one lonely button, and the 56px came out of the basket above it.
   *
   * Moving it out is also safer than shrinking it: a destructive key sitting
   * under the digits is one a thumb reaching for `0` can catch mid-sale.
   */
  clear?: boolean;
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

/* ── Physical-press base class ───────────────────────────────────────── */

/*
 * Key height follows the *viewport height*, not its width.
 *
 * It used to grow at `sm:` — a width breakpoint — which is the wrong axis: a
 * 1024×768 tablet is wide enough to trigger it and short enough that the taller
 * keys pushed the Charge button off the bottom. Whether the pad fits is a
 * question about vertical room, so that is what is measured.
 *
 * 48px is the floor, comfortably over the 44px touch-target minimum.
 */
const base =
  "flex items-center justify-center leading-none rounded-xl border font-semibold select-none h-12 [@media(min-height:820px)]:h-14 3xl:h-[4.5rem] transition-all duration-75 active:translate-y-[2px]";

function numKeyStyle() {
  return {
    background: "var(--pos-key-bg)",
    borderColor: "var(--pos-key-border)",
    boxShadow: "0 3px 0 var(--pos-key-shadow)",
    color: "var(--pos-key-text)",
  } as React.CSSProperties;
}

function presetKeyStyle() {
  return {
    background: "var(--pos-key-preset-bg)",
    borderColor: "var(--pos-key-preset-border)",
    boxShadow: "0 3px 0 var(--pos-key-preset-shadow)",
    color: "var(--pos-key-preset-text)",
    fontSize: "12px",
    fontWeight: 700,
  } as React.CSSProperties;
}

function backspaceKeyStyle() {
  return {
    background: "var(--pos-key-back-bg)",
    borderColor: "var(--pos-key-back-border)",
    boxShadow: "0 3px 0 var(--pos-key-back-shadow)",
    color: "var(--pos-key-back-text)",
  } as React.CSSProperties;
}

function clearKeyStyle() {
  return {
    background: "var(--pos-key-clear-bg)",
    borderColor: "var(--pos-key-clear-border)",
    boxShadow: "0 3px 0 var(--pos-key-clear-shadow)",
    color: "var(--pos-key-clear-text)",
    fontSize: "13px",
    fontWeight: 900,
    letterSpacing: "0.08em",
  } as React.CSSProperties;
}

import type React from "react";

export function PosNumericKeypad({
  onAction,
  presets = [],
  className,
  decimal = true,
  clear = true,
}: PosNumericKeypadProps) {
  const hasPresets = presets.length > 0;
  const cols = hasPresets ? "grid-cols-4" : "grid-cols-3";

  const rows = [
    KEYS.slice(0, 3),
    KEYS.slice(3, 6),
    KEYS.slice(6, 9),
    KEYS.slice(9, 11).filter((key) => decimal || key.action.type !== "decimal"),
  ];

  return (
    <div className={cn("grid gap-2", cols, className)}>
      {rows[0].map((key) => (
        <button key={key.label} type="button" className={cn(base, "text-xl font-black")} style={numKeyStyle()} onClick={() => onAction(key.action)}>
          {key.label}
        </button>
      ))}
      {hasPresets && presets[0] ? (
        <button type="button" className={base} style={presetKeyStyle()} onClick={() => onAction({ type: "preset", value: presets[0].value })}>
          {presets[0].label}
        </button>
      ) : hasPresets ? <div /> : null}

      {rows[1].map((key) => (
        <button key={key.label} type="button" className={cn(base, "text-xl font-black")} style={numKeyStyle()} onClick={() => onAction(key.action)}>
          {key.label}
        </button>
      ))}
      {hasPresets && presets[1] ? (
        <button type="button" className={base} style={presetKeyStyle()} onClick={() => onAction({ type: "preset", value: presets[1].value })}>
          {presets[1].label}
        </button>
      ) : hasPresets ? <div /> : null}

      {rows[2].map((key) => (
        <button key={key.label} type="button" className={cn(base, "text-xl font-black")} style={numKeyStyle()} onClick={() => onAction(key.action)}>
          {key.label}
        </button>
      ))}
      {hasPresets && presets[2] ? (
        <button type="button" className={base} style={presetKeyStyle()} onClick={() => onAction({ type: "preset", value: presets[2].value })}>
          {presets[2].label}
        </button>
      ) : hasPresets ? <div /> : null}

      {rows[3].map((key) => (
        <button key={key.label} type="button" className={cn(base, "text-xl font-black")} style={numKeyStyle()} onClick={() => onAction(key.action)}>
          {key.label}
        </button>
      ))}
      <button type="button" className={base} style={backspaceKeyStyle()} onClick={() => onAction({ type: "backspace" })}>
        <Delete className="h-5 w-5" />
      </button>
      {clear ? (
        <button type="button" className={base} style={clearKeyStyle()} onClick={() => onAction({ type: "clear" })}>
          CLR
        </button>
      ) : null}
    </div>
  );
}

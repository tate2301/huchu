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

/* ── Physical-press base class ───────────────────────────────────────── */

const base =
  "flex items-center justify-center leading-none rounded-xl border font-semibold select-none h-12 sm:h-14 3xl:h-[4.5rem] transition-all duration-75 active:translate-y-[2px]";

function numKeyStyle() {
  return {
    background: "var(--pos-key-bg)",
    borderColor: "var(--pos-key-border)",
    boxShadow: "0 3px 0 var(--pos-key-shadow)",
    color: "var(--pos-key-text)",
  } as React.CSSProperties;
}

function numKeyActiveStyle() {
  return {
    boxShadow: "0 1px 0 var(--pos-key-shadow)",
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
}: PosNumericKeypadProps) {
  const hasPresets = presets.length > 0;
  const cols = hasPresets ? "grid-cols-4" : "grid-cols-3";

  const rows = [
    KEYS.slice(0, 3),
    KEYS.slice(3, 6),
    KEYS.slice(6, 9),
    KEYS.slice(9, 11),
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
      <button type="button" className={base} style={clearKeyStyle()} onClick={() => onAction({ type: "clear" })}>
        CLR
      </button>
    </div>
  );
}

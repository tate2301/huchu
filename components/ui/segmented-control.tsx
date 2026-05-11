"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * SegmentedControl — a compact pill-style switch for 2-5 mutually-exclusive
 * options. Use this when the choices are short and equally likely (e.g.
 * "Activity / Reconcile", "All / Mine"). For longer or unequal choices,
 * reach for Tabs or a Select instead.
 *
 * Visual contract:
 *   - The strip sits on `--surface-muted` so it reads as a control, not a header.
 *   - The active segment lifts to `--surface-base` with `--text-strong`.
 *   - No internal animation — instant feels precise. The eye does the work.
 *
 * Accessibility: implemented as a radiogroup. Arrow keys cycle, Home/End jump.
 */
export type SegmentedControlOption<V extends string> = {
  value: V;
  label: React.ReactNode;
  /** Optional badge count to render right-aligned inside the segment. */
  count?: number;
  disabled?: boolean;
};

export type SegmentedControlProps<V extends string> = {
  value: V;
  onValueChange: (value: V) => void;
  options: ReadonlyArray<SegmentedControlOption<V>>;
  ariaLabel?: string;
  className?: string;
  /** "default" is the chrome strip; "border" gives the strip its own border. */
  variant?: "default" | "border";
  size?: "sm" | "md";
  /** When true the strip stretches to fill its container and segments share width equally. */
  fullWidth?: boolean;
};

export function SegmentedControl<V extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
  variant = "default",
  size = "md",
  fullWidth = false,
}: SegmentedControlProps<V>) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const handleKey = (e: React.KeyboardEvent, idx: number) => {
    const enabled = options
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => !o.disabled);
    if (enabled.length === 0) return;
    const enabledIdx = enabled.findIndex(({ i }) => i === idx);
    let nextEnabled = enabledIdx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextEnabled = (enabledIdx + 1) % enabled.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextEnabled = (enabledIdx - 1 + enabled.length) % enabled.length;
    } else if (e.key === "Home") {
      nextEnabled = 0;
    } else if (e.key === "End") {
      nextEnabled = enabled.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    const target = enabled[nextEnabled];
    refs.current[target.i]?.focus();
    onValueChange(target.o.value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "items-stretch rounded-md p-0.5",
        fullWidth ? "flex w-full" : "inline-flex",
        variant === "default" && "bg-[--surface-muted]",
        variant === "border" && "border border-[--border] bg-[--surface-muted]",
        className,
      )}
    >
      {options.map((opt, idx) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-disabled={opt.disabled || undefined}
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onValueChange(opt.value)}
            onKeyDown={(e) => handleKey(e, idx)}
            tabIndex={active ? 0 : -1}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-[5px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
              fullWidth && "flex-1",
              size === "sm" && "h-6 px-2 text-[11px]",
              size === "md" && "h-7 px-3 text-xs",
              active
                ? "bg-[--surface-base] text-[--text-strong] shadow-[0_1px_0_0_var(--border)]"
                : "text-[--text-muted] hover:text-[--text-body]",
              opt.disabled && "cursor-not-allowed opacity-50 hover:text-[--text-muted]",
            )}
          >
            <span className="truncate">{opt.label}</span>
            {typeof opt.count === "number" && opt.count > 0 ? (
              <span
                className={cn(
                  "rounded px-1 text-[10px] tabular-nums",
                  active
                    ? "bg-[--surface-muted] text-[--text-muted]"
                    : "bg-[--surface-base] text-[--text-subtle]",
                )}
              >
                {opt.count > 99 ? "99+" : opt.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Switch and SwitchRow — G1: on is solid ink with an `--on-sel` knob, never a
 * state colour. `role="switch"` with `aria-checked`.
 *
 * A bare Switch needs an `aria-label` (or a label pointing at it). SwitchRow is
 * the whole row as one switch: the label (500) and its hint (12.5, `--ink-3`),
 * with an ink border when on. Settings and the sheet's `toggle` field use it.
 */
type SwitchBaseProps = Omit<React.ComponentProps<"button">, "onChange" | "value"> & {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export function Switch({ checked, onCheckedChange, className, onClick, ...props }: SwitchBaseProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cn("cx-switch", className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onCheckedChange?.(!checked);
      }}
      {...props}
    />
  );
}

export type SwitchRowProps = SwitchBaseProps & {
  label: React.ReactNode;
  hint?: React.ReactNode;
};

export function SwitchRow({
  checked,
  onCheckedChange,
  label,
  hint,
  className,
  onClick,
  ...props
}: SwitchRowProps) {
  const labelId = React.useId();
  const hintId = React.useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={hint ? hintId : undefined}
      className={cn("cx-switch-row", className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onCheckedChange?.(!checked);
      }}
      {...props}
    >
      <span className="cx-switch" aria-hidden="true" />
      <span className="cx-switch-row__text">
        <span id={labelId} className="cx-switch-row__label">
          {label}
        </span>
        {hint ? (
          <span id={hintId} className="cx-switch-row__hint">
            {hint}
          </span>
        ) : null}
      </span>
    </button>
  );
}

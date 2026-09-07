"use client";

import * as React from "react";
import { SegmentedControl as DsSegmentedControl } from "@corelithzw/react";

import { cn } from "../lib/utils";

/**
 * SegmentedControl — the design system's, behind this repo's prop names.
 *
 * The DS gained `size`, `fullWidth`, `variant` and per-option `count` during
 * this migration, so the local API now maps across one-to-one. Two differences
 * remain and are absorbed here:
 *
 *   - `ariaLabel` (camelCase) is the local spelling; the DS takes `aria-label`.
 *   - `fullWidth` defaults to `false` here but `true` in the DS, because the DS
 *     `.segmented` track has always stretched. The local default is preserved.
 *
 * The generic `<V extends string>` is kept — call sites rely on
 * `onValueChange` being typed to their own union rather than to `string`.
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
  return (
    <DsSegmentedControl<V>
      value={value}
      onValueChange={onValueChange}
      options={options}
      size={size}
      variant={variant === "border" ? "bordered" : "default"}
      fullWidth={fullWidth}
      aria-label={ariaLabel}
      className={cn(className)}
    />
  );
}

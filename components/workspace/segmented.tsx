"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Segmented — G1 `cx-seg`: a `--tray` track with the chosen item in solid ink.
 *
 * One item is pressed, or none when `value` is null (a period toolbar while a
 * range of days is chosen instead). `block` fills the width (sheets, settings)
 * and takes the 14px field type; the inline form is for periods and chart ranges.
 */
export type SegmentedItem<V extends string = string> = {
  value: V;
  label: React.ReactNode;
  disabled?: boolean;
};

export type SegmentedProps<V extends string = string> = Omit<
  React.ComponentProps<"div">,
  "onChange" | "defaultValue"
> & {
  items: ReadonlyArray<SegmentedItem<V>>;
  value: V | null;
  onValueChange?: (value: V) => void;
  block?: boolean;
  disabled?: boolean;
  /** Says what the choice is ("Range", "Pays"). */
  "aria-label"?: string;
};

export function Segmented<V extends string = string>({
  items,
  value,
  onValueChange,
  block = false,
  disabled = false,
  className,
  ...props
}: SegmentedProps<V>) {
  return (
    <div
      role="group"
      className={cn("cx-seg", block && "cx-seg--block cx-seg--field", className)}
      {...props}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className="cx-seg__item"
          aria-pressed={item.value === value}
          disabled={disabled || item.disabled}
          onClick={() => {
            if (item.value !== value) onValueChange?.(item.value);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

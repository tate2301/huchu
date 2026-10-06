import * as React from "react";

import { ChevronDown, X } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * FilterChip — a toolbar filter that shows its label and its answer:
 * "Till Any". Away from its default it is set (G1 `is-set`): `--sel-bg`,
 * `--sel-line` border, the value in `--sel-ink`. It is usually a menu trigger,
 * so it passes its props and ref through (`<MenuTrigger asChild>`).
 *
 * Without a label it shows the value alone ("1 to 3 October"). With `onClear`
 * a separate × button sits beside it in a `cx-filter-wrap`, never inside it;
 * props and ref still go to the chip.
 */
export type FilterChipProps = React.ComponentProps<"button"> & {
  label?: string;
  /** The answer shown: "Any", "Back till". */
  value: string;
  /** True when the filter is not at its default. */
  isSet?: boolean;
  /** Draws a × beside the chip that puts the filter back. */
  onClear?: () => void;
  /** The × button's name. */
  clearLabel?: string;
};

export function FilterChip({
  label,
  value,
  isSet = false,
  onClear,
  clearLabel = "Clear the dates",
  className,
  ...props
}: FilterChipProps) {
  const chip = (
    <button
      type="button"
      aria-label={label ? `${label}: ${value}` : value}
      className={cn("cx-filter", isSet && "is-set", onClear && "cx-filter--clearable", className)}
      {...props}
    >
      {label ? <span className="cx-filter__label">{label}</span> : null}
      <span className="cx-filter__value">{value}</span>
      {onClear ? null : (
        <span className="cx-filter__chev" aria-hidden="true">
          <ChevronDown />
        </span>
      )}
    </button>
  );
  if (!onClear) return chip;
  return (
    <span className={cn("cx-filter-wrap", isSet && "is-set")}>
      {chip}
      <button type="button" className="cx-filter__clear" aria-label={clearLabel} onClick={onClear}>
        <X aria-hidden="true" />
      </button>
    </span>
  );
}

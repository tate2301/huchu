import * as React from "react";

import { ChevronDown } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * FilterChip — a toolbar filter that shows its label and its answer:
 * "Till Any". Away from its default it is set (G1 `is-set`): `--sel-bg`,
 * `--sel-line` border, the value in `--sel-ink`. It is usually a menu trigger,
 * so it passes its props and ref through (`<MenuTrigger asChild>`).
 */
export type FilterChipProps = React.ComponentProps<"button"> & {
  label: string;
  /** The answer shown: "Any", "Back till". */
  value: string;
  /** True when the filter is not at its default. */
  isSet?: boolean;
};

export function FilterChip({ label, value, isSet = false, className, ...props }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-label={`${label}: ${value}`}
      className={cn("cx-filter", isSet && "is-set", className)}
      {...props}
    >
      <span className="cx-filter__label">{label}</span>
      <span className="cx-filter__value">{value}</span>
      <span className="cx-filter__chev" aria-hidden="true">
        <ChevronDown />
      </span>
    </button>
  );
}

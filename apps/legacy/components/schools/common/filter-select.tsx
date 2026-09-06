"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type FilterOption = {
  value: string;
  label: string;
};

/**
 * One labelled filter, as a dropdown.
 *
 * These were chip rows. Chips read well for two or three mutually exclusive
 * states, but a school list carries several filters at once — status, boarding,
 * stream, portal account — and a screen of chip rows is a wall of controls that
 * never tells you what any row is *for*. A labelled dropdown says what it
 * filters when it is closed, takes one line whatever the option count, and puts
 * every long option list behind the same interaction.
 *
 * `value` is the empty string for "no filter", so a caller passes its state
 * straight through without an "all" sentinel of its own; the sentinel is
 * internal because a `Select` cannot hold an empty-string item value.
 */
export function FilterSelect({
  label,
  value,
  options,
  allLabel = "All",
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  /** What the unfiltered choice is called — "All classes", "Anyone". */
  allLabel?: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const id = `filter-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    // `basis-[180px]` rather than a bare `flex-1`: three filters on one row
    // shrink each other until the chosen option is clipped mid-word — "Every
    // subje" — and a filter that cannot say what it is set to is worse than one
    // that wrapped onto a second line.
    <div className={className ?? "min-w-0 flex-1 basis-[180px] sm:max-w-[220px]"}>
      <Label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </Label>
      <Select
        value={value || "__all__"}
        onValueChange={(next) => onChange(next === "__all__" ? "" : next)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * The row filters sit in. Wraps rather than scrolling sideways, because a
 * filter you have to swipe to find is one you do not know is set.
 */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3">{children}</div>;
}

"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type FilterOption = {
  value: string;
  label: string;
};

/**
 * One filter, as a chip that says what it is filtered *to*.
 *
 * These were chip rows first. Chips read well for two or three mutually
 * exclusive states, but a school list carries several filters at once —
 * status, boarding, stream, portal account — and a screen of chip rows is a
 * wall of controls that never tells you what any row is *for*. So they became
 * dropdowns, which was right.
 *
 * What was still wrong was where the label sat. Above the trigger, a filter
 * costs two lines: a row of five filters is ten lines of text, and on a phone
 * it is most of the screen before the records start. And the two halves of one
 * fact were stacked rather than read together.
 *
 * The label and the current value now sit on one line inside the trigger, the
 * way the CRM toolbar draws a filter: "Status" alone has to be opened to be
 * read, "Status Active" is read at a glance — which is the difference between
 * a row of controls you interrogate and one you scan. The label is muted, the
 * value carries the page's strongest ink, and the caret says it opens.
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
  const current = options.find((option) => option.value === value)?.label ?? allLabel;

  return (
    // Sized to what it says rather than to a share of the row. The old
    // `basis-[180px]` was there because three stretched filters shrank each
    // other until the chosen option clipped mid-word — "Every subje" — and a
    // filter that cannot say what it is set to is worse than one that wrapped.
    // A chip that is as wide as its own text has neither problem; the cap is
    // what stops one long option pushing the rest off the row.
    <div className={cn("min-w-0 max-w-[260px] shrink-0", className)}>
      <Select
        value={value || "__all__"}
        onValueChange={(next) => onChange(next === "__all__" ? "" : next)}
      >
        <SelectTrigger
          size="sm"
          // The accessible name carries both halves, because the painted label
          // is decorative here — it is inside the control rather than beside
          // it, and a screen reader that reads the trigger alone would
          // otherwise hear "Form 2" with nothing saying which question it
          // answers.
          aria-label={`${label}: ${current}`}
          className="w-full justify-start gap-1.5"
        >
          <span aria-hidden="true" className="shrink-0 text-[var(--text-muted)]">
            {label}
          </span>
          <SelectValue
            placeholder={allLabel}
            className="min-w-0 truncate font-semibold text-[var(--text-strong)]"
          />
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
 * How many of a screen's filters are actually narrowing anything.
 *
 * Wanted in two places at once — the phone trigger that hides them, and the
 * sentence an empty list gives for why it is empty — so it is counted once
 * here rather than being re-derived on each screen with a slightly different
 * idea of what counts as set.
 */
export function activeFilterCount(...values: (string | null | undefined)[]): number {
  return values.filter((value) => Boolean(value && value.trim())).length;
}

/**
 * The row filters sit in. Wraps rather than scrolling sideways, because a
 * filter you have to swipe to find is one you do not know is set.
 */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

"use client";

import { Input } from "@corelithzw/react";

import { useIsBelow } from "@/hooks/use-mobile";
import { Search } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * The search box every CRM list and board sits under.
 *
 * Two things it fixes over the bare `Input` each page used to build for
 * itself. The placeholder was written for a desktop toolbar — "Search deals by
 * title, number or customer" — and on a phone it renders as "Search deals by
 * title, number or c…", which reads as a broken control rather than a hint.
 * So the long form is the accessible name, always, and the placeholder shortens
 * to the noun below `sm` where the width is the constraint.
 *
 * And the magnifier. A bare rounded rectangle beside a "View" button is two
 * unlabelled boxes; the icon is what says which one is search, at the size a
 * phone reads it.
 */
export function ListSearch({
  value,
  onChange,
  placeholder,
  /**
   * What this list is a list of — "deals", "people". The phone placeholder,
   * because "Search deals" is the whole hint at 390px. Left off, the phone
   * shows "Search".
   */
  noun,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The full hint, used on wider screens and as the accessible name. */
  placeholder: string;
  noun?: string;
  className?: string;
}) {
  const compact = useIsBelow(640);

  return (
    <div className={cn("relative flex min-w-0 items-center", className)}>
      <Search
        className="pointer-events-none absolute left-2.5 size-4 text-[var(--text-subtle)]"
        aria-hidden="true"
      />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={compact ? (noun ? `Search ${noun}` : "Search") : placeholder}
        aria-label={placeholder}
        className="w-full pl-8 sm:w-64"
      />
    </div>
  );
}

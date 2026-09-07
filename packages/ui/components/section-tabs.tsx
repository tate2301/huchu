"use client";

import * as React from "react";
import Link from "next/link";
import {
  SectionTab as DsSectionTab,
  SectionTabs as DsSectionTabs,
} from "@corelithzw/react";

import { cn } from "../lib/utils";

/**
 * In-page horizontal tab strip — the row that sits above a section's content,
 * usually next to a {@link NavRail}. Now the design system's `SectionTabs`.
 *
 * The DS owns the markup and the styling: the `<nav>` landmark, the
 * `.section-tabs` / `.section-tab` / `.section-tab-count` classes, the
 * `aria-current="page"` marking, and the deliberately *neutral* active
 * indicator (`--text-strong`, not brand — brand is reserved for primary
 * actions). Modules used to inline their own `border-b-2 …` variant of this,
 * which is why every one of them drifted.
 *
 * Two things stay local:
 *
 *   - **The `next/link` binding.** The DS is framework-free, so the routed
 *     branch renders a `<Link>` inside `SectionTab asChild`.
 *   - **The discriminated `SectionTabProps` union.** Six shell files depend on
 *     `{ to }` and `{ onClick, disabled }` being mutually exclusive, so the
 *     union is preserved verbatim rather than flattened onto the DS's single
 *     button-shaped prop type.
 *
 * Two small behaviour changes come with the DS and are intentional:
 *
 *   - Counts above 99 now render as "99+" rather than the raw number.
 *   - The button branch marks itself `aria-current="page"` instead of
 *     `aria-current="true"`; "page" is the correct token for a tab strip that
 *     switches sections.
 */

type SectionTabsProps = React.ComponentPropsWithoutRef<"nav"> & {
  /** Accessible name, e.g. "Accounting section navigation". */
  label: string;
};

export function SectionTabs({
  label,
  className,
  children,
  ...props
}: SectionTabsProps) {
  return (
    <DsSectionTabs label={label} className={cn(className)} {...props}>
      {children}
    </DsSectionTabs>
  );
}

type SectionTabBaseProps = {
  active?: boolean;
  icon?: React.ReactNode;
  count?: number;
  className?: string;
  children: React.ReactNode;
};

type SectionTabProps = SectionTabBaseProps &
  (
    | { to: string; onClick?: never; disabled?: never }
    | { to?: never; onClick: () => void; disabled?: boolean }
  );

export function SectionTab({
  to,
  active,
  icon,
  count,
  className,
  onClick,
  disabled,
  children,
}: SectionTabProps) {
  if (to) {
    return (
      <DsSectionTab
        asChild
        active={active}
        icon={icon}
        count={count}
        className={cn(className)}
      >
        <Link href={to}>{children}</Link>
      </DsSectionTab>
    );
  }

  return (
    <DsSectionTab
      active={active}
      icon={icon}
      count={count}
      className={cn(className)}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </DsSectionTab>
  );
}

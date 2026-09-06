"use client";

import * as React from "react";
import Link from "next/link";
import {
  NavRailItem as DsNavRailItem,
} from "@corelithzw/react";

/**
 * Vertical secondary navigation — the one rail every module shares.
 *
 * `NavRail` and `NavRailGroup` are the design system's, re-exported unchanged:
 * same `.nav-rail` / `.group-label` markup, same `data-orientation` (including
 * the `responsive` value `vertical-data-views.tsx` passes), same accessible
 * `label` prop.
 *
 * `NavRailItem` stays local for exactly one reason: the DS is framework-free,
 * so it cannot know about `next/link`. This repo's item is a discriminated
 * union — `{ to }` navigates, `{ onClick, disabled }` switches a client-side
 * view — and the link half is bound here using the DS's `asChild`, which merges
 * `.rail-item`, `aria-current` and the icon/count/trailing slots onto the
 * `<Link>` itself. The button half is a straight pass-through.
 *
 * New code should import `NavRail` / `NavRailItem` from `@corelithzw/react` and
 * supply its own anchor via `asChild`.
 */
export { NavRail, NavRailGroup } from "@corelithzw/react";
export type { NavRailProps, NavRailGroupProps } from "@corelithzw/react";

type NavRailItemBaseProps = {
  active?: boolean;
  icon?: React.ReactNode;
  /** Right-aligned count. Rendered muted and tabular, never as a badge. */
  count?: number;
  /**
   * Right-aligned slot for the rare item that needs more than a count — a
   * severity badge, say. Prefer `count`; a rail of badges is a rail of noise.
   */
  trailing?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

type NavRailItemProps = NavRailItemBaseProps &
  (
    | { to: string; onClick?: never; disabled?: never }
    | { to?: never; onClick: () => void; disabled?: boolean }
  );

export function NavRailItem(props: NavRailItemProps) {
  const { to, active, icon, count, trailing, className, children } = props;
  const shared = { active, icon, count, trailing, className };

  if (to) {
    // `asChild` hands the rail-item styling to the link element, so the anchor
    // is the real navigation target rather than a div wrapping one.
    return (
      <DsNavRailItem {...shared} asChild>
        <Link href={to}>{children}</Link>
      </DsNavRailItem>
    );
  }

  return (
    <DsNavRailItem {...shared} onClick={props.onClick} disabled={props.disabled}>
      {children}
    </DsNavRailItem>
  );
}

"use client";

import * as React from "react";

import { NavRailGroup, NavRailItem } from "./nav-rail";

/**
 * Settings-rail navigation.
 *
 * This is now a thin alias over `components/ui/nav-rail.tsx`, which owns the
 * markup contract (`.rail-item`, `.group-label`) that `.settings-rail` and
 * `.nav-rail` share. Settings and Preferences keep calling `NavGroup`/`NavItem`
 * because that is the design system's nav API naming; every other module uses
 * `NavRail`/`NavRailItem` directly.
 *
 * `@corelithzw/react` still exports no React component for this surface (there
 * is no `NavGroup`/`NavItem` in `dist/index.d.ts`), only the CSS — drop this
 * file in favour of the real exports if a future release ships them.
 */

type NavGroupProps = {
  label: string;
  children: React.ReactNode;
};

export function NavGroup({ label, children }: NavGroupProps) {
  return <NavRailGroup label={label}>{children}</NavRailGroup>;
}

type NavItemProps = {
  /** Destination href. Named `to` to match the design system's nav API. */
  to: string;
  active?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
};

export function NavItem({ to, active, icon, children }: NavItemProps) {
  return (
    <NavRailItem to={to} active={active} icon={icon}>
      {children}
    </NavRailItem>
  );
}

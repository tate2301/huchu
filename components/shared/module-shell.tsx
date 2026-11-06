"use client";

import * as React from "react";
import { PageActions, PageChrome, type PagePrimary } from "@/components/layout/page-chrome";
import type { LucideIcon } from "@/lib/icons";

/**
 * ModuleShell provides standard PageChrome composition and full-width
 * layout for module content without a secondary vertical rail.
 * Top-level destinations live in the primary sidebar; internal navigation
 * uses horizontal tabs with icons.
 */

export type ShellCategory<C extends string> = {
  id: C;
  label: string;
  icon: LucideIcon;
  order: number;
};

export type ShellTab<T extends string, C extends string> = {
  id: T;
  label: string;
  href: string;
  icon: LucideIcon;
  categoryId: C;
};

export type ModuleShellProps<T extends string, C extends string> = {
  /** The `lib/navigation.ts` section this module's tabs come from (optional legacy prop). */
  navSectionId?: string;
  categories?: ShellCategory<C>[];
  tabs?: ShellTab<T, C>[];
  activeTab?: T;
  /** Screen-reader label, e.g. "People" (optional legacy prop). */
  railLabel?: string;
  actions?: React.ReactNode;
  primary?: PagePrimary;
  children: React.ReactNode;
  /**
   * The page's own name, for the app bar. Left off, the bar keeps the name
   * the route table gives this screen.
   */
  title?: string;
};

export function ModuleShell<T extends string, C extends string>({
  actions,
  primary,
  children,
  title,
}: ModuleShellProps<T, C>) {
  return (
    <div className="w-full">
      {title ? (
        <PageChrome title={title} primary={primary}>
          {actions}
        </PageChrome>
      ) : primary ? (
        <PageChrome title="" primary={primary}>
          {actions}
        </PageChrome>
      ) : actions ? (
        <PageActions>{actions}</PageActions>
      ) : null}

      <div className="band-stack-content min-w-0 flex-1 space-y-5 pb-8">
        {children}
      </div>
    </div>
  );
}

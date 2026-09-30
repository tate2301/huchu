"use client";

import type { ReactNode } from "react";

import { PageChrome } from "@/components/layout/page-chrome";

type RetailShellProps = {
  /** The page's name, for the app bar. */
  title: string;
  /** The page's one verb. Navigation is the sidebar's job, not the bar's. */
  actions?: ReactNode;
  children: ReactNode;
};

/**
 * The retail page frame, drawn to the management contract.
 *
 * The page names itself once, in the app bar, with its verb beside it. There
 * is no heading block or lede under the bar, and no tab rail: the sidebar
 * already lists a page's siblings, and a rail under the bar listed them a
 * second time under different names — Products, Prices, Promotions in the
 * sidebar; Catalog, Pricing, Promotions in the rail.
 */
export function RetailShell({ title, actions, children }: RetailShellProps) {
  return (
    <div className="w-full space-y-4">
      <PageChrome title={title}>{actions}</PageChrome>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

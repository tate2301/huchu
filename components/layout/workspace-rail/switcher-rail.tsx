"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "@/lib/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import styles from "./workspace-rail.module.css";

export type RailMark = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** The module's first visible item. */
  href: string;
  current: boolean;
};

/**
 * The 56px rail (00-foundations 5.3.2): the logo tile, one mark per module the
 * role can see, then Management at the foot. Nothing else: no avatar, no pins.
 *
 * Every mark is unlabelled, so each carries an accessible name and a tooltip.
 * The current module's mark, pressed while its panel is hidden, opens the
 * panel again instead of reloading the page.
 */
export function SwitcherRail({
  tile,
  marks,
  management,
  panelShown,
  onOpenPanel,
}: {
  /** The logo tile: the account menu's trigger. */
  tile: React.ReactNode;
  marks: RailMark[];
  management: RailMark | null;
  panelShown: boolean;
  onOpenPanel: () => void;
}) {
  const markFor = (mark: RailMark) => (
    <Tooltip key={mark.id}>
      <TooltipTrigger asChild>
        <Link
          href={mark.href}
          aria-label={mark.label}
          aria-current={mark.current ? "page" : undefined}
          className={cn(styles.mark, mark.current && styles.markCurrent)}
          onClick={(event) => {
            if (mark.current && !panelShown) {
              event.preventDefault();
              onOpenPanel();
            }
          }}
        >
          <mark.icon className={styles.markIcon} />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{mark.label}</TooltipContent>
    </Tooltip>
  );

  return (
    <nav aria-label="Modules" className={styles.rail}>
      {tile}
      {marks.map(markFor)}
      <div className={styles.spacer} />
      {management ? markFor(management) : null}
    </nav>
  );
}

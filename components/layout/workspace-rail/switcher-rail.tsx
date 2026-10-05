"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { SidebarSimple, type LucideIcon } from "@/lib/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import styles from "./workspace-rail.module.css";

export type RailMark = {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  current: boolean;
  /** Pressed: what it does besides following its link. */
  onSelect?: () => void;
};

/**
 * The 56px rail (00-foundations 5.3.2): the logo tile, then the module marks
 * (when the panel shows one module at a time), then the pinned items, and at
 * the foot the Management gear and the person.
 *
 * Every mark is unlabelled, so each carries an accessible name and a tooltip.
 * The current module's mark, pressed while the panel is hidden, opens the
 * panel again instead of reloading the page.
 */
export function SwitcherRail({
  tile,
  groups,
  management,
  person,
  panelShown,
  onOpenPanel,
}: {
  /** The logo tile: the account menu's trigger. */
  tile: React.ReactNode;
  /** The module marks, then the pins; an empty group draws nothing. */
  groups: RailMark[][];
  /** The gear: the Management surface. */
  management: RailMark | null;
  /** The person, with their own menu. */
  person?: React.ReactNode;
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
            mark.onSelect?.();
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
      {panelShown ? null : (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Open the panel"
              aria-keyshortcuts="Meta+B Control+B"
              className={styles.mark}
              onClick={onOpenPanel}
            >
              <SidebarSimple className={styles.markIcon} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Open the panel</TooltipContent>
        </Tooltip>
      )}
      {groups
        .filter((group) => group.length > 0)
        .map((group, index) => (
          <React.Fragment key={group.map((mark) => mark.id).join("|")}>
            {index > 0 ? <span aria-hidden="true" className={styles.divider} /> : null}
            {group.map(markFor)}
          </React.Fragment>
        ))}
      <div className={styles.spacer} />
      {management ? markFor(management) : null}
      {person ?? null}
    </nav>
  );
}

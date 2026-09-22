"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "@/lib/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import styles from "./workspace-rail.module.css";

export type RailMark = {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  active?: boolean;
  alert?: boolean;
};

/**
 * Tier one: the column the rail is navigated by.
 *
 * Every mark here is unlabelled, so every one of them carries an accessible
 * name and a tooltip. An icon with neither is a memory test.
 */
export function SwitcherRail({
  companyInitials,
  companyLabel,
  onCompanyClick,
  groups,
  person,
}: {
  companyInitials: string;
  companyLabel: string;
  onCompanyClick?: () => void;
  groups: RailMark[][];
  person: React.ReactNode;
}) {
  return (
    <div className={styles.switcher}>
      <div className={styles.company}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`${companyLabel} — switch workspace`}
              className={styles.companyMark}
              onClick={onCompanyClick}
            >
              {companyInitials}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{companyLabel}</TooltipContent>
        </Tooltip>
      </div>

      <nav className={styles.marks} aria-label="Areas">
        {groups
          .filter((group) => group.length > 0)
          .map((group, index) => (
            <React.Fragment key={group.map((m) => m.id).join("|")}>
              {index > 0 ? <span className={styles.divider} /> : null}
              <ul className={styles.markList}>
                {group.map((mark) => (
                  <li key={mark.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href={mark.href}
                          aria-label={mark.label}
                          aria-current={mark.active ? "true" : undefined}
                          className={cn(
                            styles.slot,
                            styles.slotWrap,
                            mark.active && styles.slotActive,
                          )}
                        >
                          <mark.icon width={17} height={17} />
                          {mark.alert ? (
                            <span className={styles.markAlert} />
                          ) : null}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">{mark.label}</TooltipContent>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            </React.Fragment>
          ))}
      </nav>

      <div className={styles.person}>{person}</div>
    </div>
  );
}

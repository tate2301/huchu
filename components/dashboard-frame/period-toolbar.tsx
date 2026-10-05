"use client";

import * as React from "react";

import { FilterChip } from "@/components/workspace/filter-chip";
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/components/workspace/menu";
import { Segmented, type SegmentedItem } from "@/components/workspace/segmented";
import { cn } from "@/lib/utils";

const ZONE = "Africa/Harare";
const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ZONE });
const LONG_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ZONE,
});

/** "14:42" in the shop's time. */
export function shopTime(at: string | Date) {
  return CLOCK.format(new Date(at));
}

/** "Saturday 3 October 2026" in the shop's time. */
export function shopLongDay(at: string | Date) {
  return LONG_DAY.format(new Date(at)).replace(",", "");
}

export type SiteChoice = {
  /** "all" or a site's id. */
  value: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
};

/**
 * The dashboard toolbar (48px): the period as a `Segmented`, the site as a
 * `FilterChip` menu, what the figures are compared with, then on the right
 * either the live line (Overview: a green dot, the day and the time) or when
 * the figures were worked out (Insights: "Updated 14:42").
 */
export function PeriodToolbar<P extends string>({
  periods,
  period,
  onPeriodChange,
  site,
  compare,
  live,
  updatedAt,
  ground = false,
}: {
  periods: ReadonlyArray<SegmentedItem<P>>;
  period: P;
  onPeriodChange: (value: P) => void;
  site?: SiteChoice | null;
  /** "Compared with the 30 days before". */
  compare?: string | null;
  /** Overview: the moment the tiles show, as a live line. */
  live?: string | Date | null;
  /** Insights: when the figures were worked out. */
  updatedAt?: string | Date | null;
  /** The insight variant's toolbar sits on `--ground`. */
  ground?: boolean;
}) {
  const updated = updatedAt ? `Updated ${shopTime(updatedAt)}` : null;
  return (
    <>
      <div role="toolbar" aria-label="Period" className={cn("cx-df-toolbar", ground && "cx-df-toolbar--ground")}>
        <Segmented aria-label="Period" items={periods} value={period} onValueChange={onPeriodChange} />
        {site ? (
          <Menu>
            <MenuTrigger asChild>
              <FilterChip label="Site" value={site.label} isSet={site.value !== "all"} />
            </MenuTrigger>
            <MenuContent>
              <MenuRadioGroup value={site.value} onValueChange={site.onChange}>
                {site.options.map((option) => (
                  <MenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuContent>
          </Menu>
        ) : null}
        {compare ? <span className="cx-df-toolbar__quiet cx-df-toolbar__wide">{compare}</span> : null}
        <span className="cx-df-toolbar__spacer" />
        {live ? (
          <span className="cx-df-live cx-df-toolbar__wide">
            <span className="cx-df-live__dot" aria-hidden="true" />
            Live · {shopLongDay(live)} · <span className="cx-df-mono">{shopTime(live)}</span>
          </span>
        ) : null}
        {updated ? <span className="cx-df-toolbar__quiet cx-df-toolbar__wide">{updated}</span> : null}
      </div>
      {compare || updated ? (
        <div className="cx-df-toolbar__under">{[compare, updated].filter(Boolean).join(" · ")}</div>
      ) : null}
    </>
  );
}

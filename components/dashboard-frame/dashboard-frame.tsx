import * as React from "react";

import { cn } from "@/lib/utils";

import "./dashboard-frame.css";

/**
 * DashboardFrame (00-foundations 5.11) — the page for Overview and Insights.
 *
 * The toolbar band sits under the shell's header. `overview` lays its tiles
 * on a 12-column grid on `--ground` (Floor board); `insight` puts the main
 * column beside a 320px aside (InsightsSales board), and drops the aside
 * under the main column below 1100px. Either opens with the headline, when
 * the page has one: two sentences above the tiles and charts.
 */
export function DashboardFrame({
  variant,
  toolbar,
  headline,
  aside,
  label,
  children,
}: {
  variant: "overview" | "insight";
  toolbar: React.ReactNode;
  /** What the figures add up to, worked out on the server with them. */
  headline?: DashHeadlineWords | null;
  /** The insight variant's aside (`InsightAside`). */
  aside?: React.ReactNode;
  /** Names the main region for assistive tech ("Sales"). */
  label?: string;
  children: React.ReactNode;
}) {
  if (variant === "overview") {
    return (
      <div className="cx-df">
        {toolbar}
        <div className="cx-df-body">
          <div className="cx-df-grid" aria-label={label} role={label ? "region" : undefined}>
            {headline ? <DashHeadline {...headline} /> : null}
            {children}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="cx-df cx-df--insight">
      {toolbar}
      <div className={cn("cx-df-insight", !aside && "cx-df-insight--bare")}>
        <div className="cx-df-main" aria-label={label} role={label ? "region" : undefined}>
          {headline ? <DashHeadline {...headline} /> : null}
          {children}
        </div>
        {aside ? <aside className="cx-df-aside">{aside}</aside> : null}
      </div>
    </div>
  );
}

export type DashHeadlineWords = { fact: string; notice: string };

/**
 * The headline: the fact in ink, then what to notice in muted ink, both in
 * the large type ("US$11,732 taken in the last 30 days across two shops." /
 * "Fri 17:00 is the busiest hour; takings are 17% down on the 30 days
 * before."). With little trade it still reads as a sentence about the data.
 */
export function DashHeadline({ fact, notice }: DashHeadlineWords) {
  return (
    <div className="cx-df-headline">
      <p className="cx-df-headline__fact">{fact}</p>
      <p className="cx-df-headline__notice">{notice}</p>
    </div>
  );
}

/** A grey block standing in for a figure, a chart or a row while it loads. */
export function DashSkeleton({ height, width = "100%" }: { height: number; width?: number | string }) {
  return <span aria-hidden="true" className="cx-df-skel" style={{ height, width }} />;
}

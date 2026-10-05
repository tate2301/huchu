import * as React from "react";

import { cn } from "@/lib/utils";

import "./dashboard-frame.css";

/**
 * DashboardFrame (00-foundations 5.11) — the page for Overview and Insights.
 *
 * The toolbar band sits under the shell's header. `overview` lays its tiles
 * on a 12-column grid on `--ground` (Floor board); `insight` puts the main
 * column beside a 320px aside (InsightsSales board), and drops the aside
 * under the main column below 1100px.
 */
export function DashboardFrame({
  variant,
  toolbar,
  aside,
  label,
  children,
}: {
  variant: "overview" | "insight";
  toolbar: React.ReactNode;
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
          {children}
        </div>
        {aside ? <aside className="cx-df-aside">{aside}</aside> : null}
      </div>
    </div>
  );
}

/** A grey block standing in for a figure, a chart or a row while it loads. */
export function DashSkeleton({ height, width = "100%" }: { height: number; width?: number | string }) {
  return <span aria-hidden="true" className="cx-df-skel" style={{ height, width }} />;
}

"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

type LegendItem = {
  label: string;
  color: string;
};

type SourceTag = {
  icon?: ReactNode;
  label: string;
};

export function ReportChartShell({
  title,
  sourceTag,
  legend,
  children,
  className,
}: {
  title: string;
  sourceTag?: SourceTag;
  legend?: LegendItem[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5",
        className,
      )}
    >
      {/* Header: title + source tag */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-[var(--text-strong)]">{title}</h3>
        {sourceTag ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)]">
            {sourceTag.icon}
            {sourceTag.label}
          </span>
        ) : null}
      </div>

      {/* Legend */}
      {legend && legend.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {legend.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}

      {/* Chart area */}
      <div className={legend && legend.length > 0 ? "mt-4" : "mt-3"}>{children}</div>
    </div>
  );
}

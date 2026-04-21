"use client";

import { type ReactNode } from "react";

export function ReportBigNumber({
  label,
  value,
  dotColor = "var(--action-primary-bg)",
  breadcrumb,
  className,
}: {
  label: string;
  value: string;
  dotColor?: string;
  breadcrumb?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-8 text-center ${className ?? ""}`}>
      <span className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        {label}
      </span>
      <p className="mt-3 text-4xl font-bold tracking-tight text-[var(--text-strong)]">
        {value}
      </p>
      {breadcrumb ? (
        <p className="mt-2 text-sm text-[var(--text-muted)]">{breadcrumb}</p>
      ) : null}
    </div>
  );
}

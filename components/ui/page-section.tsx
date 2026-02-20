import * as React from "react";

import { cn } from "@/lib/utils";

type PageSectionProps = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  headerClassName?: string;
  children: React.ReactNode;
};

export function PageSection({
  title,
  description,
  actions,
  className,
  headerClassName,
  children,
}: PageSectionProps) {
  const hasHeader = Boolean(title || actions);
  void description;

  return (
    <section className={cn("space-y-3", className)}>
      {hasHeader ? (
        <header
          className={cn(
            "section-shell flex flex-wrap items-start justify-between gap-3",
            headerClassName,
          )}
          >
          <div className="space-y-1">
            {title ? (
              <h2 className="text-section-title text-foreground font-bold tracking-tight">{title}</h2>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

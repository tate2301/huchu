import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type WorkflowStepProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  collapsed?: boolean;
  className?: string;
  children?: React.ReactNode;
};

export function WorkflowStep({
  title,
  description,
  actions,
  badge,
  collapsed = false,
  className,
  children,
}: WorkflowStepProps) {
  void description;

  return (
    <section className={cn("space-y-3", className)}>
      <header className="section-shell flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-section-title text-foreground font-bold tracking-tight">{title}</h2>
            {badge ? (
              typeof badge === "string" || typeof badge === "number" ? (
                <Badge variant="outline">{badge}</Badge>
              ) : (
                badge
              )
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {collapsed ? null : children}
    </section>
  );
}


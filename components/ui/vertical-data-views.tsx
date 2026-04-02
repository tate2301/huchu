import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type VerticalDataViewItem = {
  id: string;
  label: string;
  description?: string;
  count?: number;
};

type VerticalDataViewsProps = {
  items: VerticalDataViewItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  railLabel?: React.ReactNode;
  children: React.ReactNode;
};

export function VerticalDataViews({
  items,
  value,
  onValueChange,
  className,
  railLabel = "Views",
  children,
}: VerticalDataViewsProps) {
  return (
    <section
      className={cn("grid gap-4 lg:grid-cols-[190px_minmax(0,1fr)]", className)}
    >
      <aside className="space-y-1.5">
        <h3 className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {railLabel}
        </h3>
        <div className="space-y-0.5">
          {items.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant="ghost"
              className={cn(
                "h-9 w-full justify-between rounded-lg px-2.5 text-[13px] shadow-none",
                item.id === value
                  ? "bg-[var(--surface-base)] text-[var(--text-strong)] hover:bg-[var(--surface-base)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)]",
              )}
              onClick={() => onValueChange(item.id)}
            >
              <span className="truncate text-left">{item.label}</span>
              {typeof item.count === "number" ? (
                <Badge variant={item.id === value ? "secondary" : "outline"} className="rounded-full px-2 py-0 font-mono text-[10px]">
                  {item.count}
                </Badge>
              ) : null}
            </Button>
          ))}
        </div>
      </aside>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

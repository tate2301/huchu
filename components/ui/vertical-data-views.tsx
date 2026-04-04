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
      <aside className="space-y-2">
        <h3 className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
          {railLabel}
        </h3>
        <div className="rounded-[14px] border border-[var(--edge-subtle)] bg-[var(--surface-soft)] p-1.5">
          {items.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant="ghost"
              className={cn(
                "h-10 w-full justify-between rounded-[12px] px-3 text-[13px] shadow-none",
                item.id === value
                  ? "bg-[var(--surface-base)] text-[var(--text-strong)] shadow-[var(--button-shadow-rest)] hover:bg-[var(--surface-base)]"
                  : "text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.6)] hover:text-[var(--text-strong)]",
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

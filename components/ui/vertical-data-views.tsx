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
      className={cn("grid gap-5 lg:grid-cols-[190px_minmax(0,1fr)]", className)}
    >
      <aside className="space-y-3">
        <h3 className="px-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
          {railLabel}
        </h3>
        <div className="-mx-1 overflow-x-auto pb-1 lg:mx-0 lg:overflow-visible lg:pb-0">
          <div className="flex gap-2 px-1 lg:grid lg:gap-1 lg:px-0">
          {items.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant="ghost"
              className={cn(
                "h-10 min-w-fit justify-between rounded-full border border-transparent px-3 text-[13px] shadow-none lg:w-full lg:rounded-xl",
                item.id === value
                  ? "border-[var(--edge-subtle)] bg-[var(--surface-subtle)] text-[var(--text-strong)] hover:bg-[var(--surface-subtle)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-strong)]",
              )}
              onClick={() => onValueChange(item.id)}
            >
              <span className="truncate text-left">{item.label}</span>
              {typeof item.count === "number" ? (
                <Badge
                  variant={item.id === value ? "secondary" : "outline"}
                  className="rounded-full px-2 py-0 font-mono text-[10px]"
                >
                  {item.count}
                </Badge>
              ) : null}
            </Button>
          ))}
          </div>
        </div>
      </aside>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

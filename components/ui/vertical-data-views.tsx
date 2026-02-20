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
      className={cn("grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]", className)}
    >
      <aside className="section-shell space-y-2">
        <h3 className="text-xs font-semibold tracking-[0.08em] text-foreground">
          {railLabel}
        </h3>
        <div className="space-y-2">
          {items.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={item.id === value ? "default" : "outline"}
              className="h-[var(--control-height-md)] w-full justify-between"
              onClick={() => onValueChange(item.id)}
            >
              <span className="truncate text-left">{item.label}</span>
              {typeof item.count === "number" ? (
                <Badge variant="outline" className="font-mono">
                  {item.count}
                </Badge>
              ) : null}
            </Button>
          ))}
        </div>
      </aside>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

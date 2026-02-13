"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type VerticalDataViewItem = {
  id: string;
  label: string;
  count?: number;
};

type VerticalDataViewsProps = {
  items: VerticalDataViewItem[];
  value: string;
  onValueChange: (value: string) => void;
  railLabel?: string;
  children: React.ReactNode;
  className?: string;
};

export function VerticalDataViews({
  items,
  value,
  onValueChange,
  railLabel,
  children,
  className,
}: VerticalDataViewsProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className={cn("space-y-4", className)}>
      <div className="flex items-center gap-4">
        {railLabel && <span className="text-sm font-medium text-muted-foreground">{railLabel}</span>}
        <TabsList>
          {items.map((item) => (
            <TabsTrigger key={item.id} value={item.id}>
              {item.label}
              {typeof item.count !== "undefined" && (
                <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                  {item.count}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value={value} className="space-y-4">
        {children}
      </TabsContent>
    </Tabs>
  );
}

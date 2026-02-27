"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-9 items-center justify-center rounded-xl border border-[var(--edge-default)] bg-muted p-0.5 text-muted-foreground shadow-none",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    asChild?: boolean;
  }
>(({ className, asChild, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    asChild={asChild}
    className={cn(
      "inline-flex h-8 items-center justify-center whitespace-nowrap rounded-[10px] border border-transparent px-3 text-sm font-medium transition-[background-color,color,border-color,box-shadow] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] [&_.material-symbols-rounded]:shrink-0",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)]",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:border-[var(--edge-default)] data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)]",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };

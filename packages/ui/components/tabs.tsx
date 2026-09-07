"use client";

import * as React from "react";
import {
  Tabs as DsTabs,
  TabsContent as DsTabsContent,
  TabsList as DsTabsList,
  TabsTrigger as DsTabsTrigger,
} from "@corelithzw/react";

import { cn } from "../lib/utils";

/**
 * Tabs — a shim onto the design system's Tabs primitive.
 *
 * This used to be Radix plus a wall of Tailwind, which meant every tab strip
 * in the app was a second opinion on what a tab looks like. The design system
 * exports the real thing — roving tabindex, arrow-key cycling, Home/End, and
 * the four documented variants — so this file only keeps the prop names the
 * existing call sites already pass.
 *
 * One difference worth knowing: the DS primitive is `variant`-driven and
 * defaults to `underline`. The local component always drew the segmented look,
 * so `segmented` is the default here and existing screens keep their shape.
 *
 * The product uses two of the four — `segmented` and `vertical`. Underline and
 * pill are deliberately not reached for: three tab shapes in one product is
 * three things a reader has to learn mean the same thing.
 */

type DsVariant = "underline" | "segmented" | "pill" | "vertical";

/** The DS root is a plain function component, so there is no ref to forward. */
function Tabs({ variant = "segmented", ...props }: React.ComponentProps<typeof DsTabs>) {
  return <DsTabs variant={variant as DsVariant} {...props} />;
}

const TabsList = React.forwardRef<
  React.ComponentRef<typeof DsTabsList>,
  React.ComponentPropsWithoutRef<typeof DsTabsList>
>(function TabsList({ className, ...props }, ref) {
  return <DsTabsList ref={ref} className={cn(className)} data-slot="tabs-list" {...props} />;
});
TabsList.displayName = "TabsList";

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof DsTabsTrigger>,
  React.ComponentPropsWithoutRef<typeof DsTabsTrigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return <DsTabsTrigger ref={ref} className={cn(className)} {...props} />;
});
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof DsTabsContent>,
  React.ComponentPropsWithoutRef<typeof DsTabsContent>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <DsTabsContent ref={ref} className={cn("mt-4", className)} data-slot="tabs-content" {...props} />
  );
});
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };

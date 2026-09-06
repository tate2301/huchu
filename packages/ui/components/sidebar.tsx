"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { useIsMobile } from "../hooks/use-mobile";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Input } from "./input";
import { Separator } from "./separator";
import { Sheet, SheetContent } from "./sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";
import { SidebarLeft } from "../lib/icons";

const SIDEBAR_COOKIE_NAME = "sidebar:state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "17.5rem";
const SIDEBAR_WIDTH_ICON = "3.75rem";
const SIDEBAR_WIDTH_MOBILE = "min(19rem, calc(100vw - 1rem))";

type SidebarContextValue = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}

type SidebarProviderProps = React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const SidebarProvider = React.forwardRef<HTMLDivElement, SidebarProviderProps>(
  (
    {
      defaultOpen = true,
      open: openProp,
      onOpenChange,
      className,
      style,
      children,
      ...props
    },
    ref,
  ) => {
    const isMobile = useIsMobile();
    const [open, setOpen] = React.useState(defaultOpen);
    const [openMobile, setOpenMobile] = React.useState(false);

    const openState = openProp ?? open;
    const setOpenState = React.useCallback(
      (value: boolean) => {
        if (openProp !== undefined) {
          onOpenChange?.(value);
        } else {
          setOpen(value);
        }
      },
      [openProp, onOpenChange],
    );

    React.useEffect(() => {
      if (typeof document === "undefined") return;
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    }, [openState]);

    const toggleSidebar = React.useCallback(() => {
      if (isMobile) {
        setOpenMobile((prev) => !prev);
      } else {
        setOpenState(!openState);
      }
    }, [isMobile, openState, setOpenState]);

    const state: SidebarContextValue["state"] = openState
      ? "expanded"
      : "collapsed";

    return (
      <SidebarContext.Provider
        value={{
          state,
          open: openState,
          setOpen: setOpenState,
          openMobile,
          setOpenMobile,
          isMobile,
          toggleSidebar,
        }}
      >
        <TooltipProvider delayDuration={0}>
          <div
            ref={ref}
            className={cn("flex min-h-screen w-full", className)}
            style={
              {
                "--sidebar-width": SIDEBAR_WIDTH,
                "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
                ...style,
              } as React.CSSProperties
            }
            {...props}
          >
            {children}
          </div>
        </TooltipProvider>
      </SidebarContext.Provider>
    );
  },
);
SidebarProvider.displayName = "SidebarProvider";

type SidebarProps = React.ComponentProps<"aside"> & {
  collapsible?: "offcanvas" | "icon" | "none";
  variant?: "sidebar" | "inset";
};

const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  (
    {
      className,
      collapsible = "icon",
      variant = "sidebar",
      children,
      ...props
    },
    ref,
  ) => {
    const { isMobile, openMobile, setOpenMobile, state } = useSidebar();
    const sidebar = (
      <aside
        ref={ref}
        data-sidebar="sidebar"
        data-state={state}
        data-collapsible={collapsible}
        data-variant={variant}
        className={cn(
          "peer group/sidebar relative flex h-[100dvh] min-h-[100dvh] mx-0 flex-col bg-sidebar text-sidebar-foreground shadow-[inset_-1px_0_0_0_var(--sidebar-border)] transition-[width,background-color] duration-[var(--motion-duration-base)] ease-[var(--motion-ease-standard)]",
          collapsible === "icon" && state === "collapsed"
            ? "w-[var(--sidebar-width-icon)]"
            : "w-[var(--sidebar-width)]",
          className,
        )}
        {...props}
      >
        {children}
      </aside>
    );

    if (collapsible === "none") {
      return sidebar;
    }

    if (isMobile) {
      return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile}>
          <SheetContent
            side="left"
            className="w-[var(--sidebar-width)] max-w-[var(--sidebar-width)] p-0"
            style={
              { "--sidebar-width": SIDEBAR_WIDTH_MOBILE } as React.CSSProperties
            }
          >
            {sidebar}
          </SheetContent>
        </Sheet>
      );
    }

    return sidebar;
  },
);
Sidebar.displayName = "Sidebar";

const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="header"
    className={cn("flex flex-col gap-2 p-1", className)}
    {...props}
  />
));
SidebarHeader.displayName = "SidebarHeader";

const SidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="footer"
    className={cn("mt-auto px-3 pt-2 pb-3", className)}
    {...props}
  />
));
SidebarFooter.displayName = "SidebarFooter";

const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="content"
    className={cn(
      "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
      className,
    )}
    {...props}
  />
));
SidebarContent.displayName = "SidebarContent";

const SidebarGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="group"
    className={cn("rounded-[8px]", className)}
    {...props}
  />
));
SidebarGroup.displayName = "SidebarGroup";

const SidebarGroupLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="group-label"
    className={cn(
      "px-2 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--text-subtle)]",
      className,
    )}
    {...props}
  />
));
SidebarGroupLabel.displayName = "SidebarGroupLabel";

const SidebarGroupContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="group-content"
    className={cn("mt-1 flex flex-col gap-0.5", className)}
    {...props}
  />
));
SidebarGroupContent.displayName = "SidebarGroupContent";

const SidebarMenu = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    data-sidebar="menu"
    className={cn("flex flex-col gap-0.5", className)}
    {...props}
  />
));
SidebarMenu.displayName = "SidebarMenu";

const SidebarMenuItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
  <li
    ref={ref}
    data-sidebar="menu-item"
    className={cn("list-none", className)}
    {...props}
  />
));
SidebarMenuItem.displayName = "SidebarMenuItem";

/**
 * Sidebar — the design system's, re-exported under the same names.
 *
 * The whole set now lives in `@corelithzw/react` (`src/shells/Sidebar.tsx`):
 * the provider that owns open/collapsed state and publishes `--sidebar-width*`,
 * the `<aside>` that becomes a `Drawer` on mobile, and every row primitive. The
 * markup contract is identical to what this file used to emit — same
 * `data-sidebar="…"` attributes, same `data-state` / `data-collapsible` /
 * `data-variant`, same `data-active` / `data-collapsed` on rows — so the 7
 * files importing from here (`SidebarGroup` and `SidebarGroupContent` 24× each,
 * `useSidebar` 16×) need no changes. The Tailwind utility strings this file
 * carried are now `.sidebar-*` rules in the DS's `nav.css`.
 *
 * `useSidebar` still throws outside a `SidebarProvider` — verified in the DS
 * source, so the "must be used within a SidebarProvider" guard is unchanged.
 *
 * Three things are deliberately different, none of them a prop:
 *   - `SidebarSeparator` is a DS `<div role="separator">` rather than a wrapped
 *     Radix `Separator`. Nothing here passed Radix-only props to it.
 *   - `SidebarInput` is the DS `Input` at `size="sm"` rather than this repo's
 *     `Input`. Same element, same forwarded props.
 *   - `SidebarTrigger`'s default glyph is the DS's own inline panel icon rather
 *     than the Phosphor `SidebarSimple` from `@/lib/icons`. Pass `children` to
 *     override it. The accessible name ("Toggle sidebar") is unchanged.
 *
 * New code should import these from `@corelithzw/react` directly.
 */
export {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarFooter,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
  SidebarInput,
  SidebarTrigger,
  SidebarRail,
  SidebarInset,
  useSidebar,
} from "@corelithzw/react";

export type {
  SidebarProps,
  SidebarProviderProps,
  SidebarMenuButtonProps,
  SidebarContextValue,
} from "@corelithzw/react";

"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeft } from "@/lib/icons";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const SIDEBAR_COOKIE_NAME = "sidebar:state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "17.75rem";
const SIDEBAR_WIDTH_ICON = "3.5rem";
const SIDEBAR_WIDTH_MOBILE = "20rem";

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
          "peer group/sidebar relative flex h-screen flex-col border-0 bg-muted text-sidebar-foreground shadow-[var(--surface-frame-shadow)] transition-[width] duration-200",
          collapsible === "icon" && state === "collapsed"
            ? "w-[--sidebar-width-icon]"
            : "w-[--sidebar-width]",
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
            className="w-[--sidebar-width] p-0"
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
    className={cn("flex flex-col gap-2 px-2 pt-2.5 pb-2", className)}
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
    className={cn("mt-auto px-2 pt-2 pb-2.5", className)}
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
      "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1.5 pb-2",
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
    className={cn("rounded-xl", className)}
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
      "px-2 text-[11px] font-semibold tracking-[0.06em] text-foreground/65",
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
    className={cn("mt-1 space-y-0.5", className)}
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
    className={cn("space-y-0.5", className)}
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

const sidebarMenuButtonVariants = cva(
  "relative flex w-full items-center gap-2 rounded px-2 py-2 text-[13px] font-medium text-sidebar-foreground/80 transition-[color,background-color,box-shadow] duration-150 hover:bg-background hover:shadow-[var(--action-outline-shadow-hover)] data-[active=true]:shadow-[var(--action-outline-shadow-hover)] hover:text-foreground data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:before:bg-primary data-[collapsed=true]:justify-center data-[collapsed=true]:px-0 data-[collapsed=true]:py-0 data-[collapsed=true]:h-9 data-[collapsed=true]:w-9 data-[collapsed=true]:mx-auto data-[collapsed=true]:[&_span]:hidden data-[collapsed=true]:before:hidden [&_.material-symbols-rounded]:shrink-0 [&_.material-symbols-rounded]:text-[var(--icon-size-sm)]",
  {
    variants: {
      variant: {
        default: "",
        outline:
          "border-0 bg-[var(--action-outline-bg)] text-foreground shadow-[var(--action-outline-shadow)] hover:bg-[var(--action-outline-hover-bg)] hover:shadow-[var(--action-outline-shadow-hover)] data-[active=true]:bg-[var(--action-outline-hover-bg)] data-[active=true]:shadow-[var(--action-outline-shadow-hover)]",
      },
      size: {
        default: "h-9",
        sm: "h-8 text-[12px]",
        lg: "h-11 text-[13px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type SidebarMenuButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    asChild?: boolean;
    isActive?: boolean;
    tooltip?: string;
  };

const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  SidebarMenuButtonProps
>(
  (
    { className, variant, size, asChild = false, isActive, tooltip, ...props },
    ref,
  ) => {
    const { state } = useSidebar();
    const Comp = asChild ? Slot : "button";
    const button = (
      <Comp
        ref={ref}
        data-active={isActive}
        data-collapsed={state === "collapsed"}
        className={cn(sidebarMenuButtonVariants({ variant, size, className }))}
        {...props}
      />
    );

    if (!tooltip) {
      return button;
    }

    return state === "collapsed" ? (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" align="center">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    ) : (
      button
    );
  },
);
SidebarMenuButton.displayName = "SidebarMenuButton";

const SidebarSeparator = React.forwardRef<
  React.ElementRef<typeof Separator>,
  React.ComponentPropsWithoutRef<typeof Separator>
>(({ className, ...props }, ref) => (
  <Separator ref={ref} className={cn("my-2", className)} {...props} />
));
SidebarSeparator.displayName = "SidebarSeparator";

const SidebarInput = React.forwardRef<
  React.ElementRef<typeof Input>,
  React.ComponentPropsWithoutRef<typeof Input>
>(({ className, ...props }, ref) => (
  <Input
    ref={ref}
    data-sidebar="input"
    className={cn(
      "h-8 rounded-lg bg-sidebar-accent/70 shadow-[var(--surface-frame-shadow)]",
      className,
    )}
    {...props}
  />
));
SidebarInput.displayName = "SidebarInput";

const SidebarTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentPropsWithoutRef<typeof Button>
>(({ className, onClick, ...props }, ref) => {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon-sm"
      className={cn("h-8 w-8", className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeft className="h-4 w-4" />
      <span className="sr-only">Toggle sidebar</span>
    </Button>
  );
});
SidebarTrigger.displayName = "SidebarTrigger";

const SidebarRail = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button">
>(({ className, ...props }, ref) => {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      ref={ref}
      type="button"
      aria-label="Toggle sidebar"
      onClick={toggleSidebar}
      className={cn(
        "absolute -right-1.5 top-1/2 hidden h-12 w-1 -translate-y-1/2 rounded-full bg-sidebar-accent shadow-[var(--surface-frame-shadow)] opacity-0 transition md:block group-hover/sidebar:opacity-100",
        className,
      )}
      {...props}
    />
  );
});
SidebarRail.displayName = "SidebarRail";

const SidebarInset = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex min-h-screen w-full flex-1 flex-col", className)}
    {...props}
  />
));
SidebarInset.displayName = "SidebarInset";

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
};

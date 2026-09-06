"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";

import { cn } from "@/lib/utils";

/**
 * Command — the design system's menu chrome on cmdk.
 *
 * cmdk stays: six of the seven call sites drive it with `shouldFilter={false}`
 * and their own query state, and `CommandItem`'s `value` is a concatenated
 * search string rather than an identity key. Neither survives a widget that
 * owns its own filtering, so only the styling moves.
 *
 * `CommandList` carries `.menu` — but purely as the *scope* for the DS's
 * `.menu .menu-item` / `.menu-divider` descendant rules. Every call site nests
 * this inside a `PopoverContent` or `DialogContent` that already draws the
 * surface, so `.menu`'s own background, border, radius, shadow and 220px floor
 * are switched back off; keeping them would double the chrome.
 *
 * `.menu .menu-item` is a fixed 3-column grid, which does not fit the arbitrary
 * item content these call sites render, so items are flattened back to flex.
 * Utilities outrank the `corelith` layer (see `app/globals.css`), so plain
 * classes are enough to win.
 *
 * The group heading is the one place a DS class could not be used: cmdk renders
 * `[cmdk-group-heading]` itself and exposes no className for it, so
 * `.menu-label` is replicated from tokens instead.
 *
 * `data-slot` values are load-bearing: `app/themes/admin.css` targets
 * `[data-slot="command"]`, `[data-slot="command-input-wrapper"]` and
 * `[data-slot="command-item"][data-selected="true"]`.
 */
function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex h-full w-full flex-col overflow-hidden bg-[var(--surface)] text-[var(--text-body)]",
        className,
      )}
      {...props}
    />
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex items-center border-b border-[var(--border-subtle)] px-3"
    >
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "flex h-11 w-full bg-transparent py-2 text-[var(--text-body)] outline-none placeholder:text-[var(--text-subtle)] disabled:cursor-not-allowed disabled:opacity-50 [font:var(--type-body)]",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        // `.menu` is here for its descendant rules; the surface it draws is
        // already drawn by the popover/dialog that wraps every call site.
        "menu",
        "block min-w-0 rounded-none border-0 bg-transparent shadow-none",
        "max-h-[280px] overflow-x-hidden overflow-y-auto",
        className,
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn(
        "py-6 text-center text-[var(--text-muted)] [font:var(--type-caption)]",
        className,
      )}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden text-[var(--text-body)]",
        // `.menu-label` in all but name — cmdk owns this element.
        "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-[var(--text-subtle)] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:[font:var(--type-eyebrow)]",
        className,
      )}
      {...props}
    />
  );
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        // DS row: radius, type ramp, colour, hover background.
        "menu-item",
        // Flattened out of `.menu .menu-item`'s 3-column grid.
        "relative flex min-h-10 items-center gap-2 px-2.5 py-2 outline-none select-none",
        "data-[selected=true]:bg-[var(--surface-muted)] data-[selected=true]:text-[var(--text-strong)]",
        "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("menu-divider", className)}
      {...props}
    />
  );
}

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
};

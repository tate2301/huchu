"use client";

import * as React from "react";

import { useIsBelow } from "@/hooks/use-mobile";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * A transient surface that is a popover on a desktop and a sheet on a phone.
 *
 * A popover is anchored to the control that opened it, which is what makes it
 * readable: the list of owners appears beside the word "Owner". At 390px there
 * is nothing to anchor to. A 358px-wide panel opened from a control near the
 * bottom of a form has nowhere to go but *over* the form — a screenshot of the
 * client picker in "New lead" showed it covering the four fields above its own
 * trigger, with the trigger itself still visible underneath, so the thing you
 * pressed and the thing that opened had no visible relationship at all.
 *
 * Below `sm` the same content comes up from the bottom edge instead, with the
 * property's name at the top of it. Which is both the platform convention and
 * the thing this product's record pages were asked for: Notion edits a
 * property by opening a labelled sheet, not by floating a menu over the page.
 *
 * The trigger is the caller's own element either way, so keyboard and pointer
 * behaviour on a desktop is exactly the Radix popover it was before.
 */
export function ResponsivePopover({
  open,
  onOpenChange,
  trigger,
  /** Names the sheet on a phone. The property's label, usually. */
  title,
  children,
  align = "start",
  sideOffset,
  /** Classes for the popover surface only — a sheet is always full width. */
  className,
  /** Classes for the region that holds `children` in both shapes. */
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
  align?: React.ComponentProps<typeof PopoverContent>["align"];
  sideOffset?: number;
  className?: string;
  contentClassName?: string;
}) {
  const compact = useIsBelow(640);

  /**
   * Escape closes this sheet and nothing behind it.
   *
   * The sheet is a Radix dialog; the form it is usually opened from is a Base
   * UI one. Neither library knows about the other's layer stack, so both
   * answered the same Escape: the client picker closed *and* the "New lead"
   * form under it closed with it, losing everything typed. That is the
   * "clicking a popover and then outside it closes the modal" this fixes.
   *
   * A native capture-phase listener on the document, registered while this
   * sheet is open, so it runs before either library's own document listener
   * and can stop the event dead. Registering last means the innermost open
   * sheet wins, which is the right one.
   */
  React.useEffect(() => {
    if (!compact || !open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      event.preventDefault();
      onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [compact, open, onOpenChange]);

  if (compact) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        {/* `size="lg"` is a cap, not a height — the sheet is as tall as what
            is in it. A picker with three options should not open a panel with
            room for twenty. */}
        <SheetContent side="bottom" size="lg" className="p-0">
          <SheetHeader className="px-4 pb-2 pt-1 text-left">
            <SheetTitle className="text-base">{title}</SheetTitle>
          </SheetHeader>
          <div className={cn("min-h-0 overflow-y-auto px-2 pb-2", contentClassName)}>
            {children}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} sideOffset={sideOffset} className={className}>
        <div className={contentClassName}>{children}</div>
      </PopoverContent>
    </Popover>
  );
}

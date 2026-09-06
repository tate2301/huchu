"use client";

import * as React from "react";
import { type VariantProps } from "class-variance-authority";

import { ChevronDownIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * SplitButton — the design system's `.btn-split` contract.
 *
 * The DS ships the CSS for this shape but no React component (its `ButtonGroup`
 * has a `split` flag that emits a class with no rules). `.btn-split` expects
 * exactly two `.btn` children — primary first, caret last — and handles the
 * inner radii, the shared border and the divider itself, which is why the local
 * per-size trigger padding map and the `rounded-l-none` / `-ml-px` juggling are
 * gone.
 *
 * One visual note: the DS divider between the two halves is a white-alpha line,
 * so it only reads on filled variants. On `ghost` and `link` the two halves
 * simply sit flush, which is the intended look for those.
 */
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

type SplitButtonProps = Omit<React.ComponentProps<"button">, "className"> &
  VariantProps<typeof buttonVariants> & {
    className?: string;
    primaryClassName?: string;
    triggerClassName?: string;
    contentClassName?: string;
    menuContent: React.ReactNode;
    triggerIcon?: React.ReactNode;
    triggerAriaLabel?: string;
    menuDisabled?: boolean;
    menuAlign?: React.ComponentProps<typeof DropdownMenuContent>["align"];
    menuSideOffset?: number;
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    modal?: boolean;
  };

function SplitButton({
  className,
  primaryClassName,
  triggerClassName,
  contentClassName,
  variant = "default",
  size = "default",
  menuContent,
  triggerIcon,
  triggerAriaLabel = "Open actions",
  menuDisabled = false,
  menuAlign = "end",
  menuSideOffset = 6,
  open,
  defaultOpen,
  onOpenChange,
  modal,
  disabled,
  children,
  ...buttonProps
}: SplitButtonProps) {
  const resolvedVariant = variant ?? "default";
  const resolvedSize: ButtonSize = size ?? "default";

  return (
    <DropdownMenu open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange} modal={modal}>
      <div data-slot="split-button" className={cn("btn-split", className)}>
        <Button
          variant={resolvedVariant}
          size={resolvedSize}
          disabled={disabled}
          className={primaryClassName}
          {...buttonProps}
        >
          {children}
        </Button>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={resolvedVariant}
            size={resolvedSize}
            disabled={disabled || menuDisabled}
            aria-label={triggerAriaLabel}
            className={triggerClassName}
          >
            {triggerIcon ?? <ChevronDownIcon className="size-4 opacity-70" />}
          </Button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent
        data-slot="split-button-content"
        align={menuAlign}
        sideOffset={menuSideOffset}
        className={contentClassName}
      >
        {menuContent}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { SplitButton };
export type { SplitButtonProps };

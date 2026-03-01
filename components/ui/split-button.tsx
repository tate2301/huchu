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

type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

const triggerPaddingBySize: Record<ButtonSize, string> = {
  default: "px-2.5",
  sm: "px-2",
  lg: "px-3",
  icon: "px-2",
  "icon-sm": "px-1.5",
  "icon-lg": "px-3",
};

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
  const resolvedSize = size ?? "default";
  const shouldMergeBorders =
    resolvedVariant !== "ghost" && resolvedVariant !== "link";

  return (
    <DropdownMenu
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      modal={modal}
    >
      <div data-slot="split-button" className={cn("inline-flex items-stretch", className)}>
        <Button
          variant={resolvedVariant}
          size={resolvedSize}
          disabled={disabled}
          className={cn("rounded-r-none", primaryClassName)}
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
            className={cn(
              "rounded-l-none",
              shouldMergeBorders && "-ml-px",
              triggerPaddingBySize[resolvedSize],
              triggerClassName,
            )}
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

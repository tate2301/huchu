"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { Button as DsButton, type ButtonVariant } from "@corelithzw/react";

import { cn } from "../lib/utils";

/**
 * Button — the design system's, behind this repo's older prop names.
 *
 * This is the highest-traffic primitive in the codebase (~212 files), so the
 * local API is preserved exactly rather than migrated call site by call site:
 *
 *   - `variant` keeps its old values and maps onto the DS axis. The DS has no
 *     separate `outline`; its `secondary` already carries the border.
 *   - `size="icon"` has no DS equivalent, so it maps to `iconOnly`. Callers
 *     already pass `aria-label` there, which `iconOnly` requires.
 *   - `asChild` is kept as a local Radix Slot shim; the DS ships no Slot, and
 *     three call sites render a link as a button.
 *
 * New code should import `Button` from `@corelithzw/react`.
 */
const VARIANT_MAP: Record<string, ButtonVariant> = {
  default: "primary",
  primary: "primary",
  secondary: "secondary",
  // The DS has no outline variant — secondary already carries the border.
  outline: "secondary",
  ghost: "ghost",
  quiet: "quiet",
  link: "link",
  destructive: "destructive",
  danger: "danger",
};

const SIZE_MAP: Record<string, "sm" | "md" | "lg"> = {
  default: "md",
  sm: "sm",
  lg: "lg",
  icon: "md",
  "icon-sm": "sm",
  "icon-lg": "lg",
};

export type ButtonProps = Omit<
  React.ComponentProps<typeof DsButton>,
  "variant" | "size" | "tone"
> & {
  variant?: keyof typeof VARIANT_MAP;
  size?: keyof typeof SIZE_MAP;
  asChild?: boolean;
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "default", asChild, children, ...props },
  ref,
) {
  const iconOnly = size === "icon" || size === "icon-sm" || size === "icon-lg";

  if (asChild) {
    // Slot renders the DS classes onto the caller's own element (usually a
    // link). The DS Button is a real <button>, so it can't be the host here.
    return (
      <Slot
        className={cn(
          "btn",
          variantClass(variant),
          size !== "default" && `btn-${SIZE_MAP[size]}`,
          iconOnly && "btn-icon",
          className,
        )}
        {...(props as React.ComponentProps<typeof Slot>)}
      >
        {children}
      </Slot>
    );
  }

  return (
    <DsButton
      ref={ref}
      variant={VARIANT_MAP[variant] ?? "primary"}
      size={SIZE_MAP[size] ?? "md"}
      iconOnly={iconOnly || undefined}
      className={cn(className)}
      {...props}
    >
      {children}
    </DsButton>
  );
});

/**
 * `danger` is a valid DS *prop* value but ships no `.btn-danger` class — the
 * component resolves it to the destructive styling internally. The two paths
 * below emit classes directly, so they have to do that resolution themselves.
 */
function variantClass(variant: keyof typeof VARIANT_MAP): string {
  const resolved = VARIANT_MAP[variant] ?? "primary";
  return `btn-${resolved === "danger" ? "destructive" : resolved}`;
}

/** Kept so `cn(buttonVariants({ variant }))` call sites still compile. */
function buttonVariants({
  variant = "default",
  size = "default",
}: { variant?: keyof typeof VARIANT_MAP; size?: keyof typeof SIZE_MAP } = {}) {
  return cn("btn", variantClass(variant), size !== "default" && `btn-${SIZE_MAP[size]}`);
}

export { Button, buttonVariants };

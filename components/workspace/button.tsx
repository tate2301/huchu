import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { Loader2 } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Button — `cx-btn` (00-foundations 5.2).
 *
 * `primary` is the one orange fill on a screen; `danger` names its object and
 * stays an outline until a confirm, where `danger-fill` is the go button.
 * `bar` is 32px (header, toolbar, pager), `field` 36px (sheets, settings,
 * dialogs). `busy` swaps the icon for a spinner and holds the button.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-fill";
export type ButtonSize = "bar" | "field";

export type ButtonProps = React.ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** A 14px leading icon. */
  icon?: React.ReactNode;
  /** Square, icon only: give it an `aria-label`. */
  iconOnly?: boolean;
  busy?: boolean;
  /** Render the button's look onto its one child (a link). */
  asChild?: boolean;
};

export function buttonClassName({
  variant = "secondary",
  size = "bar",
  iconOnly = false,
}: Pick<ButtonProps, "variant" | "size" | "iconOnly"> = {}) {
  return cn(
    "cx-btn",
    variant !== "secondary" && `cx-btn--${variant}`,
    size === "field" && "cx-btn--field",
    iconOnly && "cx-btn--icon",
  );
}

export function Button({
  variant,
  size,
  icon,
  iconOnly,
  busy = false,
  asChild = false,
  className,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(buttonClassName({ variant, size, iconOnly }), className);
  if (asChild) {
    return (
      <Slot className={classes} {...props}>
        {children}
      </Slot>
    );
  }
  const lead = busy ? <Loader2 className="cx-btn__spin" aria-hidden /> : icon;
  return (
    <button
      type={type ?? "button"}
      className={classes}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {lead}
      {children}
    </button>
  );
}

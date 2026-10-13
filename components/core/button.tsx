"use client";

import * as React from "react";
import Link from "next/link";

import { Icon, type IconName } from "./icon";
import { ariaKeyShortcuts, useShortcut, useShortcutLabel, type Shortcut } from "./shortcuts";

export type ButtonVariant = "default" | "primary" | "quiet" | "ink" | "danger";

type ButtonLook = {
  variant?: ButtonVariant;
  size?: "default" | "lg" | "sm" | "touch";
  /** The icon before the label. */
  icon?: IconName;
  /** An icon after the label (a menu's chevron). */
  iconEnd?: IconName;
  /** A shortcut the button shows in its `kbd` slot and answers to. */
  shortcut?: Shortcut;
  /** A square button with only its icon; `label` becomes its accessible name. */
  iconOnly?: boolean;
  busy?: boolean;
  block?: boolean;
};

function buttonClass({ variant = "default", size = "default", iconOnly, block }: ButtonLook, extra?: string) {
  return [
    "btn",
    variant !== "default" ? `btn-${variant}` : null,
    size !== "default" ? `btn-${size}` : null,
    iconOnly ? "btn-icon" : null,
    block ? "btn-block" : null,
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

/** The shortcut inside a button. On the primary it is a ring, not a key cap. */
export function Kbd({ children, onPrimary = false }: { children: Shortcut; onPrimary?: boolean }) {
  const label = useShortcutLabel(children);
  return (
    <span
      className="kbd"
      style={
        onPrimary
          ? { background: "transparent", color: "inherit", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.32)" }
          : undefined
      }
    >
      {label}
    </span>
  );
}

function Inside({ look, children }: { look: ButtonLook; children?: React.ReactNode }) {
  return (
    <>
      {look.icon ? <Icon name={look.icon} /> : null}
      {look.iconOnly ? null : children}
      {look.iconEnd ? <Icon name={look.iconEnd} /> : null}
      {look.shortcut && !look.iconOnly ? <Kbd onPrimary={look.variant === "primary"}>{look.shortcut}</Kbd> : null}
    </>
  );
}

export type ButtonProps = ButtonLook & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  children?: React.ReactNode;
  /** The accessible name of an icon-only button. */
  label?: string;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, icon, iconEnd, shortcut, iconOnly, busy, block, label, className, children, type = "button", ...rest },
  forwarded,
) {
  const own = React.useRef<HTMLButtonElement>(null);
  React.useImperativeHandle(forwarded, () => own.current as HTMLButtonElement);
  const look = { variant, size, icon, iconEnd, shortcut, iconOnly, busy, block };
  useShortcut(shortcut, () => own.current?.click(), { enabled: !rest.disabled && !busy });
  return (
    <button
      ref={own}
      type={type}
      className={buttonClass(look, className)}
      aria-busy={busy || undefined}
      aria-label={iconOnly ? label : rest["aria-label"]}
      aria-keyshortcuts={shortcut ? ariaKeyShortcuts(shortcut) : undefined}
      {...rest}
    >
      <Inside look={look}>{children}</Inside>
    </button>
  );
});

export type ButtonLinkProps = ButtonLook &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href"> & {
    href: string;
    children?: React.ReactNode;
    label?: string;
  };

/** A link that looks like a button: the same look, the same shortcut slot. */
export function ButtonLink({
  variant,
  size,
  icon,
  iconEnd,
  shortcut,
  iconOnly,
  block,
  label,
  className,
  children,
  href,
  ...rest
}: ButtonLinkProps) {
  const own = React.useRef<HTMLAnchorElement>(null);
  const look = { variant, size, icon, iconEnd, shortcut, iconOnly, block };
  useShortcut(shortcut, () => own.current?.click());
  return (
    <Link
      ref={own}
      href={href}
      className={buttonClass(look, className)}
      aria-label={iconOnly ? label : rest["aria-label"]}
      aria-keyshortcuts={shortcut ? ariaKeyShortcuts(shortcut) : undefined}
      {...rest}
    >
      <Inside look={look}>{children}</Inside>
    </Link>
  );
}

/** Several buttons in a row read as one control. */
export function ButtonGroup({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div role="group" className={["btn-group", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}

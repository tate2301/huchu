"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { Check } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Menu — the workspace menu on Radix DropdownMenu (positioning, roving focus,
 * typeahead and Esc come from Radix).
 *
 * Panel: padding 6, radius 12, `--surface`, `--shadow-float`. Items 34px
 * (`roomy` makes them 36, as in Export), padding 0 8, radius 8, `--hover`
 * under the pointer or the keyboard; `danger` items in `--bad`. A separator is
 * a 1px `--line` rule with 4px margins; `MenuCaption` is the 12px `--ink-3`
 * line that says what the menu acts on ("The 312 shifts the filters show").
 */
export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuGroup = DropdownMenu.Group;

export type MenuContentProps = React.ComponentProps<typeof DropdownMenu.Content> & {
  roomy?: boolean;
};

export function MenuContent({
  roomy = false,
  className,
  align = "start",
  sideOffset = 4,
  ...props
}: MenuContentProps) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={sideOffset}
        className={cn("cx-menu", roomy && "cx-menu--roomy", className)}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

type ItemExtras = {
  /** A 14px leading icon. */
  icon?: React.ReactNode;
  /** A second line under the label, 12px `--ink-3`. */
  sub?: React.ReactNode;
  /** A short trailing mark in mono ("⌘P", ".xlsx"). */
  hint?: React.ReactNode;
};

function ItemBody({ icon, sub, hint, children }: ItemExtras & { children?: React.ReactNode }) {
  return (
    <>
      {icon ? (
        <span className="cx-menu__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {sub ? (
        <span className="cx-menu__label">
          <span>{children}</span>
          <span className="cx-menu__sub">{sub}</span>
        </span>
      ) : (
        <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
      )}
      {hint ? <span className="cx-menu__hint">{hint}</span> : null}
    </>
  );
}

export type MenuItemProps = React.ComponentProps<typeof DropdownMenu.Item> &
  ItemExtras & {
    danger?: boolean;
  };

export function MenuItem({ danger = false, icon, sub, hint, className, children, ...props }: MenuItemProps) {
  return (
    <DropdownMenu.Item className={cn("cx-menu__item", danger && "cx-menu__item--danger", className)} {...props}>
      <ItemBody icon={icon} sub={sub} hint={hint}>
        {children}
      </ItemBody>
    </DropdownMenu.Item>
  );
}

/** A ticked choice that stays open-ended (Columns). */
export function MenuCheckboxItem({
  className,
  children,
  sub,
  hint,
  ...props
}: React.ComponentProps<typeof DropdownMenu.CheckboxItem> & Omit<ItemExtras, "icon">) {
  return (
    <DropdownMenu.CheckboxItem className={cn("cx-menu__item", className)} {...props}>
      <span className="cx-menu__mark">
        <DropdownMenu.ItemIndicator>
          <Check aria-hidden />
        </DropdownMenu.ItemIndicator>
      </span>
      <ItemBody sub={sub} hint={hint}>
        {children}
      </ItemBody>
    </DropdownMenu.CheckboxItem>
  );
}

/** One choice of several (Sort, Group). */
export const MenuRadioGroup = DropdownMenu.RadioGroup;

export function MenuRadioItem({
  className,
  children,
  sub,
  hint,
  ...props
}: React.ComponentProps<typeof DropdownMenu.RadioItem> & Omit<ItemExtras, "icon">) {
  return (
    <DropdownMenu.RadioItem className={cn("cx-menu__item", className)} {...props}>
      <span className="cx-menu__mark">
        <DropdownMenu.ItemIndicator>
          <Check aria-hidden />
        </DropdownMenu.ItemIndicator>
      </span>
      <ItemBody sub={sub} hint={hint}>
        {children}
      </ItemBody>
    </DropdownMenu.RadioItem>
  );
}

export function MenuSeparator({ className, ...props }: React.ComponentProps<typeof DropdownMenu.Separator>) {
  return <DropdownMenu.Separator className={cn("cx-menu__rule", className)} {...props} />;
}

export function MenuCaption({ className, ...props }: React.ComponentProps<typeof DropdownMenu.Label>) {
  return <DropdownMenu.Label className={cn("cx-menu__caption", className)} {...props} />;
}

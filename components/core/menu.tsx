"use client";

import * as React from "react";

import { Button, type ButtonProps } from "./button";
import { Icon, type IconName } from "./icon";

export type MenuItem = {
  key: string;
  label: React.ReactNode;
  icon?: IconName;
  /** Ticked: the view or option that is on. */
  checked?: boolean;
  danger?: boolean;
  /** Shown faint, icon included, and not pressable; `title` says why. */
  disabled?: boolean;
  title?: string;
  onSelect: () => void;
};

export type MenuEntry = MenuItem | { separator: true } | { heading: string };

/**
 * A button that opens a menu under it (the kit's `.menu`): "All invoices ▾",
 * "CBZ, USD ▾", Columns. Arrow keys move, Enter picks, Esc and a click outside
 * close it, and focus goes back to the button.
 */
export function MenuButton({
  items,
  align = "start",
  label,
  children,
  ...button
}: Omit<ButtonProps, "onClick"> & {
  items: MenuEntry[];
  align?: "start" | "end";
  /** The menu's accessible name, when the button's text is not enough. */
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const wrap = React.useRef<HTMLDivElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const menuId = React.useId();

  const close = React.useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", outside);
    wrap.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, close]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const options = [...(wrap.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const at = options.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "ArrowDown" ? (at + 1) % options.length : (at - 1 + options.length) % options.length;
    options[next]?.focus();
  };

  return (
    <div ref={wrap} className="menu-wrap" style={{ position: "relative", display: "inline-flex" }}>
      <Button
        ref={trigger}
        iconEnd="down"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        {...button}
      >
        {children}
      </Button>
      {open ? (
        <div
          id={menuId}
          className="menu"
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            [align === "end" ? "right" : "left"]: 0,
            zIndex: 30,
            maxHeight: 360,
            overflowY: "auto",
          }}
        >
          {items.map((entry, index) => {
            if ("separator" in entry) return <div key={`sep-${index}`} className="menu-sep" role="separator" />;
            if ("heading" in entry) return <div key={`h-${entry.heading}`} className="menu-label">{entry.heading}</div>;
            const checkable = entry.checked !== undefined;
            return (
              <button
                key={entry.key}
                type="button"
                role={checkable ? "menuitemradio" : "menuitem"}
                aria-checked={checkable ? entry.checked : undefined}
                className={entry.danger && !entry.disabled ? "menu-item menu-item-danger" : "menu-item"}
                data-active={entry.checked ? "true" : undefined}
                aria-disabled={entry.disabled || undefined}
                title={entry.title}
                onClick={() => {
                  if (entry.disabled) return;
                  entry.onSelect();
                  close();
                }}
              >
                {entry.icon ? <Icon name={entry.icon} /> : null}
                <span className="truncate">{entry.label}</span>
                {entry.checked ? <Icon name="check" className="end" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

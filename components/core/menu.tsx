"use client";

import * as React from "react";
import { createPortal } from "react-dom";

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
  /** What the item does, as `data-action` for tests that look for it (Books' void, revise, delete). */
  action?: string;
  onSelect: () => void;
};

export type MenuEntry = MenuItem | { separator: true } | { heading: string };

/**
 * A button that opens a menu under it (the kit's `.menu`): "All invoices ▾",
 * "CBZ, USD ▾", Columns. Arrow keys move, Enter picks, Esc and a click outside
 * close it, and focus goes back to the button.
 *
 * Portaled to `document.body` and positioned against the viewport so sticky
 * bottom selection bars (`.foot-sel`, `.k-sel`) and overflow-hidden containers
 * never clip the menu; when near the bottom of the screen it opens upward.
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
  const [coords, setCoords] = React.useState<{
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    maxHeight: number;
  } | null>(null);
  const wrap = React.useRef<HTMLDivElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const menuId = React.useId();

  const close = React.useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }, []);

  const updatePosition = React.useCallback(() => {
    const btn = trigger.current;
    if (!btn || typeof window === "undefined") return;
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const estimatedHeight = Math.min(360, items.length * 36 + 16);
    const spaceBelow = vh - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUpward = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

    const horizontal =
      align === "end"
        ? { right: Math.max(8, vw - rect.right) }
        : { left: Math.max(8, Math.min(rect.left, vw - 220)) };

    if (openUpward) {
      setCoords({
        bottom: vh - rect.top + 4,
        maxHeight: Math.min(360, Math.max(140, spaceAbove)),
        ...horizontal,
      });
    } else {
      setCoords({
        top: rect.bottom + 4,
        maxHeight: Math.min(360, Math.max(140, spaceBelow)),
        ...horizontal,
      });
    }
  }, [align, items.length]);

  React.useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updatePosition]);

  React.useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!wrap.current?.contains(target) && !menuRef.current?.contains(target)) {
        close(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
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
    const options = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    if (options.length === 0) return;
    const at = options.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "ArrowDown" ? (at + 1) % options.length : (at - 1 + options.length) % options.length;
    options[next]?.focus();
  };

  const menuNode =
    open && typeof document !== "undefined" ? (
      <div className="ck" style={{ display: "contents" }}>
        <div
          ref={menuRef}
          id={menuId}
          className="menu"
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          style={{
            position: "fixed",
            top: coords?.top,
            bottom: coords?.bottom,
            left: coords?.left,
            right: coords?.right,
            zIndex: 120,
            maxHeight: coords?.maxHeight ?? 360,
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
                data-action={entry.action}
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
      </div>
    ) : null;

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
      {menuNode ? createPortal(menuNode, document.body) : null}
    </div>
  );
}

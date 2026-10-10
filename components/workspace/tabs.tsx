"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { CountPill } from "./count-pill";

/**
 * Tabs — the 44px row of a list or a record: an ink underline under the
 * selected tab (600, `--ink`), the others `--ink-2` at 400, each with its
 * count. `role="tablist"` / `tab` with `aria-selected`; the arrow keys, Home
 * and End move the selection, and only the selected tab is in the tab order.
 *
 * The caller owns what a tab shows (a list puts it in the address), so this
 * is controlled: `value` and `onValueChange`. Pass `panelId` when the tabs
 * control a single panel element.
 */
export type TabItem<V extends string = string> = {
  value: V;
  label: React.ReactNode;
  count?: React.ReactNode;
};

export type TabsProps<V extends string = string> = Omit<
  React.ComponentProps<"div">,
  "onChange" | "defaultValue"
> & {
  items: ReadonlyArray<TabItem<V>>;
  value: V;
  onValueChange?: (value: V) => void;
  /** The id of the panel these tabs control. */
  panelId?: string;
};

export function Tabs<V extends string = string>({
  items,
  value,
  onValueChange,
  panelId,
  className,
  ...props
}: TabsProps<V>) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const selected = Math.max(
    0,
    items.findIndex((item) => item.value === value),
  );

  const select = (index: number) => {
    const item = items[index];
    if (!item) return;
    refs.current[index]?.focus();
    if (item.value !== value) onValueChange?.(item.value);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    select(next);
  };

  return (
    <div role="tablist" className={cn("cx-tabs", className)} {...props}>
      {items.map((item, index) => {
        const isSelected = index === selected;
        return (
          <button
            key={item.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={panelId}
            tabIndex={isSelected ? 0 : -1}
            className="cx-tab"
            onClick={() => select(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {item.label}
            {item.count !== undefined && item.count !== null ? (
              <CountPill inTab>{item.count}</CountPill>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

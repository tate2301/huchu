"use client";

import * as React from "react";
import Link from "next/link";

export type TabItem<V extends string = string> = {
  value: V;
  label: React.ReactNode;
  /** A count shown after the label. */
  count?: React.ReactNode;
  /** When set, the tab is a link to this page instead of a switch. */
  href?: string;
};

/** Arrow keys move along a row of tabs, as a tablist does. */
function onArrows(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
  const at = items.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return;
  const next = items[(at + (event.key === "ArrowRight" ? 1 : items.length - 1)) % items.length];
  next?.focus();
  next?.click();
  event.preventDefault();
}

function Items<V extends string>({
  items,
  value,
  onChange,
  className,
  countClass,
}: {
  items: TabItem<V>[];
  value: V;
  onChange?: (value: V) => void;
  className?: string;
  countClass: string;
}) {
  return (
    <>
      {items.map((item) => {
        const selected = item.value === value;
        const inside = (
          <>
            {item.label}
            {item.count !== undefined ? <span className={countClass}>{item.count}</span> : null}
          </>
        );
        return item.href ? (
          <Link
            key={item.value}
            href={item.href}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={className}
            style={{ textDecoration: "none" }}
          >
            {inside}
          </Link>
        ) : (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={className}
            onClick={() => onChange?.(item.value)}
          >
            {inside}
          </button>
        );
      })}
    </>
  );
}

/** Tabs split a page or a panel; the chosen one has an ink line under it. */
export function Tabs<V extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: TabItem<V>[];
  value: V;
  onChange?: (value: V) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onArrows}>
      <Items items={items} value={value} onChange={onChange} className="tab" countClass="count" />
    </div>
  );
}

/** Segments switch a view of the same list: To match, Matched, Everything. */
export function Segmented<V extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: TabItem<V>[];
  value: V;
  onChange?: (value: V) => void;
  label: string;
}) {
  return (
    <div className="seg" role="tablist" aria-label={label} onKeyDown={onArrows}>
      <Items items={items} value={value} onChange={onChange} countClass="n" />
    </div>
  );
}

"use client";

import * as React from "react";

import { Icon, type IconName } from "@/components/core";

/**
 * A block on the builder's page, drawn as it will read. Clicking it selects it:
 * a 2px primary outline and a tag over its corner naming it. In Preview
 * nothing is selectable.
 */
export function CanvasBlock({
  selected,
  onSelect,
  tag,
  plain = false,
  preview = false,
  label,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  tag: { icon: IconName; label: string };
  /** Text on the page itself (a heading, a note) rather than a card. */
  plain?: boolean;
  preview?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const on = selected && !preview;
  return (
    <div
      className={["rbk", plain && "is-text", on && "rb-sel"].filter(Boolean).join(" ")}
      aria-label={label}
      aria-current={on ? "true" : undefined}
      data-block
      onClickCapture={preview ? undefined : onSelect}
    >
      {on ? (
        <span className="sel-tag">
          <Icon name={tag.icon} />
          {tag.label}
        </span>
      ) : null}
      {children}
    </div>
  );
}

/** Two half blocks side by side; anything else on a row of its own. */
export function canvasRows<T extends { half?: boolean }>(blocks: readonly T[]): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    const next = blocks[index + 1];
    if (block.half && next?.half) {
      rows.push([block, next]);
      index += 1;
    } else rows.push([block]);
  }
  return rows;
}

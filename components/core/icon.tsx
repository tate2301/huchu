"use client";

import * as React from "react";

import { ICONS, type IconName } from "./icons";

export type { IconName };

/** The one glyph not on the 24 grid: WhatsApp's own mark, drawn on its 256 grid as the boards draw it. */
const VIEWBOX: Partial<Record<IconName, string>> = { remind: "0 0 256 258" };

/**
 * A module that draws its own icon set puts a renderer here (Books draws
 * Corelith UI icons, design/books/spec/icons.md). It answers null for a name
 * it has no glyph for, and the kit's own glyph is drawn.
 */
export type IconRenderer = (name: IconName, props: { size: 16 | 20; className?: string }) => React.ReactNode | null;

const IconRendererContext = React.createContext<IconRenderer | null>(null);

export function IconRendererProvider({ renderer, children }: { renderer: IconRenderer | null; children: React.ReactNode }) {
  return <IconRendererContext.Provider value={renderer}>{children}</IconRendererContext.Provider>;
}

/**
 * One of the kit's filled icons on its 24 grid, drawn at 16 (`.ic`) or 20.
 * Decorative: the control around it carries the name.
 */
export function Icon({ name, size = 16, className }: { name: IconName; size?: 16 | 20; className?: string }) {
  const renderer = React.useContext(IconRendererContext);
  const cls = ["ic", size === 20 ? "ic-20" : null, className].filter(Boolean).join(" ");
  const own = renderer?.(name, { size, className: cls });
  if (own) return own;
  return <svg className={cls} viewBox={VIEWBOX[name] ?? "0 0 24 24"} aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
}

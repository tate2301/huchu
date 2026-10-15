"use client";

import * as React from "react";

import { Kit } from "@/components/core";

import "./builder-grid.css";
import { ResizeEdge } from "./resize-edge";
import type { PanelName } from "./sizes";
import { usePanelSizes } from "./use-panel-sizes";

export type BuilderMode = "build" | "preview";

/**
 * The builder's grid (spec/shell.md, "The builder"), one for reports, forms,
 * documents and templates: the outline on the left, the bar over the page,
 * the inspector on the right and the shelf under the page. Only the catalogue
 * and the page change between builders; each fills these slots.
 *
 * The outline, the inspector and the shelf (and the shelf's two fixed
 * columns) each resize from their edge, and each person's sizes are kept per
 * kind of builder (`scope`). In Preview only the bar and the page show.
 * Below 1100px the bar, the page and the shelf's middle column stack.
 */
export function BuilderGrid({
  scope,
  mode = "build",
  wideBar = false,
  bar,
  outline,
  canvas,
  canvasLabel,
  inspector,
  inspectorLabel,
  shelf,
  shelfLabel = "Questions this board asks",
  shelfTall = false,
}: {
  /** Whose sizes these are among the builders: "report", "arrange", "form"… */
  scope: string;
  mode?: BuilderMode;
  /** The bar runs across the whole window, over the outline (arranging a page). */
  wideBar?: boolean;
  bar: React.ReactNode;
  outline?: React.ReactNode;
  canvas: React.ReactNode;
  canvasLabel: string;
  inspector?: React.ReactNode;
  inspectorLabel?: string;
  /** The shelf's three columns: its list, the middle (steps or SQL), and the results. */
  shelf?: { list: React.ReactNode; middle: React.ReactNode; results: React.ReactNode };
  shelfLabel?: string;
  /** Vane has a note in the shelf: it opens taller (340 rather than 272). */
  shelfTall?: boolean;
}) {
  const { sizes, resize, keep } = usePanelSizes(scope);
  const shelfHeight = shelfTall ? Math.max(sizes.shelf, 340) : sizes.shelf;

  const edge = (panel: PanelName, side: "left" | "right" | "top", label: string, style?: React.CSSProperties) => (
    <ResizeEdge
      panel={panel}
      side={side}
      size={panel === "shelf" ? shelfHeight : sizes[panel]}
      label={label}
      onResize={(size) => resize(panel, size)}
      onDone={() => keep()}
      style={style}
    />
  );

  const classes = ["rb2", wideBar && "is-wide-bar", !shelf && "no-shelf", mode === "preview" && "is-preview"].filter(Boolean).join(" ");
  const style = {
    "--rb-out": `${sizes.outline}px`,
    "--rb-ins": `${sizes.inspector}px`,
    "--rb-shelf": `${shelfHeight}px`,
    "--rb-q": `${sizes.questions}px`,
    "--rb-s": `${sizes.steps}px`,
  } as React.CSSProperties;

  return (
    <Kit className="rb-root">
      <div className={classes} style={style}>
        {outline ? (
          <aside className="panel-m rb-out" aria-label="Outline">
            {outline}
            {edge("outline", "right", "Resize the outline")}
          </aside>
        ) : null}
        <header className="rb-bar">{bar}</header>
        <div className="rb-can" role="region" aria-label={canvasLabel}>
          {canvas}
        </div>
        {inspector ? (
          <aside className="rb-ins" aria-label={inspectorLabel ?? "Inspector"}>
            {edge("inspector", "left", "Resize the inspector")}
            {inspector}
          </aside>
        ) : null}
        {shelf ? (
          <section className="rb-shelf" aria-label={shelfLabel}>
            {edge("shelf", "top", "Resize the shelf")}
            <div className="sh-q">{shelf.list}</div>
            <div className="sh-s">{shelf.middle}</div>
            <div className="sh-r">{shelf.results}</div>
            {edge("questions", "right", "Resize the questions", { left: sizes.questions - 3, right: "auto" })}
            {edge("steps", "right", "Resize the steps", { left: sizes.questions + sizes.steps - 3, right: "auto" })}
          </section>
        ) : null}
      </div>
    </Kit>
  );
}

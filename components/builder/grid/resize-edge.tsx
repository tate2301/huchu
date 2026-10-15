"use client";

import * as React from "react";

import { stepSize, SIZE_LIMITS, type PanelName } from "./sizes";

/**
 * The edge a panel is resized from: drag it, or focus it and use the arrow
 * keys (Shift for bigger steps). `side` is where the edge sits on the panel;
 * dragging away from the panel makes it bigger.
 */
export function ResizeEdge({
  panel,
  side,
  size,
  label,
  onResize,
  onDone,
  style,
}: {
  panel: PanelName;
  side: "left" | "right" | "top";
  size: number;
  label: string;
  onResize: (size: number) => void;
  onDone: () => void;
  /** Where it sits, when that is not the panel's own edge (a column inside the shelf). */
  style?: React.CSSProperties;
}) {
  const [moving, setMoving] = React.useState(false);
  const start = React.useRef<{ at: number; size: number } | null>(null);
  const [min, max] = SIZE_LIMITS[panel];
  const vertical = side === "top";

  const position = (event: React.PointerEvent) => (vertical ? event.clientY : event.clientX);
  // Away from the panel grows it: right of an outline, left of an inspector, above a shelf.
  const sign = side === "right" ? 1 : -1;

  return (
    <div
      role="separator"
      aria-orientation={vertical ? "horizontal" : "vertical"}
      aria-label={label}
      aria-valuenow={size}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className={`rb-edge is-${side}${moving ? " is-moving" : ""}`}
      style={style}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { at: position(event), size };
        setMoving(true);
        event.currentTarget.closest(".rb2")?.classList.add("is-resizing");
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        onResize(start.current.size + sign * (position(event) - start.current.at));
      }}
      onPointerUp={(event) => {
        if (!start.current) return;
        start.current = null;
        setMoving(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
        event.currentTarget.closest(".rb2")?.classList.remove("is-resizing");
        onDone();
      }}
      onKeyDown={(event) => {
        const grow = vertical ? "ArrowUp" : side === "right" ? "ArrowRight" : "ArrowLeft";
        const shrink = vertical ? "ArrowDown" : side === "right" ? "ArrowLeft" : "ArrowRight";
        if (event.key !== grow && event.key !== shrink) return;
        event.preventDefault();
        onResize(stepSize(panel, size, event.key === grow ? 1 : -1, event.shiftKey));
        onDone();
      }}
    />
  );
}

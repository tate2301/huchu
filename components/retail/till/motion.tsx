/**
 * The till's movements, from the same numbers as the motion tokens in
 * docs/design/till/tokens.css (fast 120ms, base 180ms, ease-out). Motion says
 * where a thing came from or went; nothing moves for its own sake, and with
 * reduced motion asked for nothing moves at all.
 */

"use client";

import * as React from "react";
import { animate, type Transition } from "framer-motion";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const motionBase: Transition = { duration: 0.18, ease: EASE_OUT };

/** A line comes in from just above and leaves to the right; the lines under it close up. */
export const lineMotion = {
  layout: "position" as const,
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: 24 },
  transition: motionBase,
};

function stillness() {
  return typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A figure that runs to its new value (fast, ease-out) instead of jumping, so
 * a total going up reads as going up. React draws it once; after that the
 * text is set here, frame by frame, or at once with reduced motion.
 */
export function RollingFigure({ value, format, className }: { value: number; format: (value: number) => string; className?: string }) {
  const node = React.useRef<HTMLSpanElement>(null);
  const shown = React.useRef(value);
  const [first] = React.useState(() => format(value));
  React.useEffect(() => {
    const span = node.current;
    if (!span || shown.current === value) return;
    // Still, or nobody looking (a hidden window gets no frames, so a run would stop part way).
    if (stillness() || document.hidden) {
      shown.current = value;
      span.textContent = format(value);
      return;
    }
    const run = animate(shown.current, value, {
      duration: 0.18,
      ease: EASE_OUT,
      onUpdate: (at) => {
        shown.current = at;
        span.textContent = format(at);
      },
      onComplete: () => {
        shown.current = value;
        span.textContent = format(value);
      },
    });
    return () => run.stop();
  }, [value, format]);
  return (
    <span ref={node} className={className}>
      {first}
    </span>
  );
}

/**
 * The product's picture travels from the tile to its line, so the eye follows
 * the press to where it landed. Only where the sale column is on screen: on a
 * phone the sale is its own screen, and the row under the shelf counts up instead.
 */
export function flyToSale(from: Element, productId: string) {
  if (stillness()) return;
  const picture = from.querySelector(".pic, .qpic") ?? from;
  const start = picture.getBoundingClientRect();
  // The line is drawn by the render the add starts; it is there two frames on.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const line = document.querySelector(`[data-line="${CSS.escape(productId)}"]`);
      if (!line || !line.checkVisibility()) return;
      const end = line.getBoundingClientRect();
      const ghost = picture.cloneNode(true) as HTMLElement;
      ghost.className = "fly";
      Object.assign(ghost.style, { left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${start.height}px` });
      (from.closest(".tl") ?? document.body).appendChild(ghost);
      const dx = end.left + 32 - (start.left + start.width / 2);
      const dy = end.top + end.height / 2 - (start.top + start.height / 2);
      const flight = ghost.animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 0.9 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.16)`, opacity: 0 },
        ],
        { duration: 260, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
      flight.onfinish = () => ghost.remove();
      flight.oncancel = () => ghost.remove();
    }),
  );
}

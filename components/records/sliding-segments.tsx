"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type SlidingSegment<V extends string> = {
  value: V;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
};

/**
 * A few peers in one track, with the chosen one marked by a pill that slides
 * to it rather than jumping.
 *
 * The slide is the point: two or three options that read as one control are
 * easier to tell apart when the change between them is a movement than when
 * one fill disappears and another appears.
 */
export function SlidingSegments<V extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
}: {
  value: V;
  onValueChange: (value: V) => void;
  options: ReadonlyArray<SlidingSegment<V>>;
  ariaLabel: string;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const place = () => {
      const active = track.querySelector<HTMLElement>("[aria-checked='true']");
      setPill(active ? { left: active.offsetLeft, width: active.offsetWidth } : null);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(track);
    return () => observer.disconnect();
  }, [value, options.length]);

  return (
    <div ref={trackRef} role="radiogroup" aria-label={ariaLabel} className={cn("rec-seg", className)}>
      {pill ? (
        <i
          aria-hidden="true"
          className="rec-seg-pill"
          style={{ width: pill.width, transform: `translateX(${pill.left}px)` }}
        />
      ) : null}
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            className="rec-seg-item"
            onClick={() => onValueChange(option.value)}
          >
            {option.icon}
            {option.label}
            {typeof option.count === "number" ? <span className="rec-seg-n">{option.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

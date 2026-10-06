"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * OptionCard — one choice of a few, with a line on what it means.
 *
 * `role="radio"`: chosen = a 2px ink border and a 5px `--sel-fill` ring (G1).
 * A card with a badge ("Soon") is something the product does not do yet, so
 * it is disabled. OptionCardGroup is the `radiogroup` around them (the sheet's
 * `cards` field): a grid of `cols` (default 2), gap 10, with arrow keys moving
 * the choice and only the chosen card in the tab order.
 */
export type OptionCardProps = Omit<React.ComponentProps<"button">, "title"> & {
  checked: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
};

export function OptionCard({
  checked,
  title,
  description,
  badge,
  disabled,
  className,
  ...props
}: OptionCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      className={cn("cx-option", className)}
      {...props}
    >
      <span className="cx-option__body">
        <span className="cx-option__head">
          <span className="cx-option__title">{title}</span>
          {badge ? <span className="cx-option__badge">{badge}</span> : null}
        </span>
        {description ? <span className="cx-option__desc">{description}</span> : null}
      </span>
    </button>
  );
}

export type OptionCardOption<V extends string = string> = {
  value: V;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** A card with a badge is disabled ("Soon"). */
  badge?: string;
};

export type OptionCardGroupProps<V extends string = string> = Omit<
  React.ComponentProps<"div">,
  "onChange" | "defaultValue"
> & {
  options: ReadonlyArray<OptionCardOption<V>>;
  value: V | null;
  onValueChange?: (value: V) => void;
  cols?: number;
  /** Every card drawn as it stands and none can be picked (a person's own role). */
  disabled?: boolean;
};

export function OptionCardGroup<V extends string = string>({
  options,
  value,
  onValueChange,
  cols = 2,
  disabled = false,
  className,
  style,
  ...props
}: OptionCardGroupProps<V>) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = options.map((option) => !option.badge && !disabled);
  const current = options.findIndex((option) => option.value === value);
  const tabStop = current >= 0 ? current : enabled.indexOf(true);

  const move = (from: number, step: number) => {
    for (let i = 1; i <= options.length; i += 1) {
      const next = (from + step * i + options.length) % options.length;
      if (enabled[next]) {
        onValueChange?.(options[next].value);
        refs.current[next]?.focus();
        return;
      }
    }
  };

  return (
    <div
      role="radiogroup"
      className={cn("cx-options", className)}
      style={{ ...style, ["--cx-cols" as string]: cols }}
      {...props}
    >
      {options.map((option, index) => (
        <OptionCard
          key={option.value}
          ref={(node) => {
            refs.current[index] = node;
          }}
          checked={option.value === value}
          title={option.title}
          description={option.description}
          badge={option.badge}
          disabled={!enabled[index]}
          tabIndex={index === tabStop ? 0 : -1}
          onClick={() => onValueChange?.(option.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault();
              move(index, 1);
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault();
              move(index, -1);
            }
          }}
        />
      ))}
    </div>
  );
}

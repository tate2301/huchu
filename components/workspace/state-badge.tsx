import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * StateBadge — a judgement on a row or a record: a dot, a word, a soft ground.
 *
 * Crimson (`bad`) is money missing or failed, amber (`warn`) a difference or a
 * job not done, indigo (`info`) still running, green (`ok`) done. The normal
 * state is `hollow`, so a column is mostly calm and the exceptions stand out;
 * `pending` is the amber outline ("Not counted"); `gold` a quiet mark with an
 * amber dot; `neutral` a grey fact. Colour is never the only signal: the
 * badge always carries its word.
 */
export const STATE_TONES = ["ok", "warn", "bad", "info", "neutral", "hollow", "pending", "gold"] as const;
export type StateTone = (typeof STATE_TONES)[number];

export type StateBadgeProps = Omit<React.ComponentProps<"span">, "children"> & {
  tone: StateTone;
  /** The word. Required: a state is never colour alone. */
  children: string;
};

export function StateBadge({ tone, className, children, ...props }: StateBadgeProps) {
  return (
    <span className={cn("cx-state", `cx-state--${tone}`, className)} {...props}>
      {children}
    </span>
  );
}

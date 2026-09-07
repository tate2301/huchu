import type { ReactNode } from "react";

import type { LucideIcon } from "@corelithzw/ui/lib/icons";

/**
 * One row in the command bar, whatever kind of thing it stands for.
 *
 * A meeting, a person, a page and "collapse the sidebar" are the same shape
 * here on purpose: the bar's job is to be one keyboard-driven list, and a list
 * whose rows behave differently depending on what they are is a list you have
 * to look at rather than type through.
 */
export type CommandItem = {
  id: string;
  group: string;
  label: string;
  icon?: LucideIcon;
  /** A date chip, an avatar — drawn instead of the icon when present. */
  mark?: ReactNode;
  /** Quiet trailing words on the row: "In 10 minutes", an email address. */
  hint?: string | null;
  /** A status dot at the right edge. */
  dot?: "success" | "warn" | "danger" | null;
  /** What fills the right pane while this row is highlighted. */
  preview?: ReactNode;
  /** The button in the footer, and what Enter does. */
  primary?: { label: string; run: () => void };
  /** An extra footer button, for the second obvious thing. */
  secondary?: { label: string; run: () => void };
  /** Words that should match this row beyond its label. */
  keywords?: string;
};

export type CommandGroup = {
  id: string;
  label: string;
  items: CommandItem[];
};

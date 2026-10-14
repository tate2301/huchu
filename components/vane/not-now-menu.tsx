"use client";

import { MenuButton } from "@/components/core/menu";
import type { ButtonVariant } from "@/components/core";

/** The reasons Not now offers in one tap (the Muted board). */
export const NOT_NOW_REASONS = ["Not mine", "Already done", "Wrong", "Not now", "Something else"] as const;

/**
 * Not now: sets a card aside and asks why in one tap. The card goes to Muted
 * with the reason, which Vane reads before it raises that kind again. The X
 * on a card, or a labelled button in its drawer.
 */
export function NotNowMenu({
  onMute,
  labelled = false,
  variant = "quiet",
  describedBy,
}: {
  onMute: (reason: string) => void;
  /** A button that says "Not now", rather than the X. */
  labelled?: boolean;
  variant?: ButtonVariant;
  /** The card's headline, so a screen reader hears which card this sets aside. */
  describedBy?: string;
}) {
  const items = [
    { heading: "Why not now?" },
    ...NOT_NOW_REASONS.map((reason) => ({ key: reason, label: reason, onSelect: () => onMute(reason) })),
  ];
  return labelled ? (
    <MenuButton items={items} align="end" label="Why not now?" variant={variant} icon="x" iconEnd={undefined} aria-describedby={describedBy}>
      Not now
    </MenuButton>
  ) : (
    <MenuButton
      items={items}
      align="end"
      label="Why not now?"
      variant={variant}
      iconOnly
      icon="x"
      iconEnd={undefined}
      aria-label="Not now"
      aria-describedby={describedBy}
    />
  );
}

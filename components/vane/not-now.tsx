"use client";

import { MenuButton } from "@/components/core/menu";
import { MUTE_REASONS } from "@/lib/vane/reasons";

/**
 * Not now: asks why in one tap, then the card goes to Muted with the reason
 * (`POST /api/vane/items/[id]/mute`, a person's press). As the card's quiet
 * cross, or as a labelled button in its drawer.
 */
export function NotNow({
  onPick,
  labelled = false,
  busy = false,
}: {
  onPick: (reason: string) => void;
  labelled?: boolean;
  busy?: boolean;
}) {
  const items = [
    { heading: "Why not now?" },
    ...MUTE_REASONS.map((reason) => ({ key: reason, label: reason, onSelect: () => onPick(reason) })),
  ];
  return labelled ? (
    <MenuButton icon="x" items={items} label="Why not now?" align="start" busy={busy}>
      Not now
    </MenuButton>
  ) : (
    <MenuButton
      variant="quiet"
      iconOnly
      icon="x"
      iconEnd={undefined}
      aria-label="Not now"
      items={items}
      label="Why not now?"
      align="end"
      busy={busy}
    />
  );
}

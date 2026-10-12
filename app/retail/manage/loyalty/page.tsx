"use client";

import { SettingsFrame } from "@/components/settings-frame/settings-frame";

/**
 * Setup › Loyalty (W-48, board LoyaltySettings): what customers earn and
 * spend, the tiers and the rules, on the SettingsFrame, with the last 30
 * days off the points ledger in the aside. Owners change it; managers read it.
 */
export default function LoyaltySettingsPage() {
  return <SettingsFrame page="loyalty" slots={(values) => ({ last30: <LastThirtyDays values={values} /> })} />;
}

function LastThirtyDays({ values }: { values: Record<string, unknown> }) {
  const last30 = values.last30 as { lines?: string[] } | undefined;
  const lines = last30?.lines ?? [];
  if (lines.length === 0) return null;
  return (
    <ul>
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

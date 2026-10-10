import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { STATE_TONES, StateBadge } from "./state-badge";

const WORDS: Record<(typeof STATE_TONES)[number], string> = {
  ok: "Received",
  warn: "Over",
  bad: "Short",
  info: "Open",
  neutral: "Draft",
  hollow: "Balanced",
  pending: "Not counted",
  gold: "Gold",
};

describe("StateBadge", () => {
  it("has eight tones", () => {
    expect(STATE_TONES).toHaveLength(8);
  });

  it.each(STATE_TONES)("emits the %s tone class and its word", (tone) => {
    const html = renderToStaticMarkup(<StateBadge tone={tone}>{WORDS[tone]}</StateBadge>);
    expect(html).toContain(`class="cx-state cx-state--${tone}"`);
    // The word is a text node inside the badge, never colour alone.
    expect(html).toMatch(new RegExp(`>${WORDS[tone]}</span>$`));
  });

  it("emits exactly one tone class", () => {
    const html = renderToStaticMarkup(<StateBadge tone="pending">Not counted</StateBadge>);
    expect(html.match(/cx-state--/g)).toHaveLength(1);
  });
});

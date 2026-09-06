import { accentFor } from "@corelithzw/react";

import { chipToken, TOKEN_ATTRIBUTE } from "@/lib/crm/reference-dom";
import type { Reference, ReferenceKind } from "@/lib/crm/rich-text";

/**
 * What a reference looks like inside the editor.
 *
 * Built as DOM rather than JSX because it lives inside a `contenteditable`,
 * which React must not own — every keystroke would fight the reconciler for
 * the caret. The shape deliberately matches the renderer's chip, so what
 * somebody sees while writing is what the note looks like when it is read.
 */

/** One glyph per kind. Enough to tell a deal from the company behind it. */
const GLYPH: Record<ReferenceKind, string> = {
  user: "@",
  person: "@",
  company: "▪",
  lead: "✦",
  deal: "▲",
  site: "◆",
  quotation: "§",
  invoice: "§",
  receipt: "§",
  // Schools (S-4.5). A person is "@" whichever module they belong to; the
  // things get marks that distinguish them at a glance in a sentence.
  student: "@",
  guardian: "@",
  teacher: "@",
  class: "▤",
  subject: "❑",
  hostel: "⌂",
};

export function referenceChipElement(reference: Reference): HTMLElement {
  const chip = document.createElement("span");
  chip.setAttribute(TOKEN_ATTRIBUTE, chipToken(reference));
  chip.setAttribute("contenteditable", "false");
  chip.dataset.accent = accentFor(reference.label);
  chip.className =
    "mx-0.5 inline-flex select-none items-center gap-1 rounded-[var(--radius-sm)] " +
    "bg-[var(--accent-bg)] px-1.5 align-baseline text-[var(--accent-fg)]";

  const mark = document.createElement("span");
  mark.setAttribute("aria-hidden", "true");
  mark.className = "opacity-70";
  mark.textContent = GLYPH[reference.kind];

  const label = document.createElement("span");
  label.textContent = reference.label;

  chip.append(mark, label);
  return chip;
}

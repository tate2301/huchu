"use client";

import { useState } from "react";

/**
 * S-6.19 — an answer without ringing the office.
 *
 * The questions are the ones a school office actually fields, in the order they
 * are asked, and each answer says what the parent can do rather than how the
 * system works. "Why can't I see marks?" is answered with "the school releases
 * them once they are checked" — not with the words "publish window".
 */
const QUESTIONS: Array<{ q: string; a: string }> = [
  {
    q: "Why can't I see my child's marks?",
    a: "Marks appear once the school has checked them and released them. Until then there is nothing to read — nothing has been lost. If other parents in the class can see theirs, ring the office.",
  },
  {
    q: "The fees figure looks wrong.",
    a: "Open the bill and read the lines: tuition, levies, boarding and extras are billed separately, and a payment can take a day to be receipted. If a payment you made is not listed, bring the reference to the office.",
  },
  {
    q: "My child was marked away but they were at school.",
    a: "A register that has not been submitted yet is marked as such on the attendance screen and can still change. If it is submitted and wrong, tell the class teacher — they can correct it.",
  },
  {
    q: "How do I get a receipt or a statement?",
    a: "Both are on the Fees screen. A statement covers everything charged and paid; a receipt covers one payment. They download as PDFs you can keep or forward.",
  },
  {
    q: "I have two children here but only see one.",
    a: "Use the row of names at the top of the screen to switch, or open Profile to see all of them. If a child is missing, the office needs to link them to your account.",
  },
  {
    q: "Someone else uses this phone.",
    a: "Sign out from the Profile screen when you are finished. Signing out ends the session on this phone.",
  },
];

export function ParentHelpScreen() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="space-y-2">
      {QUESTIONS.map((item, index) => {
        const expanded = open === index;
        return (
          <div
            key={item.q}
            className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface)]"
          >
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : index)}
              aria-expanded={expanded}
              className="w-full p-4 text-left font-medium"
            >
              {item.q}
            </button>
            {expanded ? (
              <p className="border-t border-[var(--border-subtle)] p-4 text-sm text-[var(--text-muted)]">
                {item.a}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

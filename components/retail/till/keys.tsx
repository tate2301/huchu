"use client";

/**
 * The till's keys, said once: Help lists them and "?" shows them over the
 * sale. A key that does something on the sell screen is listed here, and
 * nowhere else.
 */

import { Fragment } from "react";

import { TillDialog } from "./parts";

export const TILL_KEYS: ReadonlyArray<{ keys: string[]; does: string }> = [
  { keys: ["/"], does: "Search, or scan into it" },
  { keys: ["3", "*"], does: "Before a code: three of it, or however many is typed" },
  { keys: ["Enter"], does: "Take the money once the total is right" },
  { keys: ["+", "−"], does: "One more, or one fewer, of the last line" },
  { keys: ["H"], does: "Hold the sale" },
  { keys: ["Shift", "Delete"], does: "Drop the sale; Undo is in the message that follows" },
  { keys: ["?"], does: "These keys" },
  { keys: ["Esc"], does: "Close what is open" },
  { keys: ["L"], does: "Lock the till" },
];

export function KeyList() {
  return (
    <dl className="attrs is-narrow">
      {TILL_KEYS.map((entry) => (
        <Fragment key={entry.does}>
          <dt className="keys">
            {entry.keys.map((key) => (
              <span key={key} className="kbd">
                {key}
              </span>
            ))}
          </dt>
          <dd>{entry.does}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export function KeySheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <TillDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Keys"
      description="For a till with a keyboard or a scanner."
      foot={
        <button type="button" className="btn" onClick={() => onOpenChange(false)}>
          Close
        </button>
      }
    >
      <KeyList />
    </TillDialog>
  );
}

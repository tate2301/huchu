"use client";

import * as React from "react";

import { Button } from "@/components/workspace/button";
import type { HandOverPanel } from "@/lib/workspace/sheet-kind";

/**
 * The hand-over panel (80-admin 5.5.4): when WhatsApp could not take an
 * invite or a PIN, the sheet's body becomes this — the sentence on
 * `--warn-soft`, then the link with Copy and the till PIN spaced to read
 * aloud. Shown once; nothing keeps them.
 */
export function HandOver({ panel }: { panel: HandOverPanel }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    if (!panel.link) return;
    try {
      await navigator.clipboard.writeText(panel.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section className="cx-sheet__section sf-handover" aria-live="polite">
      <p role="status" className="sf-handover__line">
        {panel.line}
      </p>
      {panel.link ? (
        <div className="cx-field">
          <span className="cx-label">Link</span>
          <div className="sf-handover__row">
            <span className="cx-read cx-read--mono sf-handover__link">{panel.link}</span>
            <Button size="field" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      ) : null}
      {panel.pin ? (
        <div className="cx-field">
          <span className="cx-label">Till PIN</span>
          <span className="cx-read cx-read--mono sf-handover__pin">{panel.pin.split("").join(" ")}</span>
        </div>
      ) : null}
    </section>
  );
}

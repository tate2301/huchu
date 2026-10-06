"use client";

import * as React from "react";

import { Loader2 } from "@/lib/icons";
import type { RecordBanner } from "@/lib/retail/record-kinds/types";

/**
 * A kind's own banner (5.6.3's shape): a record in some state says so under
 * the header — "Archived. Not on the till…" — with the one thing that undoes
 * it, for roles that may.
 */
export function KindBanner({
  banner,
  canAct,
  onAct,
}: {
  banner: RecordBanner;
  canAct: boolean;
  onAct: (action: NonNullable<RecordBanner["action"]>) => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const action = banner.action ?? null;

  const act = async () => {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      await onAct(action);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" className="cx-rf-banner cx-rf-banner--note">
      <span className="cx-rf-banner__text">
        <b>{banner.lead}</b> {banner.text}
        {error ? (
          <>
            {" "}
            <span className="cx-rf-banner__error">{error}</span>
          </>
        ) : null}
      </span>
      {action && canAct ? (
        <button type="button" className="cx-rf-banner__restore" onClick={act} disabled={busy} aria-busy={busy || undefined}>
          {busy ? <Loader2 aria-hidden="true" /> : null}
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

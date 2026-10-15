"use client";

import { Button, Pill } from "@/components/core";
import type { FormChange } from "@/lib/vane/form-changes";

/** One of Vane's changes as the builder holds it: waiting, or kept into this draft. */
export type HeldChange = FormChange & { id: string; kept: boolean };

/**
 * The builder's Vane tab (the PageVaneForm board): Read the answers for
 * changes asks Vane to read this form's answers (a job of kind write); each
 * change it finds comes with why and what it read. Keep puts one in the
 * person's draft of the form; Publish sends it to reps. Not now sets it
 * aside. Pure: the builder holds the draft and the changes.
 */
export function VaneFormChanges({
  changes,
  canEdit,
  reading,
  failed,
  onRead,
  onKeep,
  onNotNow,
}: {
  /** Null until Vane has read the answers. */
  changes: HeldChange[] | null;
  canEdit: boolean;
  reading: boolean;
  /** Why the last read wrote nothing, in a sentence. */
  failed: string | null;
  onRead: () => void;
  onKeep: (change: HeldChange) => void;
  onNotNow: (change: HeldChange) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ color: "var(--color-ink-2)" }}>
        Vane reads how this form was answered and the notes reps left, and proposes up to three changes. Kept changes join this form’s draft; reps see them when you
        publish.
      </span>
      {canEdit ? (
        <span>
          <Button size="sm" icon="suggestion" busy={reading} onClick={onRead}>
            {changes ? "Read them again" : "Read the answers for changes"}
          </Button>
        </span>
      ) : (
        <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>A manager keeps changes to the site-visit questions.</span>
      )}
      {failed ? (
        <span role="alert" style={{ fontSize: 12.5, color: "var(--color-danger)" }}>
          {failed}
        </span>
      ) : null}
      {changes && changes.length === 0 ? <p className="rb-note">Nothing in the answers says this form should change.</p> : null}
      {changes?.map((change) => (
        <div
          key={change.id}
          style={{
            padding: "12px 14px",
            border: "1px solid var(--color-line)",
            borderLeft: `3px solid ${change.kept ? "var(--color-success)" : "var(--color-accent)"}`,
            borderRadius: 8,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <span style={{ fontWeight: 600 }}>{change.title}</span>
          <span style={{ color: "var(--color-ink-2)" }}>{change.why}</span>
          <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>Read: {change.read}</span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {change.kept ? (
              <>
                <Pill tone="ok">Kept</Pill>
                <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>In your draft. Publish sends it to reps.</span>
              </>
            ) : canEdit ? (
              <>
                <Button size="sm" icon="x" onClick={() => onNotNow(change)}>
                  Not now
                </Button>
                <Button variant="primary" onClick={() => onKeep(change)}>
                  Keep
                </Button>
              </>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}

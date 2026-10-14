"use client";

import { Button, Pill } from "@/components/core";
import type { FormProposal } from "@/lib/build/form-changes";

/**
 * The builder's Vane tab (the PageVaneForm board): Vane's changes to this
 * form, from its answers, each with why and what it read. Keep puts one in
 * the person's draft of the form; Publish sends it to reps. Not now sets it
 * aside. Pure: the builder holds the draft.
 */
export function VaneFormChanges({
  proposals,
  kept,
  basis,
  canEdit,
  busy,
  onKeep,
  onNotNow,
}: {
  proposals: FormProposal[];
  /** Kept in this draft, not yet published. */
  kept: ReadonlySet<string>;
  basis: string | null;
  canEdit: boolean;
  busy: string | null;
  onKeep: (proposal: FormProposal) => void;
  onNotNow: (proposal: FormProposal) => void;
}) {
  if (proposals.length === 0) {
    return <p className="rb-note">Vane has no change to this form. It looks at the answers as visits come in, and proposes a change when they show one.</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ color: "var(--color-ink-2)" }}>
        {basis ? `${basis}. ` : ""}Kept changes join this form’s draft; reps see them when you publish.
      </span>
      {proposals.map((proposal) => {
        const done = proposal.status === "kept";
        const inDraft = kept.has(proposal.id);
        return (
          <div
            key={proposal.id}
            style={{
              padding: "12px 14px",
              border: "1px solid var(--color-line)",
              borderLeft: `3px solid ${done || inDraft ? "var(--color-success)" : "var(--color-accent)"}`,
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <span style={{ fontWeight: 600 }}>{proposal.headline}</span>
            <span style={{ color: "var(--color-ink-2)" }}>{proposal.reason}</span>
            <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>Read: {proposal.read}</span>
            {proposal.failed ? (
              <span role="alert" style={{ fontSize: 12.5, color: "var(--color-danger)" }}>
                {proposal.failed}
              </span>
            ) : null}
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {done ? (
                <Pill tone="ok">Kept</Pill>
              ) : inDraft ? (
                <>
                  <Pill tone="ok">Kept</Pill>
                  <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>In your draft. Publish sends it to reps.</span>
                </>
              ) : canEdit ? (
                <>
                  <Button size="sm" icon="x" disabled={busy !== null} onClick={() => onNotNow(proposal)}>
                    Not now
                  </Button>
                  <Button variant="primary" disabled={busy !== null} onClick={() => onKeep(proposal)}>
                    Keep
                  </Button>
                </>
              ) : (
                <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>A manager keeps changes to the site-visit questions.</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";

import { Button, Kit, VaneMark } from "@/components/core";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { FormChange } from "@/lib/vane/form-changes";

import { useVaneStatus } from "./use-vane";

/**
 * Vane's changes to a form, from its answers (the PageVaneForm board), in the
 * form's settings pane: asked for, each with the figures behind it, Not now
 * and Keep. Kept changes join the builder's draft; the person saves the form.
 */
export function VaneFormChanges({ questionSetId, onKeep }: { questionSetId: string; onKeep: (change: FormChange) => void }) {
  const status = useVaneStatus();
  const [shown, setShown] = React.useState<Array<FormChange & { kept?: true }> | null>(null);
  const read = useMutation({
    mutationFn: () => fetchJson<{ changes: FormChange[] }>("/api/vane/write/form-changes", { method: "POST", body: JSON.stringify({ questionSetId }) }),
    onSuccess: ({ changes }) => setShown(changes),
  });
  if (!status.data || status.data.paused) return null;

  return (
    <Kit className="vr" style={{ marginTop: "var(--space-16)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-8)" }}>
        <VaneMark size={16} />
        <b style={{ flex: 1, fontSize: "var(--text-13)" }}>Vane</b>
        <Button size="sm" busy={read.isPending} onClick={() => read.mutate()}>
          {shown ? "Read them again" : "Read the answers for changes"}
        </Button>
      </div>
      {read.error ? (
        <p role="alert" className="vr-none" style={{ color: "var(--color-danger)" }}>
          {getApiErrorMessage(read.error)}
        </p>
      ) : null}
      {shown && shown.length === 0 ? <p className="vr-none">Nothing in the answers says this form should change.</p> : null}
      {shown?.map((change, index) => (
        <article key={`${change.kind}-${index}`} className="vc" data-module="crm" aria-labelledby={`vane-form-${index}`}>
          <h3 id={`vane-form-${index}`}>{change.title}</h3>
          <p>{change.why}</p>
          <p className="vr-none">Read: {change.read}</p>
          {change.kept ? (
            <p className="vr-none">Kept: it is in the draft. Save the form to keep it.</p>
          ) : (
            <div className="vc-a">
              <Button size="sm" aria-describedby={`vane-form-${index}`} onClick={() => setShown((rows) => rows?.filter((_, at) => at !== index) ?? null)}>
                Not now
              </Button>
              <Button
                size="sm"
                variant="primary"
                icon="check"
                aria-describedby={`vane-form-${index}`}
                onClick={() => {
                  onKeep(change);
                  setShown((rows) => rows?.map((row, at) => (at === index ? { ...row, kept: true } : row)) ?? null);
                }}
              >
                Keep
              </Button>
            </div>
          )}
        </article>
      ))}
    </Kit>
  );
}

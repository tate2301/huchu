"use client";

import { useState } from "react";

import { Button } from "@corelithzw/ui/components/button";
import { runDocumentExport } from "@corelithzw/module-documents/export-client";
import { toast } from "@corelithzw/ui/components/use-toast";

/**
 * Print one of the school's documents.
 *
 * Iteration 5. The content is resolved on the server from the record id — this
 * sends a key and an id and nothing else. That is deliberate: a report card is
 * gated on the publish window and a class list is every child's guardian's phone
 * number, so a button that assembled its own payload would be a way around both
 * checks. Whatever comes back is what the school's own rules allowed.
 *
 * The refusal is shown rather than swallowed. "Results for this term are not
 * published" is the answer to why the button did nothing, and a silent no-op
 * sends somebody to the office to ask.
 */
export function PrintDocumentButton({
  sourceKey,
  recordId,
  filters,
  label = "Print",
  format = "pdf",
  variant = "outline",
  size = "sm",
}: {
  sourceKey: string;
  recordId?: string;
  filters?: Record<string, string>;
  label?: string;
  format?: "pdf" | "csv";
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "sm" | "default";
}) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await runDocumentExport({
        sourceKey,
        format,
        target: recordId ? "RECORD" : "LIST",
        recordId,
        filters,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Nothing was printed",
        description: error instanceof Error ? error.message : "The document could not be produced.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button type="button" variant={variant} size={size} disabled={busy} onClick={run}>
      {busy ? "Preparing…" : label}
    </Button>
  );
}

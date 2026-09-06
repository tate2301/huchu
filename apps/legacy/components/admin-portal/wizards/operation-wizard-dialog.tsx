"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { executeOperation } from "@/components/admin-portal/api";

type Props = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  module: string;
  action: string;
  actorEmail: string;
  companyId?: string;
  onCompleted?: (result: unknown) => void;
};

export function OperationWizardDialog({
  open,
  onOpenChange,
  module,
  action,
  actorEmail,
  companyId,
  onCompleted,
}: Props) {
  const draftKey = useMemo(() => `admin-wizard-draft:${module}.${action}:${companyId ?? "global"}`, [module, action, companyId]);
  const [payload, setPayload] = useState('{\n  "actor": ""\n}');
  const [status, setStatus] = useState("Draft");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const existing = window.localStorage.getItem(draftKey);
    if (existing) {
      setPayload(existing);
      setStatus("Draft restored");
      return;
    }

    if (companyId) {
      setPayload(`{\n  "companyId": "${companyId}",\n  "actor": "${actorEmail}"\n}`);
    } else {
      setPayload(`{\n  "actor": "${actorEmail}"\n}`);
    }
    setStatus("New draft");
  }, [open, draftKey, actorEmail, companyId]);

  const saveDraft = () => {
    window.localStorage.setItem(draftKey, payload);
    setStatus("Draft saved");
  };

  const clearDraft = () => {
    window.localStorage.removeItem(draftKey);
    setStatus("Draft cleared");
  };

  const run = async () => {
    setLoading(true);
    setStatus("Running...");
    try {
      const parsed = JSON.parse(payload);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const mutable = parsed as Record<string, unknown>;
        if (!mutable.actor) mutable.actor = actorEmail;
        if (companyId && !mutable.companyId) mutable.companyId = companyId;
      }

      const result = await executeOperation({ module, action, payload: parsed });
      setStatus("Completed");
      onCompleted?.(result);
      window.localStorage.removeItem(draftKey);
      onOpenChange(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{module}.{action}</DialogTitle>
          <DialogDescription>
            Wizard supports resume + draft save for safe step-by-step operation execution.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Payload JSON</Label>
          <Textarea value={payload} onChange={(event) => setPayload(event.target.value)} className="min-h-56 font-mono text-xs" />
          <p className="text-xs text-[var(--text-muted)]">{status}</p>
        </div>

        <DialogFooter className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={saveDraft} disabled={loading}>Save draft</Button>
          <Button variant="outline" onClick={clearDraft} disabled={loading}>Clear draft</Button>
          <Button onClick={run} disabled={loading}>{loading ? "Running..." : "Run operation"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

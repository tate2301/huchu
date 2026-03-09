"use client";

import { useEffect, useMemo, useState } from "react";
import { executeOperation } from "@/components/admin-portal/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  module: string;
  action: string;
  actorEmail: string;
  companyId?: string;
  onCompleted?: (result: unknown) => void;
};

type DraftState = {
  payload: string;
  argsText: string;
  mode: "payload" | "args";
  actor: string;
  targetCompanyId: string;
};

function buildSeedPayload(actor: string, companyId: string) {
  if (companyId) {
    return `{\n  "companyId": "${companyId}",\n  "actor": "${actor}"\n}`;
  }
  return `{\n  "actor": "${actor}"\n}`;
}

export function OperationWizardDialog({
  open,
  onOpenChange,
  module,
  action,
  actorEmail,
  companyId,
  onCompleted,
}: Props) {
  const draftKey = useMemo(
    () => `admin-wizard-draft:${module}.${action}:${companyId ?? "global"}`,
    [module, action, companyId],
  );
  const [payload, setPayload] = useState('{\n  "actor": ""\n}');
  const [argsText, setArgsText] = useState("[]");
  const [mode, setMode] = useState<"payload" | "args">("payload");
  const [actor, setActor] = useState(actorEmail);
  const [targetCompanyId, setTargetCompanyId] = useState(companyId ?? "");
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState("Draft");
  const [loading, setLoading] = useState(false);

  const activeEditor = mode === "payload" ? payload : argsText;

  const validateCurrentInput = () => {
    try {
      const parsed = JSON.parse(activeEditor);
      if (mode === "args" && !Array.isArray(parsed)) {
        throw new Error("Args must be a JSON array.");
      }
      if (mode === "payload" && (!parsed || typeof parsed !== "object" || Array.isArray(parsed))) {
        throw new Error("Payload must be a JSON object.");
      }
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Invalid JSON");
      return false;
    }
  };

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setActor(actorEmail);
    setTargetCompanyId(companyId ?? "");
    setMode("payload");
    setArgsText("[]");

    const existingRaw = window.localStorage.getItem(draftKey);
    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw) as Partial<DraftState>;
        if (existing.payload) setPayload(existing.payload);
        if (existing.argsText) setArgsText(existing.argsText);
        if (existing.mode) setMode(existing.mode);
        if (existing.actor) setActor(existing.actor);
        if (typeof existing.targetCompanyId === "string") setTargetCompanyId(existing.targetCompanyId);
        setStatus("Draft restored");
        return;
      } catch {
        setPayload(existingRaw);
        setStatus("Legacy draft restored");
        return;
      }
    }

    setPayload(buildSeedPayload(actorEmail, companyId ?? ""));
    setStatus("New draft");
  }, [open, draftKey, actorEmail, companyId]);

  const saveDraft = () => {
    const draft: DraftState = {
      payload,
      argsText,
      mode,
      actor,
      targetCompanyId,
    };
    window.localStorage.setItem(draftKey, JSON.stringify(draft));
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
      if (!validateCurrentInput()) {
        setLoading(false);
        return;
      }

      let result: unknown;
      if (mode === "args") {
        const parsedArgs = JSON.parse(argsText);
        result = await executeOperation({ module, action, args: parsedArgs });
      } else {
        const parsedPayload = JSON.parse(payload);
        if (parsedPayload && typeof parsedPayload === "object" && !Array.isArray(parsedPayload)) {
          const mutable = parsedPayload as Record<string, unknown>;
          if (!mutable.actor) mutable.actor = actor || actorEmail;
          if (targetCompanyId && !mutable.companyId) mutable.companyId = targetCompanyId;
        }
        result = await executeOperation({ module, action, payload: parsedPayload });
      }

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
            Guided 3-step execution flow designed for support teams.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          {["Details", "Input", "Review"].map((step, index) => (
            <Badge key={step} variant={index === stepIndex ? "default" : "outline"}>
              {index + 1}. {step}
            </Badge>
          ))}
        </div>

        {stepIndex === 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Run mode</Label>
                <Select value={mode} onValueChange={(value: "payload" | "args") => setMode(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="payload">Payload object</SelectItem>
                    <SelectItem value="args">Args array</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Actor email</Label>
                <Input
                  value={actor}
                  onChange={(event) => setActor(event.target.value)}
                  placeholder="support@example.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Company scope (optional)</Label>
              <Input
                value={targetCompanyId}
                onChange={(event) => setTargetCompanyId(event.target.value)}
                placeholder="UUID for company-scoped actions"
              />
            </div>
          </div>
        ) : null}

        {stepIndex === 1 ? (
          <div className="space-y-2">
            <Label>{mode === "payload" ? "Payload JSON object" : "Args JSON array"}</Label>
            <Textarea
              value={mode === "payload" ? payload : argsText}
              onChange={(event) => {
                if (mode === "payload") {
                  setPayload(event.target.value);
                } else {
                  setArgsText(event.target.value);
                }
              }}
              className="min-h-56 font-mono text-xs"
            />
          </div>
        ) : null}

        {stepIndex === 2 ? (
          <div className="space-y-2 rounded-md border bg-[var(--surface-muted)] p-3">
            <p className="text-sm"><span className="font-semibold">Operation:</span> {module}.{action}</p>
            <p className="text-sm"><span className="font-semibold">Mode:</span> {mode}</p>
            <p className="text-sm"><span className="font-semibold">Actor:</span> {actor || actorEmail}</p>
            <p className="text-sm"><span className="font-semibold">Company:</span> {targetCompanyId || "Global scope"}</p>
            <p className="font-mono text-xs text-[var(--text-muted)]">Input size: {activeEditor.length} chars</p>
          </div>
        ) : null}

        <p className="text-xs text-[var(--text-muted)]">{status}</p>

        <DialogFooter className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={saveDraft} disabled={loading}>Save draft</Button>
          <Button variant="outline" onClick={clearDraft} disabled={loading}>Clear draft</Button>
          <Button
            variant="outline"
            onClick={() => setStepIndex((value) => Math.max(0, value - 1))}
            disabled={loading || stepIndex === 0}
          >
            Back
          </Button>
          {stepIndex < 2 ? (
            <Button
              onClick={() => {
                if (stepIndex === 1 && !validateCurrentInput()) return;
                setStepIndex((value) => Math.min(2, value + 1));
              }}
              disabled={loading}
            >
              Next
            </Button>
          ) : (
            <Button onClick={run} disabled={loading}>{loading ? "Running..." : "Run operation"}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

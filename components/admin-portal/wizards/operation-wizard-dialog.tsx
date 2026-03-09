"use client";

import { useEffect, useMemo, useState } from "react";
import { executeOperation } from "@/components/admin-portal/api";
import type { OperationManifest } from "@/components/admin-portal/types";
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
  manifest: OperationManifest;
  modules?: string[];
  onCompleted?: (result: unknown) => void;
};

type DraftState = {
  module: string;
  action: string;
  payload: string;
  argsText: string;
  mode: "payload" | "args";
  actor: string;
  targetCompanyId: string;
};

const WIZARD_STEPS = ["Details", "Input", "Review", "Result"] as const;

function buildDefaultPayload(actor: string, companyId?: string) {
  const seedPayload = companyId ? { companyId, actor } : { actor };
  return JSON.stringify(seedPayload, null, 2);
}

function getDefaultAction(manifest: OperationManifest, module: string) {
  return manifest[module]?.[0] ?? "";
}

export function OperationWizardDialog({
  open,
  onOpenChange,
  module: initialModule,
  action: initialAction,
  actorEmail,
  companyId,
  manifest,
  modules,
  onCompleted,
}: Props) {
  const availableModules = useMemo(
    () => Object.keys(manifest).filter((item) => (modules ? modules.includes(item) : true)),
    [manifest, modules],
  );
  const [module, setModule] = useState(initialModule || availableModules[0] || "");
  const [action, setAction] = useState(initialAction || "");
  const actionOptions = useMemo(() => manifest[module] ?? [], [manifest, module]);
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
      if (error instanceof Error) {
        setStatus(`Invalid JSON: ${error.message}`);
      } else {
        setStatus("Invalid JSON syntax - check for missing commas or quotes.");
      }
      return false;
    }
  };

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    const defaultModule = initialModule || availableModules[0] || "";
    const defaultAction = initialAction || getDefaultAction(manifest, defaultModule);
    setModule(defaultModule);
    setAction(defaultAction);
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
        if (typeof existing.module === "string") setModule(existing.module);
        if (typeof existing.action === "string") setAction(existing.action);
        setStatus("Draft restored");
        return;
      } catch {
        setPayload(existingRaw);
        setStatus("Legacy draft restored");
        return;
      }
    }

    setPayload(buildDefaultPayload(actorEmail, companyId ?? ""));
    setStatus("New draft");
  }, [open, draftKey, actorEmail, companyId, initialModule, initialAction, availableModules, manifest]);

  const saveDraft = () => {
    const draft: DraftState = {
      module,
      action,
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
      setStepIndex(3);
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
          {WIZARD_STEPS.map((step, index) => (
            <Badge key={step} variant={index === stepIndex ? "default" : "outline"}>
              {index + 1}. {step}
            </Badge>
          ))}
        </div>

        {stepIndex === 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="admin-operation-module">Module</Label>
                <Select
                  value={module}
                  onValueChange={(value) => {
                    setModule(value);
                    setAction(getDefaultAction(manifest, value));
                  }}
                >
                  <SelectTrigger id="admin-operation-module"><SelectValue placeholder="Select module" /></SelectTrigger>
                  <SelectContent>
                    {availableModules.map((item) => (
                      <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-operation-action">Action</Label>
                <Select value={action} onValueChange={setAction}>
                  <SelectTrigger id="admin-operation-action"><SelectValue placeholder="Select action" /></SelectTrigger>
                  <SelectContent>
                    {actionOptions.map((item) => (
                      <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="admin-operation-run-mode">Run mode</Label>
                <Select value={mode} onValueChange={(value: "payload" | "args") => setMode(value)}>
                  <SelectTrigger id="admin-operation-run-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="payload">Payload object</SelectItem>
                    <SelectItem value="args">Args array</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-operation-actor">Actor email</Label>
                <Input
                  id="admin-operation-actor"
                  value={actor}
                  onChange={(event) => setActor(event.target.value)}
                  placeholder="support@example.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-operation-company-scope">Company scope (optional)</Label>
              <Input
                id="admin-operation-company-scope"
                value={targetCompanyId}
                onChange={(event) => setTargetCompanyId(event.target.value)}
                placeholder="UUID for company-scoped actions"
              />
            </div>
          </div>
        ) : null}

        {stepIndex === 1 ? (
          <div className="space-y-2">
            <Label htmlFor="admin-operation-json-input">
              {mode === "payload" ? "Payload JSON object" : "Args JSON array"}
            </Label>
            <Textarea
              id="admin-operation-json-input"
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

        {stepIndex === 3 ? (
          <div className="space-y-2 rounded-md border bg-[var(--surface-muted)] p-3">
            <p className="text-sm font-semibold">Operation completed</p>
            <p className="text-sm text-[var(--text-muted)]">
              Review status above, then close this wizard or go back to run another operation.
            </p>
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
                if (!module || !action) {
                  setStatus("Required: choose a module and action to continue.");
                  return;
                }
                if (stepIndex === 1 && !validateCurrentInput()) return;
                setStepIndex((value) => Math.min(2, value + 1));
              }}
              disabled={loading}
            >
              Next
            </Button>
          ) : null}
          {stepIndex === 2 ? (
            <Button onClick={run} disabled={loading || !module || !action}>{loading ? "Running..." : "Run operation"}</Button>
          ) : null}
          {stepIndex === 3 ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

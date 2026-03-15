"use client";

import type { ComponentProps, ReactNode } from "react";
import { useMemo, useState } from "react";
import type {
  AuditEventRecord,
  ContractEvaluationResult,
  HealthIncidentRecord,
  RunbookDefinitionRecord,
} from "@/scripts/platform/types";
import type { SearchableOption } from "@/app/gold/types";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type { CompanyWorkspace } from "@/components/admin-portal/types";
import { executeOperation } from "@/components/admin-portal/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ButtonVariant = ComponentProps<typeof Button>["variant"];
type ButtonSize = ComponentProps<typeof Button>["size"];

type TriggerProps = {
  triggerLabel: string;
  buttonVariant?: ButtonVariant;
  buttonSize?: ButtonSize;
  disabled?: boolean;
};

function buildCompanyOptions(companies: CompanyWorkspace[]): SearchableOption[] {
  return companies.map((company) => ({
    value: company.id,
    label: company.name,
    description: company.status ?? "Workspace",
    meta: company.slug ?? company.id,
    badgeVariant: company.status === "ACTIVE" ? "secondary" : "outline",
  }));
}

function DialogScaffold({
  title,
  description,
  error,
  footer,
  children,
}: {
  title: string;
  description: string;
  error?: string | null;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <p className="text-sm text-[var(--text-muted)]">{description}</p>
      </DialogHeader>
      <div className="space-y-4">
        {children}
        {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </div>
      <DialogFooter>{footer}</DialogFooter>
    </>
  );
}

function ConfirmDialog({
  title,
  description,
  actionLabel,
  onConfirm,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
  danger = false,
  disabled = false,
  children,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onConfirm: (reason: string) => Promise<void>;
  danger?: boolean;
  children?: ReactNode;
} & TriggerProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await onConfirm(reason);
      setOpen(false);
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button size={buttonSize} variant={buttonVariant} disabled={disabled} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogScaffold
            title={title}
            description={description}
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Cancel</Button>
                <Button variant={danger ? "destructive" : "default"} onClick={run} disabled={running}>
                  {running ? "Working..." : actionLabel}
                </Button>
              </>
            }
          >
            {children}
            <div className="space-y-1">
              <Label>Reason</Label>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Add context for the audit trail" />
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RemediationDialog({
  actorEmail,
  incident,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  incident: HealthIncidentRecord;
  onCompleted?: () => void;
} & TriggerProps) {
  return (
    <ConfirmDialog
      title="Trigger remediation"
      description={`Launch the remediation workflow for ${incident.companyName ?? incident.companyId} on ${incident.metricKey}.`}
      actionLabel="Trigger remediation"
      triggerLabel={triggerLabel}
      buttonVariant={buttonVariant}
      buttonSize={buttonSize}
      onConfirm={async (reason) => {
        await executeOperation({
          module: "health",
          action: "triggerRemediation",
          payload: { incidentId: incident.id, actor: actorEmail, reason },
        });
        onCompleted?.();
      }}
    >
      <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{incident.status}</Badge>
          <Badge variant="secondary">{incident.riskLevel}</Badge>
        </div>
        <p className="mt-2 font-semibold">{incident.metricKey}</p>
        <p className="mt-1 text-[var(--text-muted)]">{incident.message}</p>
      </div>
    </ConfirmDialog>
  );
}

export function ContractEnforceDialog({
  actorEmail,
  evaluation,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  evaluation: ContractEvaluationResult;
  onCompleted?: () => void;
} & TriggerProps) {
  return (
    <ConfirmDialog
      title="Enforce contract state"
      description={`Apply the recommended contract posture for ${evaluation.companyName}.`}
      actionLabel="Enforce contract"
      triggerLabel={triggerLabel}
      buttonVariant={buttonVariant}
      buttonSize={buttonSize}
      danger={evaluation.currentState !== evaluation.recommendedState}
      onConfirm={async (reason) => {
        await executeOperation({
          module: "contract",
          action: "enforce",
          payload: { companyId: evaluation.companyId, actor: actorEmail, reason },
        });
        onCompleted?.();
      }}
    >
      <div className="grid grid-cols-1 gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm md:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Current</p>
          <p className="mt-1 font-semibold">{evaluation.currentState}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Recommended</p>
          <p className="mt-1 font-semibold">{evaluation.recommendedState}</p>
        </div>
      </div>
    </ConfirmDialog>
  );
}

export function ContractOverrideDialog({
  actorEmail,
  evaluation,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  evaluation: ContractEvaluationResult;
  onCompleted?: () => void;
} & TriggerProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await executeOperation({
        module: "contract",
        action: "override",
        payload: {
          companyId: evaluation.companyId,
          actor: actorEmail,
          reason,
          expiresAt: expiresAt || undefined,
        },
      });
      setOpen(false);
      setReason("");
      setExpiresAt("");
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to override contract");
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button size={buttonSize} variant={buttonVariant} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogScaffold
            title="Override contract state"
            description={`Apply a temporary manual contract state for ${evaluation.companyName}.`}
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Cancel</Button>
                <Button onClick={run} disabled={running || !reason.trim()}>
                  {running ? "Saving..." : "Apply override"}
                </Button>
              </>
            }
          >
            <div className="space-y-1">
                <Label>Expires at</Label>
                <Input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this override necessary?" />
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RunbookExecuteDialog({
  actorEmail,
  runbook,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  runbook: RunbookDefinitionRecord;
  onCompleted?: () => void;
} & TriggerProps) {
  const [open, setOpen] = useState(false);
  const [dryRun, setDryRun] = useState("true");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await executeOperation({
        module: "runbook",
        action: "execute",
        payload: { runbookId: runbook.id, actor: actorEmail, dryRun: dryRun === "true" },
      });
      setOpen(false);
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute runbook");
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button size={buttonSize} variant={buttonVariant} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogScaffold
            title="Execute runbook"
            description={`Run ${runbook.name} with explicit dry-run control.`}
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Cancel</Button>
                <Button onClick={run} disabled={running}>
                  {running ? "Launching..." : "Execute"}
                </Button>
              </>
            }
          >
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm">
              <p className="font-semibold">{runbook.name}</p>
              <p className="mt-1 text-[var(--text-muted)]">{runbook.actionType}</p>
            </div>
            <div className="space-y-1">
              <Label>Execution mode</Label>
              <Select value={dryRun} onValueChange={(value) => setDryRun(value as "true" | "false")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Dry run</SelectItem>
                  <SelectItem value="false">Live execution</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RunbookEnabledDialog({
  actorEmail,
  runbook,
  enabled,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  runbook: RunbookDefinitionRecord;
  enabled: boolean;
  onCompleted?: () => void;
} & TriggerProps) {
  return (
    <ConfirmDialog
      title={enabled ? "Enable runbook" : "Disable runbook"}
      description={`${enabled ? "Enable" : "Disable"} ${runbook.name} for future use.`}
      actionLabel={enabled ? "Enable runbook" : "Disable runbook"}
      triggerLabel={triggerLabel}
      buttonVariant={buttonVariant}
      buttonSize={buttonSize}
      danger={!enabled}
      onConfirm={async () => {
        await executeOperation({
          module: "runbook",
          action: "setEnabled",
          args: [runbook.id, enabled, actorEmail],
        });
        onCompleted?.();
      }}
    />
  );
}

export function RunbookUpsertDialog({
  actorEmail,
  companies,
  fixedCompanyId,
  runbook,
  onCompleted,
  triggerLabel,
  buttonVariant = "default",
  buttonSize = "sm",
}: {
  actorEmail: string;
  companies: CompanyWorkspace[];
  fixedCompanyId?: string;
  runbook?: RunbookDefinitionRecord;
  onCompleted?: () => void;
} & TriggerProps) {
  const companyOptions = useMemo(() => buildCompanyOptions(companies), [companies]);
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(runbook?.companyId ?? fixedCompanyId ?? "");
  const [name, setName] = useState(runbook?.name ?? "");
  const [actionType, setActionType] = useState(runbook?.actionType ?? "");
  const [schedule, setSchedule] = useState(runbook?.schedule ?? "");
  const [riskLevel, setRiskLevel] = useState(runbook?.riskLevel ?? "MEDIUM");
  const [enabled, setEnabled] = useState(runbook?.enabled ? "true" : "false");
  const [inputJson, setInputJson] = useState(runbook?.inputJson ?? "");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const resolvedCompanyId = fixedCompanyId ?? companyId ?? undefined;
      await executeOperation({
        module: "runbook",
        action: "upsertDefinition",
        payload: {
          id: runbook?.id,
          name,
          companyId: resolvedCompanyId,
          actionType,
          schedule: schedule || undefined,
          enabled: enabled === "true",
          riskLevel,
          inputJson: inputJson || undefined,
          createdBy: actorEmail,
        },
      });
      setOpen(false);
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save runbook");
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button size={buttonSize} variant={buttonVariant} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogScaffold
            title={runbook ? "Edit runbook" : "Create runbook"}
            description="Capture automation intent, target scope, and default input in one typed definition."
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Cancel</Button>
                <Button onClick={run} disabled={running || !name.trim() || !actionType.trim()}>
                  {running ? "Saving..." : runbook ? "Save runbook" : "Create runbook"}
                </Button>
              </>
            }
          >
            {!fixedCompanyId ? (
              <SearchableSelect
                label="Workspace scope"
                value={companyId}
                options={companyOptions}
                placeholder="Optional workspace scope"
                searchPlaceholder="Search workspace"
                onValueChange={setCompanyId}
              />
            ) : null}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Action type</Label>
                <Input value={actionType} onChange={(event) => setActionType(event.target.value)} placeholder="subscription.recompute" />
              </div>
              <div className="space-y-1">
                <Label>Schedule</Label>
                <Input value={schedule} onChange={(event) => setSchedule(event.target.value)} placeholder="0 0 * * *" />
              </div>
              <div className="space-y-1">
                <Label>Risk level</Label>
                <Select value={riskLevel} onValueChange={(value) => setRiskLevel(value as "LOW" | "MEDIUM" | "HIGH")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Default state</Label>
                <Select value={enabled} onValueChange={(value) => setEnabled(value as "true" | "false")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Input JSON</Label>
              <Textarea value={inputJson} onChange={(event) => setInputJson(event.target.value)} placeholder='{"companyId":"..."}' rows={6} />
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AuditNoteDialog({
  actorEmail,
  companies,
  fixedCompanyId,
  fixedCompanyName,
  onCompleted,
  triggerLabel,
  buttonVariant = "default",
  buttonSize = "sm",
}: {
  actorEmail: string;
  companies: CompanyWorkspace[];
  fixedCompanyId?: string;
  fixedCompanyName?: string;
  onCompleted?: () => void;
} & TriggerProps) {
  const companyOptions = useMemo(() => buildCompanyOptions(companies), [companies]);
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(fixedCompanyId ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await executeOperation({
        module: "audit",
        action: "addNote",
        payload: { actor: actorEmail, companyId: fixedCompanyId ?? companyId, message },
      });
      setOpen(false);
      setMessage("");
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add audit note");
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button size={buttonSize} variant={buttonVariant} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogScaffold
            title="Add audit note"
            description={`Attach human context${fixedCompanyName ? ` for ${fixedCompanyName}` : ""} without leaving the operator workflow.`}
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Cancel</Button>
                <Button onClick={run} disabled={running || !(fixedCompanyId ?? companyId) || !message.trim()}>
                  {running ? "Saving..." : "Add note"}
                </Button>
              </>
            }
          >
            {!fixedCompanyId ? (
              <SearchableSelect
                label="Workspace"
                value={companyId}
                options={companyOptions}
                placeholder="Choose workspace"
                searchPlaceholder="Search workspace"
                onValueChange={setCompanyId}
              />
            ) : null}
            <div className="space-y-1">
              <Label>Note</Label>
              <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Describe what happened and why it matters." rows={5} />
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AuditVerifyDialog({
  fixedCompanyId,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  fixedCompanyId?: string;
  onCompleted?: () => void;
} & TriggerProps) {
  const [open, setOpen] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const result = await executeOperation({
        module: "audit",
        action: "verifyChain",
        args: fixedCompanyId ? [fixedCompanyId] : [],
      });
      setResultMessage(result.message ?? "Audit chain verified");
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify audit chain");
      setResultMessage(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button size={buttonSize} variant={buttonVariant} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogScaffold
            title="Verify audit chain"
            description="Recompute the integrity chain and confirm the ledger has not drifted."
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Close</Button>
                <Button onClick={run} disabled={running}>
                  {running ? "Verifying..." : "Verify chain"}
                </Button>
              </>
            }
          >
            {resultMessage ? (
              <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm">
                {resultMessage}
              </div>
            ) : null}
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AuditExportDialog({
  fixedCompanyId,
  events,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  fixedCompanyId?: string;
  events: AuditEventRecord[];
  onCompleted?: () => void;
} & TriggerProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState("json");
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [exported, setExported] = useState<{ count: number; content: string; format: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const knownActors = useMemo(
    () => Array.from(new Set(events.map((event) => event.actor).filter((value): value is string => Boolean(value)))).slice(0, 8),
    [events],
  );

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const result = await executeOperation({
        module: "audit",
        action: "export",
        payload: {
          companyId: fixedCompanyId,
          actor: actor || undefined,
          action: action || undefined,
          format,
        },
      });
      setExported(result);
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export audit log");
      setExported(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button size={buttonSize} variant={buttonVariant} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogScaffold
            title="Export audit log"
            description="Generate a filtered JSON or CSV export for operator review or external evidence."
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Close</Button>
                <Button onClick={run} disabled={running}>
                  {running ? "Exporting..." : "Generate export"}
                </Button>
              </>
            }
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Format</Label>
                <Select value={format} onValueChange={(value) => setFormat(value as "json" | "csv")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Action filter</Label>
                <Input value={action} onChange={(event) => setAction(event.target.value)} placeholder="Optional action" />
              </div>
              <div className="space-y-1">
                <Label>Actor filter</Label>
                <Input value={actor} onChange={(event) => setActor(event.target.value)} list="audit-known-actors" placeholder="Optional actor" />
                <datalist id="audit-known-actors">
                  {knownActors.map((knownActor) => (
                    <option key={knownActor} value={knownActor} />
                  ))}
                </datalist>
              </div>
            </div>
            {exported ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline">{exported.format.toUpperCase()}</Badge>
                  <span className="text-[var(--text-muted)]">{exported.count} records exported</span>
                </div>
                <Textarea readOnly value={exported.content} rows={12} />
              </div>
            ) : null}
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import type { ComponentProps, ReactNode } from "react";
import { useMemo, useState } from "react";
import type { AdminSummary, SiteSummary, SupportAccessRequestRecord, SupportSessionRecord, UserSummary } from "@/scripts/platform/types";
import type { SearchableOption } from "@/app/gold/types";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type { CompanyWorkspace } from "@/components/admin-portal/types";
import { executeOperation } from "@/components/admin-portal/api";
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

function buildCompanyOptions(companies: CompanyWorkspace[]): SearchableOption[] {
  return companies.map((company) => ({
    value: company.id,
    label: company.name,
    description: company.status ?? "Workspace",
    meta: company.slug ?? company.id,
    badgeVariant: company.status === "ACTIVE" ? "secondary" : "outline",
  }));
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
              <Label>Reason (optional)</Label>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Add audit context for this action" />
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CreateAdminDialog({
  actorEmail,
  companies,
  fixedCompanyId,
  onCompleted,
  triggerLabel,
  buttonVariant = "default",
  buttonSize = "sm",
}: {
  actorEmail: string;
  companies: CompanyWorkspace[];
  fixedCompanyId?: string;
  onCompleted?: () => void;
} & TriggerProps) {
  const companyOptions = useMemo(() => buildCompanyOptions(companies), [companies]);
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(fixedCompanyId ?? "");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("SUPERADMIN");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await executeOperation({
        module: "admin",
        action: "create",
        payload: { actor: actorEmail, companyId: fixedCompanyId ?? companyId, email, name, password, role },
      });
      setOpen(false);
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create admin");
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
            title="Create admin"
            description="Create a company-scoped superadmin or manager with clear identity ownership."
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Cancel</Button>
                <Button onClick={run} disabled={running || !(fixedCompanyId ?? companyId) || !email || !name || password.length < 8}>
                  {running ? "Creating..." : "Create admin"}
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
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SUPERADMIN">Superadmin</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CreateUserDialog({
  actorEmail,
  companies,
  fixedCompanyId,
  onCompleted,
  triggerLabel,
  buttonVariant = "default",
  buttonSize = "sm",
}: {
  actorEmail: string;
  companies: CompanyWorkspace[];
  fixedCompanyId?: string;
  onCompleted?: () => void;
} & TriggerProps) {
  const companyOptions = useMemo(() => buildCompanyOptions(companies), [companies]);
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(fixedCompanyId ?? "");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("CLERK");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await executeOperation({
        module: "user",
        action: "create",
        payload: { actor: actorEmail, companyId: fixedCompanyId ?? companyId, email, name, password, role },
      });
      setOpen(false);
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
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
            title="Create user"
            description="Create a manager or clerk account with autocomplete-based workspace targeting."
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Cancel</Button>
                <Button onClick={run} disabled={running || !(fixedCompanyId ?? companyId) || !email || !name || password.length < 8}>
                  {running ? "Creating..." : "Create user"}
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
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    <SelectItem value="CLERK">Clerk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AdminStatusDialog({
  actorEmail,
  admin,
  activate,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  admin: AdminSummary;
  activate: boolean;
  onCompleted?: () => void;
} & TriggerProps) {
  return (
    <ConfirmDialog
      title={activate ? "Activate admin" : "Deactivate admin"}
      description={`${activate ? "Restore" : "Pause"} ${admin.name} (${admin.email}) for ${admin.companyName ?? "this workspace"}.`}
      actionLabel={activate ? "Activate admin" : "Deactivate admin"}
      triggerLabel={triggerLabel}
      buttonVariant={buttonVariant}
      buttonSize={buttonSize}
      danger={!activate}
      onConfirm={async (reason) => {
        await executeOperation({
          module: "admin",
          action: activate ? "activate" : "deactivate",
          payload: { actor: actorEmail, userId: admin.id, reason },
        });
        onCompleted?.();
      }}
    />
  );
}

export function UserStatusDialog({
  actorEmail,
  user,
  activate,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  user: UserSummary;
  activate: boolean;
  onCompleted?: () => void;
} & TriggerProps) {
  return (
    <ConfirmDialog
      title={activate ? "Activate user" : "Deactivate user"}
      description={`${activate ? "Restore" : "Pause"} ${user.name} (${user.email}) for ${user.companyName ?? "this workspace"}.`}
      actionLabel={activate ? "Activate user" : "Deactivate user"}
      triggerLabel={triggerLabel}
      buttonVariant={buttonVariant}
      buttonSize={buttonSize}
      danger={!activate}
      onConfirm={async (reason) => {
        await executeOperation({
          module: "user",
          action: activate ? "activate" : "deactivate",
          payload: { actor: actorEmail, userId: user.id, reason },
        });
        onCompleted?.();
      }}
    />
  );
}

export function PasswordResetDialog({
  actorEmail,
  subject,
  kind,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  subject: AdminSummary | UserSummary;
  kind: "admin" | "user";
  onCompleted?: () => void;
} & TriggerProps) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await executeOperation({
        module: kind,
        action: "resetPassword",
        payload: {
          actor: actorEmail,
          userId: subject.id,
          newPassword: password,
          reason,
        },
      });
      setOpen(false);
      setPassword("");
      setReason("");
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
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
            title={`Reset ${kind} password`}
            description={`Set a new password for ${subject.name} (${subject.email}).`}
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Cancel</Button>
                <Button onClick={run} disabled={running || password.length < 8}>
                  {running ? "Resetting..." : "Reset password"}
                </Button>
              </>
            }
          >
            <div className="space-y-1">
              <Label>New password</Label>
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Reason (optional)</Label>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Add audit context for this reset" />
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function UserRoleDialog({
  actorEmail,
  user,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  user: UserSummary;
  onCompleted?: () => void;
} & TriggerProps) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(user.role === "SUPERADMIN" ? "MANAGER" : user.role);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await executeOperation({
        module: "user",
        action: "changeRole",
        payload: { actor: actorEmail, userId: user.id, role, reason },
      });
      setOpen(false);
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change role");
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
            title="Change user role"
            description={`Update ${user.name}'s role for ${user.companyName ?? "this workspace"}.`}
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Cancel</Button>
                <Button onClick={run} disabled={running}>
                  {running ? "Saving..." : "Save role"}
                </Button>
              </>
            }
          >
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="CLERK">Clerk</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reason (optional)</Label>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is the role changing?" />
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SupportRequestDialog({
  actorEmail,
  companies,
  fixedCompanyId,
  onCompleted,
  triggerLabel,
  buttonVariant = "default",
  buttonSize = "sm",
}: {
  actorEmail: string;
  companies: CompanyWorkspace[];
  fixedCompanyId?: string;
  onCompleted?: () => void;
} & TriggerProps) {
  const companyOptions = useMemo(() => buildCompanyOptions(companies), [companies]);
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(fixedCompanyId ?? "");
  const [scope, setScope] = useState("READ_ONLY");
  const [ttlMinutes, setTtlMinutes] = useState("30");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await executeOperation({
        module: "support",
        action: "requestAccess",
        payload: {
          companyId: fixedCompanyId ?? companyId,
          requestedBy: actorEmail,
          reason,
          scope,
          ttlMinutes: Number(ttlMinutes) || 30,
        },
      });
      setOpen(false);
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request support access");
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
            title="Request support access"
            description="Start with a time-bound request, then approve and launch the session explicitly."
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Cancel</Button>
                <Button onClick={run} disabled={running || !(fixedCompanyId ?? companyId) || !reason.trim()}>
                  {running ? "Submitting..." : "Submit request"}
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
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Access scope</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="READ_ONLY">Read only</SelectItem>
                    <SelectItem value="READ_WRITE">Read and write</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Duration (minutes)</Label>
                <Input type="number" min={5} max={240} value={ttlMinutes} onChange={(event) => setTtlMinutes(event.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe why support access is needed" />
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SupportApprovalDialog({
  actorEmail,
  request,
  approve,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  request: SupportAccessRequestRecord;
  approve: boolean;
  onCompleted?: () => void;
} & TriggerProps) {
  return (
    <ConfirmDialog
      title={approve ? "Approve support request" : "Deny support request"}
      description={`${approve ? "Approve" : "Deny"} access for ${request.companyName ?? request.companyId} requested by ${request.requestedBy}.`}
      actionLabel={approve ? "Approve" : "Deny"}
      triggerLabel={triggerLabel}
      buttonVariant={buttonVariant}
      buttonSize={buttonSize}
      danger={!approve}
      onConfirm={async (reason) => {
        await executeOperation({
          module: "support",
          action: "approveRequest",
          payload: { requestId: request.id, approvedBy: actorEmail, approve, reason },
        });
        onCompleted?.();
      }}
    />
  );
}

export function SupportStartDialog({
  actorEmail,
  request,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  request: SupportAccessRequestRecord;
  onCompleted?: () => void;
} & TriggerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("IMPERSONATE");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await executeOperation({
        module: "support",
        action: "startSession",
        payload: { requestId: request.id, actor: actorEmail, mode },
      });
      setOpen(false);
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
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
            title="Start support session"
            description={`Launch a time-bound session for ${request.companyName ?? request.companyId}.`}
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Cancel</Button>
                <Button onClick={run} disabled={running}>
                  {running ? "Starting..." : "Start session"}
                </Button>
              </>
            }
          >
            <div className="space-y-1">
              <Label>Session mode</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IMPERSONATE">Impersonate</SelectItem>
                  <SelectItem value="SHADOW">Shadow</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SupportEndDialog({
  actorEmail,
  session,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  session: SupportSessionRecord;
  onCompleted?: () => void;
} & TriggerProps) {
  return (
    <ConfirmDialog
      title="End support session"
      description={`Terminate ${session.mode.toLowerCase()} access for ${session.companyName ?? session.companyId}.`}
      actionLabel="End session"
      triggerLabel={triggerLabel}
      buttonVariant={buttonVariant}
      buttonSize={buttonSize}
      danger
      onConfirm={async (reason) => {
        await executeOperation({
          module: "support",
          action: "endSession",
          payload: { actor: actorEmail, sessionId: session.id, reason },
        });
        onCompleted?.();
      }}
    />
  );
}

export function OrgStatusDialog({
  actorEmail,
  companyId,
  companyName,
  action,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  companyId: string;
  companyName: string;
  action: "activate" | "suspend" | "disable";
  onCompleted?: () => void;
} & TriggerProps) {
  const labelMap = {
    activate: "Activate workspace",
    suspend: "Suspend workspace",
    disable: "Disable workspace",
  };

  return (
    <ConfirmDialog
      title={labelMap[action]}
      description={`${labelMap[action]} for ${companyName}. This updates organization state through the platform services.`}
      actionLabel={labelMap[action]}
      triggerLabel={triggerLabel}
      buttonVariant={buttonVariant}
      buttonSize={buttonSize}
      danger={action !== "activate"}
      onConfirm={async (reason) => {
        await executeOperation({
          module: "org",
          action,
          payload: { actor: actorEmail, companyId, reason },
        });
        onCompleted?.();
      }}
    />
  );
}

export function ReserveSubdomainDialog({
  actorEmail,
  companyId,
  companyName,
  currentSubdomain,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  companyId: string;
  companyName: string;
  currentSubdomain?: string | null;
  onCompleted?: () => void;
} & TriggerProps) {
  const [open, setOpen] = useState(false);
  const [subdomain, setSubdomain] = useState(currentSubdomain ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await executeOperation({
        module: "org",
        action: "reserveSubdomain",
        payload: { actor: actorEmail, companyId, subdomain, reason },
      });
      setOpen(false);
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reserve subdomain");
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
            title="Reserve subdomain"
            description={`Assign the customer-facing subdomain for ${companyName}.`}
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Cancel</Button>
                <Button onClick={run} disabled={running || !subdomain.trim()}>
                  {running ? "Saving..." : "Reserve subdomain"}
                </Button>
              </>
            }
          >
            <div className="space-y-1">
              <Label>Subdomain</Label>
              <Input value={subdomain} onChange={(event) => setSubdomain(event.target.value)} placeholder="acme-mining" />
            </div>
            <div className="space-y-1">
              <Label>Reason (optional)</Label>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this reservation needed?" />
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CreateSiteDialog({
  actorEmail,
  companyId,
  companyName,
  onCompleted,
  triggerLabel,
  buttonVariant = "default",
  buttonSize = "sm",
}: {
  actorEmail: string;
  companyId: string;
  companyName: string;
  onCompleted?: () => void;
} & TriggerProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [location, setLocation] = useState("");
  const [measurementUnit, setMeasurementUnit] = useState("tonnes");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await executeOperation({
        module: "site",
        action: "create",
        payload: { actor: actorEmail, companyId, name, code, location, measurementUnit, reason },
      });
      setOpen(false);
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create site");
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
            title="Create site"
            description={`Add a site under ${companyName} with clear location and measurement details.`}
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Cancel</Button>
                <Button onClick={run} disabled={running || !name.trim() || !code.trim()}>
                  {running ? "Creating..." : "Create site"}
                </Button>
              </>
            }
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Site name</Label>
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Site code</Label>
                <Input value={code} onChange={(event) => setCode(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Location</Label>
                <Input value={location} onChange={(event) => setLocation(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Measurement unit</Label>
                <Select value={measurementUnit} onValueChange={setMeasurementUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tonnes">Tonnes</SelectItem>
                    <SelectItem value="trips">Trips</SelectItem>
                    <SelectItem value="wheelbarrows">Wheelbarrows</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Reason (optional)</Label>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Add rollout context for this site" />
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SiteStatusDialog({
  actorEmail,
  site,
  activate,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  site: SiteSummary;
  activate: boolean;
  onCompleted?: () => void;
} & TriggerProps) {
  return (
    <ConfirmDialog
      title={activate ? "Activate site" : "Deactivate site"}
      description={`${activate ? "Restore" : "Pause"} ${site.name} (${site.code}) for ${site.companyName ?? "this workspace"}.`}
      actionLabel={activate ? "Activate site" : "Deactivate site"}
      triggerLabel={triggerLabel}
      buttonVariant={buttonVariant}
      buttonSize={buttonSize}
      danger={!activate}
      onConfirm={async (reason) => {
        await executeOperation({
          module: "site",
          action: activate ? "activate" : "deactivate",
          payload: { actor: actorEmail, siteId: site.id, reason },
        });
        onCompleted?.();
      }}
    />
  );
}

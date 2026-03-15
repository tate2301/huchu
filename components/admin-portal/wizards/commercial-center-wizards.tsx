"use client";

import type { ComponentProps, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { SearchableOption } from "@/app/gold/types";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import { executeOperation } from "@/components/admin-portal/api";
import type { CompanyWorkspace } from "@/components/admin-portal/types";
import type {
  AddonBundleSummary,
  BundleCatalogSummary,
  ClientTemplateSummary,
  FeatureSummary,
  TierPlanSummary,
} from "@/scripts/platform/types";
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
              <Label>Reason (optional)</Label>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Add audit context for this action" />
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AssignTierDialog({
  actorEmail,
  companies,
  plans,
  fixedCompanyId,
  defaultTierCode,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  companies: CompanyWorkspace[];
  plans: TierPlanSummary[];
  fixedCompanyId?: string;
  defaultTierCode?: string | null;
  onCompleted?: () => void;
} & TriggerProps) {
  const companyOptions = useMemo(() => buildCompanyOptions(companies), [companies]);
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(fixedCompanyId ?? "");
  const [tierCode, setTierCode] = useState(defaultTierCode ?? plans[0]?.code ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await executeOperation({
        module: "subscription",
        action: "assignTier",
        payload: { actor: actorEmail, companyId: fixedCompanyId ?? companyId, tierCode, reason },
      });
      setOpen(false);
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign tier");
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
            title="Assign tier"
            description="Select the target workspace and tier, then apply the new plan safely."
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Cancel</Button>
                <Button onClick={run} disabled={running || !(fixedCompanyId ?? companyId) || !tierCode}>
                  {running ? "Applying..." : "Assign tier"}
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
              <Label>Plan level</Label>
              <Select value={tierCode} onValueChange={setTierCode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan.code} value={plan.code}>
                      {plan.name} - ${plan.monthlyPrice}/month
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reason (optional)</Label>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this tier changing?" />
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SubscriptionStatusDialog({
  actorEmail,
  companies,
  fixedCompanyId,
  defaultStatus,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  companies: CompanyWorkspace[];
  fixedCompanyId?: string;
  defaultStatus?: string | null;
  onCompleted?: () => void;
} & TriggerProps) {
  const companyOptions = useMemo(() => buildCompanyOptions(companies), [companies]);
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(fixedCompanyId ?? "");
  const [status, setStatus] = useState(defaultStatus ?? "ACTIVE");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await executeOperation({
        module: "subscription",
        action: "setStatus",
        payload: { actor: actorEmail, companyId: fixedCompanyId ?? companyId, status, reason },
      });
      setOpen(false);
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update subscription status");
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
            title="Set subscription status"
            description="Update the current subscription state for the selected workspace."
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Cancel</Button>
                <Button onClick={run} disabled={running || !(fixedCompanyId ?? companyId) || !status}>
                  {running ? "Saving..." : "Save status"}
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
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRIALING">TRIALING</SelectItem>
                  <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                  <SelectItem value="PAST_DUE">PAST_DUE</SelectItem>
                  <SelectItem value="CANCELED">CANCELED</SelectItem>
                  <SelectItem value="EXPIRED">EXPIRED</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reason (optional)</Label>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is the status changing?" />
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ApplyTemplateDialog({
  actorEmail,
  companies,
  templates,
  fixedCompanyId,
  defaultTemplateCode,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  companies: CompanyWorkspace[];
  templates: ClientTemplateSummary[];
  fixedCompanyId?: string;
  defaultTemplateCode?: string;
  onCompleted?: () => void;
} & TriggerProps) {
  const companyOptions = useMemo(() => buildCompanyOptions(companies), [companies]);
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(fixedCompanyId ?? "");
  const [templateCode, setTemplateCode] = useState(defaultTemplateCode ?? templates[0]?.code ?? "");
  const [mode, setMode] = useState("ADDITIVE");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTemplateCode(defaultTemplateCode ?? templates[0]?.code ?? "");
  }, [defaultTemplateCode, open, templates]);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await executeOperation({
        module: "subscription",
        action: "applyTemplate",
        payload: { actor: actorEmail, companyId: fixedCompanyId ?? companyId, templateCode, mode, reason },
      });
      setOpen(false);
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply template");
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
            title="Apply template"
            description="Assign a commercial template to a workspace with additive or replace behavior."
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Cancel</Button>
                <Button onClick={run} disabled={running || !(fixedCompanyId ?? companyId) || !templateCode}>
                  {running ? "Applying..." : "Apply template"}
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
              <Label>Template</Label>
              <Select value={templateCode} onValueChange={setTemplateCode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.code} value={template.code}>
                      {template.label} - {template.recommendedTierCode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Apply mode</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADDITIVE">ADDITIVE</SelectItem>
                  <SelectItem value="REPLACE">REPLACE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reason (optional)</Label>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this template being applied?" />
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AddonStateDialog({
  actorEmail,
  companyId,
  addon,
  enable,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  companyId: string;
  addon: AddonBundleSummary;
  enable: boolean;
  onCompleted?: () => void;
} & TriggerProps) {
  return (
    <ConfirmDialog
      title={enable ? "Enable add-on" : "Disable add-on"}
      description={`${enable ? "Enable" : "Disable"} ${addon.name} for the current workspace. Pricing and entitlement state will be refreshed after this change.`}
      actionLabel={enable ? "Enable add-on" : "Disable add-on"}
      triggerLabel={triggerLabel}
      buttonVariant={buttonVariant}
      buttonSize={buttonSize}
      danger={!enable}
      onConfirm={async (reason) => {
        await executeOperation({
          module: "subscription",
          action: "setAddon",
          payload: { actor: actorEmail, companyId, bundleCode: addon.code, enabled: enable, reason },
        });
        onCompleted?.();
      }}
    />
  );
}

export function RecomputePricingDialog({
  companyId,
  companyName,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  companyId: string;
  companyName: string;
  onCompleted?: () => void;
} & TriggerProps) {
  return (
    <ConfirmDialog
      title="Recompute pricing"
      description={`Recompute pricing for ${companyName}. This refreshes the stored pricing snapshot and latest monthly amount.`}
      actionLabel="Recompute pricing"
      triggerLabel={triggerLabel}
      buttonVariant={buttonVariant}
      buttonSize={buttonSize}
      onConfirm={async () => {
        await executeOperation({
          module: "subscription",
          action: "recomputePricing",
          args: [companyId],
        });
        onCompleted?.();
      }}
    />
  );
}

export function CatalogSyncDialog({
  actorEmail,
  onCompleted,
  triggerLabel,
  buttonVariant = "default",
  buttonSize = "sm",
}: {
  actorEmail: string;
  onCompleted?: () => void;
} & TriggerProps) {
  return (
    <ConfirmDialog
      title="Sync commercial catalog"
      description="Refresh feature, bundle, and tier catalog records from platform definitions."
      actionLabel="Sync catalog"
      triggerLabel={triggerLabel}
      buttonVariant={buttonVariant}
      buttonSize={buttonSize}
      onConfirm={async () => {
        await executeOperation({
          module: "subscription",
          action: "syncCatalog",
          args: [actorEmail],
        });
        onCompleted?.();
      }}
    />
  );
}

export function BundleUpsertDialog({
  actorEmail,
  bundle,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  bundle?: BundleCatalogSummary;
  onCompleted?: () => void;
} & TriggerProps) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(bundle?.code ?? "");
  const [name, setName] = useState(bundle?.name ?? "");
  const [description, setDescription] = useState(bundle?.description ?? "");
  const [monthlyPrice, setMonthlyPrice] = useState(String(bundle?.monthlyPrice ?? 0));
  const [additionalSiteMonthlyPrice, setAdditionalSiteMonthlyPrice] = useState(String(bundle?.additionalSiteMonthlyPrice ?? 0));
  const [isActive, setIsActive] = useState(bundle?.isActive ?? true);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await executeOperation({
        module: "subscription",
        action: "upsertBundleCatalog",
        payload: {
          actor: actorEmail,
          code,
          name,
          description,
          monthlyPrice: Number(monthlyPrice) || 0,
          additionalSiteMonthlyPrice: Number(additionalSiteMonthlyPrice) || 0,
          isActive,
          reason,
        },
      });
      setOpen(false);
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save bundle");
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
            title={bundle ? "Edit bundle" : "Create bundle"}
            description="Manage commercial bundle definitions used by templates and add-on flows."
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Cancel</Button>
                <Button onClick={run} disabled={running || !code.trim() || !name.trim()}>
                  {running ? "Saving..." : bundle ? "Save bundle" : "Create bundle"}
                </Button>
              </>
            }
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Code</Label>
                <Input value={code} onChange={(event) => setCode(event.target.value)} disabled={Boolean(bundle)} />
              </div>
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Monthly price</Label>
                <Input type="number" min={0} step="0.01" value={monthlyPrice} onChange={(event) => setMonthlyPrice(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Per-site price</Label>
                <Input type="number" min={0} step="0.01" value={additionalSiteMonthlyPrice} onChange={(event) => setAdditionalSiteMonthlyPrice(event.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What does this bundle include?" />
            </div>
            <div className="space-y-1">
              <Label>Bundle status</Label>
              <Select value={isActive ? "ACTIVE" : "INACTIVE"} onValueChange={(value) => setIsActive(value === "ACTIVE")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                  <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reason (optional)</Label>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this bundle changing?" />
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function BundleFeatureMapDialog({
  actorEmail,
  bundle,
  featureCatalog,
  onCompleted,
  triggerLabel,
  buttonVariant = "outline",
  buttonSize = "sm",
}: {
  actorEmail: string;
  bundle: BundleCatalogSummary;
  featureCatalog: FeatureSummary[];
  onCompleted?: () => void;
} & TriggerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(bundle.featureKeys));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const filteredFeatures = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return featureCatalog;
    return featureCatalog.filter((feature) => {
      const haystack = `${feature.featureLabel} ${feature.feature}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [featureCatalog, query]);

  const toggleFeature = (featureKey: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(featureKey)) {
        next.delete(featureKey);
      } else {
        next.add(featureKey);
      }
      return next;
    });
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await executeOperation({
        module: "subscription",
        action: "setBundleFeatures",
        payload: {
          actor: actorEmail,
          bundleCode: bundle.code,
          featureKeys: Array.from(selected),
          reason,
        },
      });
      setOpen(false);
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update bundle features");
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
        <DialogContent className="sm:max-w-3xl">
          <DialogScaffold
            title="Map bundle features"
            description={`Select the feature set for ${bundle.name}. Search narrows the catalog while the selected draft stays intact.`}
            error={error}
            footer={
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Cancel</Button>
                <Button onClick={run} disabled={running}>
                  {running ? "Saving..." : "Save feature map"}
                </Button>
              </>
            }
          >
            <div className="space-y-1">
              <Label>Search features</Label>
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search feature label or key" />
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] p-3">
              {filteredFeatures.map((feature) => {
                const isSelected = selected.has(feature.feature);
                return (
                  <button
                    key={feature.feature}
                    type="button"
                    onClick={() => toggleFeature(feature.feature)}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left ${isSelected ? "border-[var(--border-strong)] bg-[var(--surface-muted)]" : "border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-muted)]"}`}
                  >
                    <div>
                      <p className="text-sm font-medium">{feature.featureLabel}</p>
                      <p className="text-xs text-[var(--text-muted)]">{feature.feature}</p>
                    </div>
                    <Badge variant={isSelected ? "secondary" : "outline"}>{isSelected ? "Selected" : "Add"}</Badge>
                  </button>
                );
              })}
            </div>
            <div className="space-y-1">
              <Label>Reason (optional)</Label>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this bundle mapping changing?" />
            </div>
          </DialogScaffold>
        </DialogContent>
      </Dialog>
    </>
  );
}

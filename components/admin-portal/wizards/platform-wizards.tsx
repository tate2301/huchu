"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WorkflowStep } from "@/components/ui/workflow-step";
import { FEATURE_BUNDLES, TIERS, BUNDLE_DEPENDENCIES, getTierDefinition } from "@/lib/platform/feature-catalog";
import { computeMonthlyTotal } from "@/components/admin-portal/pages/client-data";
import { executeOperation } from "@/components/admin-portal/api";

type WizardBaseProps = {
  actorEmail: string;
};

type CompanyScopedProps = WizardBaseProps & {
  companyId: string;
  companyName?: string;
  currentAddonCodes?: string[];
  siteCount?: number;
};

function formatCurrency(value: number) {
  return `$${value.toLocaleString()}`;
}

function WizardShell({
  title,
  description,
  steps,
  children,
  footer,
}: {
  title: string;
  description: string;
  steps: { label: string; status: "done" | "active" | "pending" }[];
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-[var(--text-muted)]">{description}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {steps.map((step, index) => (
          <WorkflowStep
            key={step.label}
            title={`Step ${index + 1}: ${step.label}`}
            badge={step.status === "done" ? "Done" : step.status === "active" ? "Now" : "Pending"}
            collapsed
          />
        ))}
      </div>
      {children}
      {footer}
    </div>
  );
}

export function CreateClientWizard({ actorEmail }: WizardBaseProps) {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState("Core Starter");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [sites, setSites] = useState(1);
  const [tierCode, setTierCode] = useState("BASIC");
  const [notes, setNotes] = useState("");
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);

  const tier = getTierDefinition(tierCode) ?? TIERS[0];
  const price = computeMonthlyTotal(tier, [], sites);

  const steps: { label: string; status: "done" | "active" | "pending" }[] = [
    { label: "Select Template", status: name ? "done" : "active" },
    { label: "Client Details", status: slug ? "done" : name ? "active" : "pending" },
    { label: "Sites & Plan", status: tierCode ? "done" : "pending" },
    { label: "Review & Create", status: completed ? "done" : "active" },
  ];

  const create = async () => {
    setRunning(true);
    try {
      await executeOperation({
        module: "org",
        action: "provision",
        payload: {
          actor: actorEmail,
          template,
          name,
          slug,
          sites,
          tier: tierCode,
          notes,
        },
      });
      setCompleted(true);
      setOpen(false);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>Create Client (wizard)</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Client</DialogTitle>
          </DialogHeader>
          <WizardShell
            title="Guided flow"
            description="Operators never touch raw flags; pick template, fill layman details, confirm pricing."
            steps={steps}
            footer={
              <DialogFooter>
                <Button onClick={create} disabled={running || !name || !slug}>
                  {running ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            }
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Template</Label>
                <Select value={template} onValueChange={setTemplate}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Core Starter">Core Starter</SelectItem>
                    <SelectItem value="Gold Mine">Gold Mine</SelectItem>
                    <SelectItem value="Small Business Security">Small Business Security</SelectItem>
                    <SelectItem value="Tech Workshop">Tech Workshop</SelectItem>
                    <SelectItem value="Schools">Schools</SelectItem>
                    <SelectItem value="Car Sales">Car Sales</SelectItem>
                    <SelectItem value="Thrift">Thrift</SelectItem>
                    <SelectItem value="All Features">All Features</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tier</Label>
                <Select value={tierCode} onValueChange={setTierCode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIERS.map((item) => (
                      <SelectItem key={item.code} value={item.code}>{item.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Client name</Label>
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Kasiya Metals" />
              </div>
              <div className="space-y-1">
                <Label>Slug</Label>
                <Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="kasiya-metals" />
              </div>
              <div className="space-y-1">
                <Label>Sites</Label>
                <Input type="number" min={1} value={sites} onChange={(event) => setSites(Number(event.target.value) || 1)} />
              </div>
              <div className="space-y-1">
                <Label>Notes (optional)</Label>
                <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Purpose, onboarding context" />
              </div>
            </div>
            <Card className="border-[var(--border)]">
              <CardHeader>
                <CardTitle className="text-base">Pricing preview</CardTitle>
                <CardDescription>tier_base + tier_site_overage (USD/month)</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Base Plan</p>
                  <p className="font-mono text-lg">{formatCurrency(price.tierBase)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Site Overage</p>
                  <p className="font-mono text-lg">{formatCurrency(price.siteOverage)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Total</p>
                  <p className="font-mono text-2xl">{formatCurrency(price.total)}/month</p>
                </div>
              </CardContent>
            </Card>
          </WizardShell>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ChangeTierWizard({ actorEmail, companyId, companyName }: CompanyScopedProps) {
  const [open, setOpen] = useState(false);
  const [tierCode, setTierCode] = useState("STANDARD");
  const [siteCount, setSiteCount] = useState(3);
  const [running, setRunning] = useState(false);
  const tier = getTierDefinition(tierCode) ?? TIERS[0];
  const price = computeMonthlyTotal(tier, [], siteCount);

  const steps: { label: string; status: "done" | "active" | "pending" }[] = [
    { label: "Select Tier", status: "active" },
    { label: "Review Pricing", status: "pending" },
    { label: "Confirm", status: "pending" },
  ];

  const changeTier = async () => {
    setRunning(true);
    try {
      await executeOperation({
        module: "subscription",
        action: "assignTier",
        payload: {
          actor: actorEmail,
          companyId,
          tier: tierCode,
          sites: siteCount,
        },
      });
      setOpen(false);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Change Tier</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Change Tier {companyName ? `· ${companyName}` : ""}</DialogTitle>
          </DialogHeader>
          <WizardShell
            title="Tier change"
            description="Guided three-step flow: select, review pricing, confirm."
            steps={steps}
            footer={
              <DialogFooter>
                <Button onClick={changeTier} disabled={running}>
                  {running ? "Applying..." : "Confirm"}
                </Button>
              </DialogFooter>
            }
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>New Tier</Label>
                <Select value={tierCode} onValueChange={setTierCode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIERS.map((item) => (
                      <SelectItem key={item.code} value={item.code}>{item.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Active sites</Label>
                <Input type="number" min={1} value={siteCount} onChange={(event) => setSiteCount(Number(event.target.value) || 1)} />
              </div>
            </div>
            <Card className="border-[var(--border)]">
              <CardHeader>
                <CardTitle className="text-base">Pricing</CardTitle>
                <CardDescription>Applies platform formula for total monthly.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Base</p>
                  <p className="font-mono text-lg">{formatCurrency(price.tierBase)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Site Overage</p>
                  <p className="font-mono text-lg">{formatCurrency(price.siteOverage)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Total</p>
                  <p className="font-mono text-2xl">{formatCurrency(price.total)}/month</p>
                </div>
              </CardContent>
            </Card>
          </WizardShell>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ManageAddonsWizard({
  actorEmail,
  companyId,
  companyName,
  currentAddonCodes = [],
  siteCount = 3,
}: CompanyScopedProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(currentAddonCodes));
  const [running, setRunning] = useState(false);
  const addonSteps: { label: string; status: "done" | "active" | "pending" }[] = [
    { label: "Select Add-ons", status: "active" },
    { label: "Review Pricing", status: "pending" },
    { label: "Apply", status: "pending" },
  ];

  const summary = useMemo(() => {
    const tier = TIERS[0];
    return computeMonthlyTotal(tier, Array.from(selected), siteCount);
  }, [selected, siteCount]);

  const dependencyWarnings = useMemo(() => {
    const missing: string[] = [];
    Array.from(selected).forEach((code) => {
      const deps = BUNDLE_DEPENDENCIES[code];
      if (!deps) return;
      deps.forEach((dep) => {
        if (!selected.has(dep)) missing.push(`${code} requires ${dep}`);
      });
    });
    return missing;
  }, [selected]);

  const toggleAddon = (code: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const applyAddons = async () => {
    setRunning(true);
    try {
      await executeOperation({
        module: "subscription",
        action: "setAddon",
        payload: {
          actor: actorEmail,
          companyId,
          addons: Array.from(selected),
        },
      });
      setOpen(false);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Manage Add-ons</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Manage Add-ons {companyName ? `· ${companyName}` : ""}</DialogTitle>
          </DialogHeader>
          <WizardShell
            title="Safe add-on enable/disable"
            description="Step 1 select add-ons, step 2 review pricing, step 3 apply. Feature flags auto-managed."
            steps={addonSteps}
            footer={
              <DialogFooter className="flex flex-col gap-2">
                {dependencyWarnings.length > 0 ? (
                  <div className="flex items-center gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                    <ShieldAlert className="h-4 w-4" />
                    {dependencyWarnings.join(", ")}
                  </div>
                ) : null}
                <Button onClick={applyAddons} disabled={running}>
                  {running ? "Applying..." : "Apply"}
                </Button>
              </DialogFooter>
            }
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {FEATURE_BUNDLES.map((bundle) => {
                const enabled = selected.has(bundle.code);
                return (
                  <Card key={bundle.code} className="border-[var(--border)]">
                    <CardHeader className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-base">{bundle.name}</CardTitle>
                          <CardDescription>{bundle.description}</CardDescription>
                        </div>
                        {enabled ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">
                        Base: {formatCurrency(bundle.monthlyPrice)} · Per site: {formatCurrency(bundle.additionalSiteMonthlyPrice)}/site
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Features included</p>
                      <ul className="list-disc space-y-1 pl-5 text-[var(--text-muted)]">
                        {bundle.features.slice(0, 4).map((feature) => (
                          <li key={feature}>{feature}</li>
                        ))}
                        {bundle.features.length > 4 ? <li>+{bundle.features.length - 4} more</li> : null}
                      </ul>
                      <Button size="sm" variant={enabled ? "outline" : "default"} onClick={() => toggleAddon(bundle.code)}>
                        {enabled ? "Disable" : "Enable"}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <Card className="border-[var(--border)]">
              <CardHeader>
                <CardTitle className="text-base">Pricing</CardTitle>
                <CardDescription>addon_base_total + addon_site_total (USD/month)</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Add-on base</p>
                  <p className="font-mono text-lg">{formatCurrency(summary.addonBaseTotal)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Add-on per-site</p>
                  <p className="font-mono text-lg">{formatCurrency(summary.addonSiteTotal)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Total</p>
                  <p className="font-mono text-2xl">{formatCurrency(summary.addonBaseTotal + summary.addonSiteTotal)}/month</p>
                </div>
              </CardContent>
            </Card>
          </WizardShell>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Card, Skeleton, StatCard } from "@corelithzw/react";
import { AdminDistributionChart, AdminDualBarChart, AdminDonutChart } from "@corelithzw/ui/charts/admin-headless-charts";
import { RetailShell } from "@corelithzw/module-sell/components/retail-shell";
import { Button } from "@corelithzw/ui/components/button";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { ArrowRight, CheckCircle2, Save, Settings2, ShieldCheck } from "@corelithzw/ui/lib/icons";
import { useToast } from "@corelithzw/ui/components/use-toast";
import type { RetailPosPolicy } from "@corelithzw/module-sell/pos-policy";

type PosPolicyResponse = {
  data: RetailPosPolicy;
  defaults: RetailPosPolicy;
  saved: boolean;
};

const TENDER_TYPES = ["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"] as const;
const POS_POLICY_DRAFT_KEY = "retail.setup.pos-policy.draft.v1";

function toPolicyRows(policy: RetailPosPolicy) {
  return [
    {
      id: "references",
      label: "Reference rules",
      primary: policy.requiredReferenceTenders.length > 0 ? 1 : 0,
      secondary: policy.requiredReferenceTenders.length > 0 ? 0 : 1,
    },
    {
      id: "split-tender",
      label: "Split tender",
      primary: policy.splitTenderEnabled ? 1 : 0,
      secondary: policy.splitTenderEnabled ? 0 : 1,
    },
    {
      id: "refund-reason",
      label: "Refund reason",
      primary: policy.refundRequiresReason ? 1 : 0,
      secondary: policy.refundRequiresReason ? 0 : 1,
    },
    {
      id: "void-reason",
      label: "Void reason",
      primary: policy.voidRequiresReason ? 1 : 0,
      secondary: policy.voidRequiresReason ? 0 : 1,
    },
    {
      id: "supervisor",
      label: "Supervisor guard",
      primary: policy.requireSupervisorForRefunds ? 1 : 0,
      secondary: policy.requireSupervisorForRefunds ? 0 : 1,
    },
  ];
}

export default function RetailSetupPosPolicyPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RetailPosPolicy | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const raw = window.localStorage.getItem(POS_POLICY_DRAFT_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as RetailPosPolicy;
    } catch {
      window.localStorage.removeItem(POS_POLICY_DRAFT_KEY);
      return null;
    }
  });
  const query = useQuery({
    queryKey: ["retail-pos-policy"],
    queryFn: () => fetchJson<PosPolicyResponse>("/api/v2/retail/setup/pos-policy"),
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!draft) {
      window.localStorage.removeItem(POS_POLICY_DRAFT_KEY);
      return;
    }
    window.localStorage.setItem(POS_POLICY_DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  const effectivePolicy = useMemo<RetailPosPolicy>(
    () =>
      draft ??
      query.data?.data ??
      query.data?.defaults ?? {
        requiredReferenceTenders: ["CARD", "MOBILE_MONEY"],
        minReferenceLength: 4,
        referencePattern: "^[A-Za-z0-9][A-Za-z0-9\\-/_ ]*$",
        splitTenderEnabled: false,
        refundRequiresReason: true,
        voidRequiresReason: true,
        requireSupervisorForRefunds: true,
      },
    [draft, query.data],
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/retail/setup/pos-policy", {
        method: "PUT",
        body: JSON.stringify({
          requiredReferenceTenders: effectivePolicy.requiredReferenceTenders,
          minReferenceLength: Number(effectivePolicy.minReferenceLength || 4),
          referencePattern: effectivePolicy.referencePattern,
          splitTenderEnabled: effectivePolicy.splitTenderEnabled,
          refundRequiresReason: effectivePolicy.refundRequiresReason,
          voidRequiresReason: effectivePolicy.voidRequiresReason,
          requireSupervisorForRefunds: effectivePolicy.requireSupervisorForRefunds,
        }),
      }),
    onSuccess: async () => {
      toast({ title: "POS policy saved", variant: "success" });
      setDraft(null);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(POS_POLICY_DRAFT_KEY);
      }
      await queryClient.invalidateQueries({ queryKey: ["retail-pos-policy"] });
      await queryClient.invalidateQueries({ queryKey: ["retail-setup-overview"] });
    },
    onError: (error) =>
      toast({
        title: "Unable to save POS policy",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const chartRows = useMemo(() => toPolicyRows(effectivePolicy), [effectivePolicy]);

  const tenderRows = useMemo(
    () =>
      TENDER_TYPES.map((tender) => ({
        id: tender,
        label: tender.replaceAll("_", " "),
        value: effectivePolicy.requiredReferenceTenders.includes(tender) ? 1 : 0,
      })),
    [effectivePolicy],
  );

  const readyRows = useMemo(
    () => [
      { id: "saved", label: query.data?.saved ? "Saved" : "Draft", value: query.data?.saved ? 1 : 0, tone: "success" as const },
      { id: "unsaved", label: query.data?.saved ? "Pending" : "Needs save", value: query.data?.saved ? 0 : 1, tone: "warning" as const },
    ],
    [query.data?.saved],
  );

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" variant="outline">
        <Link href="/retail/setup">
          <Settings2 className="h-4 w-4" />
          Overview
        </Link>
      </Button>
      <Button asChild size="sm" variant="outline">
        <Link href="/retail/setup/operations">
          <CheckCircle2 className="h-4 w-4" />
          Operations
        </Link>
      </Button>
      <Button asChild size="sm" variant="outline">
        <Link href="/retail/setup/accounting">
          <ShieldCheck className="h-4 w-4" />
          Accounting
        </Link>
      </Button>
    </div>
  );

  const description = "Tune the checkout guardrails without slowing the cashier down.";

  if (query.isPending) {
    return (
      <RetailShell title="POS policy" description={description} actions={actions}>
        <div aria-busy="true" aria-live="polite" className="space-y-4">
          <span className="sr-only">Reading the checkout policy…</span>
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton height={104} />
            <Skeleton height={104} />
            <Skeleton height={104} />
          </div>
          <Skeleton height={340} />
          <Skeleton height={280} />
        </div>
      </RetailShell>
    );
  }

  if (query.isError) {
    return (
      <RetailShell title="POS policy" description={description} actions={actions}>
        <Alert tone="danger" title="The checkout policy would not load">
          {getApiErrorMessage(query.error)}
        </Alert>
      </RetailShell>
    );
  }

  return (
    <RetailShell title="POS policy" description={description} actions={actions}>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Policy state"
          value={query.data.saved ? "Saved" : "Draft"}
          tone={query.data.saved ? "success" : "warn"}
          footer={query.data.saved ? "Backed by provider config" : "Running on setup defaults"}
        />
        <StatCard
          label="Tenders needing a reference"
          value={String(effectivePolicy.requiredReferenceTenders.length)}
          footer={`Minimum ${effectivePolicy.minReferenceLength} characters`}
        />
        <StatCard
          label="Refund guard"
          value={effectivePolicy.requireSupervisorForRefunds ? "Supervisor" : "Cashier"}
          tone={effectivePolicy.requireSupervisorForRefunds ? "success" : "warn"}
          footer="Who can approve a refund"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
        <div className="space-y-6">
          <Card
            title="Fast lane with sensible controls"
            subtitle="Protect the takings without making every tender feel like a compliance exercise."
          >
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
              <AdminDualBarChart
                rows={chartRows}
                primaryLabel="Configured"
                secondaryLabel="Missing"
                height={300}
                valueFormatter={(value) => value.toString()}
                emptyLabel="No policy rules to chart."
              />
              <AdminDonutChart
                rows={readyRows}
                valueLabel="Policy state"
                valueFormatter={(value) => value.toString()}
                height={300}
                emptyLabel="No policy state to show."
              />
            </div>
          </Card>

          <Card
            title="Which tenders must carry a reference?"
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/retail/setup/accounting">
                  Accounting map
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            }
          >
            <AdminDistributionChart
              rows={tenderRows}
              valueLabel="Required tenders"
              valueFormatter={(value) => value.toString()}
              height={260}
              emptyLabel="No tenders configured."
            />
          </Card>
        </div>

        <aside className="space-y-4">
          <Card title="Edit the policy" subtitle="Applies to every till in the shop.">
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (effectivePolicy.requiredReferenceTenders.length === 0) {
                  toast({ title: "Select at least one tender", variant: "destructive" });
                  return;
                }
                saveMutation.mutate();
              }}
            >
              <div className="space-y-3">
                <Label>Tenders requiring a reference</Label>
                <div className="space-y-2">
                  {TENDER_TYPES.map((tender) => {
                    const checked = effectivePolicy.requiredReferenceTenders.includes(tender);
                    return (
                      <label
                        key={tender}
                        className="flex min-h-12 items-center gap-3 border-b border-[color:var(--border-subtle)] py-2 last:border-b-0"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) => {
                            setDraft((current) => {
                              const resolved = current ?? effectivePolicy;
                              return {
                                ...resolved,
                                requiredReferenceTenders: next
                                  ? [...new Set([...resolved.requiredReferenceTenders, tender])]
                                  : resolved.requiredReferenceTenders.filter((value) => value !== tender),
                              };
                            });
                          }}
                        />
                        <span>{tender.replaceAll("_", " ")}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Minimum reference length</Label>
                  <Input
                    value={String(effectivePolicy.minReferenceLength)}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...(current ?? effectivePolicy),
                        minReferenceLength: Number(event.target.value || "0"),
                      }))
                    }
                    inputMode="numeric"
                    className="h-12 font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reference regex</Label>
                  <Input
                    value={effectivePolicy.referencePattern}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...(current ?? effectivePolicy),
                        referencePattern: event.target.value,
                      }))
                    }
                    className="h-12 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-3 border-t border-[color:var(--border-subtle)] pt-4">
                {[
                  {
                    label: "Allow split tender",
                    description: "Let a sale be paid across more than one tender type.",
                    value: "splitTenderEnabled",
                  },
                  {
                    label: "Refund requires reason",
                    description: "Capture a human explanation before refunding.",
                    value: "refundRequiresReason",
                  },
                  {
                    label: "Void requires reason",
                    description: "Protect the high-risk void flow with a reason.",
                    value: "voidRequiresReason",
                  },
                  {
                    label: "Supervisor approval for refunds",
                    description: "Keep override-sensitive refunds visible.",
                    value: "requireSupervisorForRefunds",
                  },
                ].map((item) => (
                  <label key={item.value} className="flex items-start gap-3 py-1">
                    <Checkbox
                      checked={effectivePolicy[item.value as keyof RetailPosPolicy] as boolean}
                      onCheckedChange={(next) =>
                        setDraft((current) => ({
                          ...(current ?? effectivePolicy),
                          [item.value]: Boolean(next),
                        }))
                      }
                    />
                    <div className="space-y-1">
                      <span className="t-body-sm block font-medium text-[color:var(--text-strong)]">
                        {item.label}
                      </span>
                      <span className="t-caption t-muted block">{item.description}</span>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={saveMutation.isPending}>
                  <Save className="h-4 w-4" />
                  Save POS policy
                </Button>
                {draft ? <Badge tone="warn">Unsaved changes</Badge> : null}
              </div>
            </form>
          </Card>
        </aside>
      </div>
    </RetailShell>
  );
}


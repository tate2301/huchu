"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminDistributionChart, AdminDualBarChart, AdminDonutChart } from "@/components/charts/admin-headless-charts";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ArrowRight, CheckCircle2, Save, Settings2, ShieldCheck } from "@/lib/icons";
import { useToast } from "@/components/ui/use-toast";
import type { RetailPosPolicy } from "@/lib/retail/pos-policy";

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

  return (
    <RetailShell
      title="POS policy"
      description="Tune the checkout guardrails without slowing the cashier down."
      actions={
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
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
        <div className="space-y-6">
          <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Checkout guardrails</p>
                <h2 className="mt-1 text-2xl font-semibold text-[var(--text-strong)]">Fast lane with sensible controls</h2>
                <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
                  The policy should protect the business without making every tender feel like a compliance exercise.
                  The important part is that the rules are deliberate and saved in one place.
                </p>
              </div>
              <div className="rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Policy state</p>
                <p className="font-mono text-3xl font-semibold text-[var(--text-strong)]">
                  {query.data?.saved ? "Saved" : "Draft"}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {query.data ? "Provider config backed" : "Loading policy"}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
              <AdminDualBarChart
                rows={chartRows}
                primaryLabel="Configured"
                secondaryLabel="Missing"
                height={300}
                valueFormatter={(value) => value.toString()}
                emptyLabel="POS policy is loading"
              />
              <AdminDonutChart
                rows={readyRows}
                valueLabel="Policy state"
                valueFormatter={(value) => value.toString()}
                height={300}
                emptyLabel="POS policy is loading"
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Tender references</p>
                <h3 className="mt-1 text-xl font-semibold text-[var(--text-strong)]">Which tenders must carry a reference?</h3>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/retail/setup/accounting">
                  Accounting map
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-4">
              <AdminDistributionChart
                rows={tenderRows}
                valueLabel="Required tenders"
                valueFormatter={(value) => value.toString()}
                height={260}
                emptyLabel="Tender references are loading"
              />
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[var(--surface-subtle)] p-3 text-[var(--text-strong)]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Controls</p>
                <h3 className="text-lg font-semibold text-[var(--text-strong)]">Edit the policy</h3>
              </div>
            </div>

            <form
              className="mt-4 space-y-4"
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
                        className="flex min-h-12 items-center gap-3 rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] px-4 py-3 text-sm"
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
                    className="h-12 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] p-4">
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
                  <label key={item.value} className="flex items-start gap-3 rounded-xl px-1 py-1">
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
                      <span className="block text-sm font-medium text-[var(--text-strong)]">{item.label}</span>
                      <span className="block text-xs text-[var(--text-muted)]">{item.description}</span>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saveMutation.isPending}>
                  <Save className="h-4 w-4" />
                  Save POS policy
                </Button>
                <Button asChild variant="outline">
                  <Link href="/retail/setup/operations">Operations</Link>
                </Button>
              </div>
            </form>
          </section>
        </aside>
      </div>
    </RetailShell>
  );
}


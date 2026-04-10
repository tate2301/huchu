"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminDualBarChart, AdminDonutChart } from "@/components/charts/admin-headless-charts";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ArrowRight, Building2, CheckCircle, Plus, ReceiptLong, Server } from "@/lib/icons";
import { useToast } from "@/components/ui/use-toast";
import type { RetailSetupSnapshot } from "@/lib/retail/setup-snapshot";

type SetupOverviewResponse = RetailSetupSnapshot;
type OperationsSaveResponse = {
  ok: boolean;
  profile: {
    defaultSiteId: string | null;
    defaultRegisterId: string | null;
    defaultRegisterName: string | null;
    defaultRegisterCode: string | null;
  };
};

type OperationForm = {
  defaultSiteId: string;
  defaultRegisterName: string;
  defaultRegisterCode: string;
};

const EMPTY_FORM: OperationForm = {
  defaultSiteId: "",
  defaultRegisterName: "",
  defaultRegisterCode: "",
};
const OPERATIONS_DRAFT_KEY = "retail.setup.operations.draft.v1";

export default function RetailSetupOperationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const overviewQuery = useQuery({
    queryKey: ["retail-setup-overview"],
    queryFn: () => fetchJson<SetupOverviewResponse>("/api/v2/retail/setup/overview"),
  });
  const [draft, setDraft] = useState<OperationForm | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const raw = window.localStorage.getItem(OPERATIONS_DRAFT_KEY);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<OperationForm>;
      return {
        defaultSiteId: parsed.defaultSiteId ?? "",
        defaultRegisterName: parsed.defaultRegisterName ?? "",
        defaultRegisterCode: parsed.defaultRegisterCode ?? "",
      };
    } catch {
      window.localStorage.removeItem(OPERATIONS_DRAFT_KEY);
      return null;
    }
  });

  const snapshot = overviewQuery.data;

  const initialDraft = useMemo<OperationForm>(() => {
    if (!snapshot) {
      return EMPTY_FORM;
    }

    const defaultSiteId = snapshot.setupProfile.defaultSiteId ?? snapshot.sites.find((site) => site.isActive)?.id ?? "";
    const selectedSite = snapshot.sites.find((site) => site.id === defaultSiteId) ?? snapshot.sites[0] ?? null;

    return {
      defaultSiteId,
      defaultRegisterName:
        snapshot.setupProfile.defaultRegisterName ?? `${selectedSite?.name ?? snapshot.company?.name ?? "Retail"} POS`,
      defaultRegisterCode: snapshot.setupProfile.defaultRegisterCode ?? (selectedSite ? `${selectedSite.code}-POS` : ""),
    };
  }, [snapshot]);

  const effectiveDraft = draft ?? initialDraft;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!draft) {
      window.localStorage.removeItem(OPERATIONS_DRAFT_KEY);
      return;
    }
    window.localStorage.setItem(OPERATIONS_DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  const selectedSite = useMemo(
    () => snapshot?.sites.find((site) => site.id === effectiveDraft.defaultSiteId) ?? null,
    [effectiveDraft.defaultSiteId, snapshot],
  );

  const siteOptions = useMemo<SearchableOption[]>(
    () =>
      (snapshot?.sites ?? []).map((site) => ({
        value: site.id,
        label: site.name,
        description: site.location ?? undefined,
        meta: `${site.code} · ${site.registerCount} register${site.registerCount === 1 ? "" : "s"}`,
      })),
    [snapshot],
  );

  const saveMutation = useMutation({
    mutationFn: (payload: OperationForm) =>
      fetchJson<OperationsSaveResponse>("/api/v2/retail/setup/operations", {
        method: "PUT",
        body: JSON.stringify({
          defaultSiteId: payload.defaultSiteId,
          defaultRegisterName: payload.defaultRegisterName,
          defaultRegisterCode: payload.defaultRegisterCode || null,
        }),
      }),
    onSuccess: async () => {
      toast({ title: "Retail operations saved", variant: "success" });
      setDraft(null);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(OPERATIONS_DRAFT_KEY);
      }
      await queryClient.invalidateQueries({ queryKey: ["retail-setup-overview"] });
    },
    onError: (error) =>
      toast({
        title: "Unable to save retail operations",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const siteRows = useMemo(
    () =>
      (snapshot?.sites ?? []).map((site) => ({
        id: site.id,
        label: site.name,
        primary: site.registerCount,
        secondary: site.openShiftCount,
      })),
    [snapshot],
  );

  const readinessRows = useMemo(
    () => [
      {
        id: "configured-sites",
        label: "Sites ready",
        value: snapshot?.sites.filter((site) => site.registerCount > 0).length ?? 0,
      },
      {
        id: "sites-missing-registers",
        label: "Sites missing registers",
        value: snapshot ? snapshot.sites.filter((site) => site.registerCount === 0).length : 0,
      },
    ],
    [snapshot],
  );

  return (
    <RetailShell
      title="Operations setup"
      description="Bind a primary branch and register, then provision the default terminal that cashiers will land on."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/setup">
              <ReceiptLong className="h-4 w-4" />
              Overview
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/setup/pos-policy">
              <CheckCircle className="h-4 w-4" />
              POS policy
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/management/master-data">
              <Building2 className="h-4 w-4" />
              Master data
            </Link>
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
        <div className="space-y-6">
          <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Branch load</p>
                <h2 className="mt-1 text-2xl font-semibold text-[var(--text-strong)]">Site to register coverage</h2>
                <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
                  Each branch needs a known register path. The more we standardize this up front, the less humans
                  need to think when the tills are open.
                </p>
              </div>
              <div className="rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Configured sites</p>
                <p className="font-mono text-3xl font-semibold text-[var(--text-strong)]">
                  {snapshot ? `${snapshot.sites.filter((site) => site.registerCount > 0).length}/${snapshot.sites.length}` : "—"}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {snapshot ? "Sites with at least one register" : "Loading branch data"}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.65fr)]">
              <AdminDualBarChart
                rows={siteRows}
                primaryLabel="Registers"
                secondaryLabel="Open shifts"
                height={300}
                valueFormatter={(value) => value.toString()}
                emptyLabel="Branch data is loading"
              />
              <AdminDonutChart
                rows={readinessRows}
                valueLabel="Sites"
                valueFormatter={(value) => value.toString()}
                height={300}
                emptyLabel="Branch data is loading"
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Wizard</p>
                <h3 className="mt-1 text-xl font-semibold text-[var(--text-strong)]">Provision the default terminal</h3>
              </div>
              <div className="rounded-full border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] px-3 py-1 text-xs text-[var(--text-muted)]">
                Saves to provider config
              </div>
            </div>

            <form
              className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]"
              onSubmit={(event) => {
                event.preventDefault();
                if (!effectiveDraft.defaultSiteId) {
                  toast({ title: "Choose a site first", variant: "destructive" });
                  return;
                }
                saveMutation.mutate(effectiveDraft);
              }}
            >
              <div className="space-y-4">
                <SearchableSelect
                  label="Default branch"
                  value={effectiveDraft.defaultSiteId}
                  options={siteOptions}
                  placeholder="Select a branch"
                  searchPlaceholder="Search branches"
                  onValueChange={(value) => setDraft((current) => ({ ...(current ?? EMPTY_FORM), defaultSiteId: value }))}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Register name</Label>
                    <Input
                      value={effectiveDraft.defaultRegisterName}
                      onChange={(event) =>
                        setDraft((current) => ({ ...(current ?? EMPTY_FORM), defaultRegisterName: event.target.value }))
                      }
                      placeholder="Front till"
                      className="h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Register code</Label>
                    <Input
                      value={effectiveDraft.defaultRegisterCode}
                      onChange={(event) =>
                        setDraft((current) => ({ ...(current ?? EMPTY_FORM), defaultRegisterCode: event.target.value }))
                      }
                      placeholder="FRONT-01"
                      className="h-12 font-mono"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] p-4">
                  <div className="flex items-start gap-3">
                    <Server className="mt-1 h-5 w-5 text-[var(--text-muted)]" />
                    <div>
                      <p className="font-medium text-[var(--text-strong)]">What this saves</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        The selected site/register pair becomes the default landing point for setup and the register is
                        provisioned if it does not already exist.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Preview</p>
                  <div className="mt-3 space-y-2">
                    <p className="text-lg font-semibold text-[var(--text-strong)]">
                      {selectedSite?.name ?? "Choose a branch"}
                    </p>
                    <p className="text-sm text-[var(--text-muted)]">
                      {selectedSite ? `${selectedSite.code}${selectedSite.location ? ` · ${selectedSite.location}` : ""}` : "The register will follow the chosen branch."}
                    </p>
                    <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Terminal label</p>
                      <p className="mt-1 font-mono text-base font-semibold text-[var(--text-strong)]">
                        {effectiveDraft.defaultRegisterName || "Front till"}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {effectiveDraft.defaultRegisterCode || "AUTO-CODE"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Selected branch</p>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    {selectedSite
                      ? `${selectedSite.registerCount} register${selectedSite.registerCount === 1 ? "" : "s"} · ${selectedSite.openShiftCount} open shift${selectedSite.openShiftCount === 1 ? "" : "s"}`
                      : "No branch selected yet"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="submit" disabled={saveMutation.isPending || !effectiveDraft.defaultSiteId}>
                      <Plus className="h-4 w-4" />
                      Provision register
                    </Button>
                    <Button asChild variant="outline">
                      <Link href="/retail/setup/branding">Check branding</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[var(--surface-subtle)] p-3 text-[var(--text-strong)]">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Current mapping</p>
                <h3 className="text-lg font-semibold text-[var(--text-strong)]">Known branch/registers</h3>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {(snapshot?.registers ?? []).length === 0 ? (
                <div className="rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] p-4 text-sm text-[var(--text-muted)]">
                  No registers are provisioned yet.
                </div>
              ) : (
                snapshot?.registers.map((register) => (
                  <div key={register.id} className="rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-[var(--text-strong)]">{register.name}</p>
                        <p className="text-sm text-[var(--text-muted)]">{register.site?.name ?? "Unknown branch"}</p>
                      </div>
                      <span className="font-mono text-xs text-[var(--text-muted)]">{register.code}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[var(--surface-subtle)] p-3 text-[var(--text-strong)]">
                <ReceiptLong className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Next up</p>
                <h3 className="text-lg font-semibold text-[var(--text-strong)]">Continue the setup flow</h3>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              {[
                { label: "Receipt branding", href: "/retail/setup/branding" },
                { label: "POS policy", href: "/retail/setup/pos-policy" },
                { label: "Accounting mapping", href: "/retail/setup/accounting" },
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center justify-between rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] px-4 py-3 text-[var(--text-strong)] hover:bg-[var(--surface-base)]"
                >
                  <span>{item.label}</span>
                  <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" />
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </RetailShell>
  );
}


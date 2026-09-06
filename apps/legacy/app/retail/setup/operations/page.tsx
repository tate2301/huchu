"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Card, EmptyState, Skeleton, StatCard } from "@corelithzw/react";
import { AdminDualBarChart, AdminDonutChart } from "@/components/charts/admin-headless-charts";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { SearchableOption } from "@/components/ui/searchable-select";
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
  defaultRegisterId: string;
  newRegisterName: string;
};

const EMPTY_FORM: OperationForm = {
  defaultSiteId: "",
  defaultRegisterId: "",
  newRegisterName: "",
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
        defaultRegisterId: parsed.defaultRegisterId ?? "",
        newRegisterName: parsed.newRegisterName ?? "",
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
      defaultRegisterId:
        selectedSite && snapshot.setupProfile.defaultRegisterId
          ? snapshot.registers.some(
              (register) =>
                register.id === snapshot.setupProfile.defaultRegisterId &&
                register.siteId === selectedSite.id,
            )
            ? snapshot.setupProfile.defaultRegisterId
            : ""
          : "",
      newRegisterName:
        snapshot.setupProfile.defaultRegisterId || !selectedSite
          ? ""
          : snapshot.setupProfile.defaultRegisterName ??
            `${selectedSite.name} POS`,
    };
  }, [snapshot]);

  const rawDraft = draft ?? initialDraft;

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
    () => snapshot?.sites.find((site) => site.id === rawDraft.defaultSiteId) ?? null,
    [rawDraft.defaultSiteId, snapshot],
  );
  const selectedSiteRegisters = useMemo(
    () =>
      (snapshot?.registers ?? []).filter(
        (register) => register.siteId === rawDraft.defaultSiteId,
      ),
    [rawDraft.defaultSiteId, snapshot?.registers],
  );

  /**
   * A register that does not belong to the chosen branch is not a choice, so it is
   * dropped here during render rather than cleared out of state by an effect one
   * render later. `saveMutation` is handed this draft, so the correction reaches
   * the write as well as the screen — the effect only ever fixed what was shown.
   */
  const effectiveDraft = useMemo(() => {
    const registerBelongsToSite =
      !rawDraft.defaultRegisterId ||
      selectedSiteRegisters.some((register) => register.id === rawDraft.defaultRegisterId);
    return registerBelongsToSite ? rawDraft : { ...rawDraft, defaultRegisterId: "" };
  }, [rawDraft, selectedSiteRegisters]);

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
  const registerOptions = useMemo<SearchableOption[]>(
    () =>
      selectedSiteRegisters.map((register) => ({
        value: register.id,
        label: register.name,
        meta: register.code,
      })),
    [selectedSiteRegisters],
  );

  const saveMutation = useMutation({
    mutationFn: (payload: OperationForm) =>
      fetchJson<OperationsSaveResponse>("/api/v2/retail/setup/operations", {
        method: "PUT",
        body: JSON.stringify({
          defaultSiteId: payload.defaultSiteId,
          defaultRegisterId: payload.defaultRegisterId || null,
          newRegisterName: payload.newRegisterName || null,
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

  const actions = (
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
  );

  const description =
    "Bind a primary branch and register, then provision the default terminal that cashiers will land on.";

  if (overviewQuery.isPending) {
    return (
      <RetailShell title="Operations setup" description={description} actions={actions}>
        <div aria-busy="true" aria-live="polite" className="space-y-4">
          <span className="sr-only">Reading branches and registers…</span>
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

  if (overviewQuery.isError) {
    return (
      <RetailShell title="Operations setup" description={description} actions={actions}>
        <Alert tone="danger" title="Branches and registers would not load">
          {getApiErrorMessage(overviewQuery.error)}
        </Alert>
      </RetailShell>
    );
  }

  const readySites = overviewQuery.data.sites.filter((site) => site.registerCount > 0).length;

  return (
    <RetailShell title="Operations setup" description={description} actions={actions}>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Branches ready"
          value={`${readySites}/${overviewQuery.data.sites.length}`}
          tone={readySites === overviewQuery.data.sites.length ? "success" : "warn"}
          footer="With at least one register"
        />
        <StatCard
          label="Registers"
          value={String(overviewQuery.data.registers.length)}
          footer="Terminals a cashier can pick"
        />
        <StatCard
          label="Open shifts"
          value={String(overviewQuery.data.counts.openShifts)}
          footer="Tills trading right now"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
        <div className="space-y-6">
          <Card
            title="Branch to register coverage"
            subtitle="Every branch needs a known register, so nobody has to decide at the counter."
          >
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.65fr)]">
              <AdminDualBarChart
                rows={siteRows}
                primaryLabel="Registers"
                secondaryLabel="Open shifts"
                height={300}
                valueFormatter={(value) => value.toString()}
                emptyLabel="No branches to chart."
              />
              <AdminDonutChart
                rows={readinessRows}
                valueLabel="Sites"
                valueFormatter={(value) => value.toString()}
                height={300}
                emptyLabel="No branch readiness to show."
              />
            </div>
          </Card>

          <Card
            title="Provision the default terminal"
            actions={<Badge tone="neutral">Saves to provider config</Badge>}
          >
            <form
              className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]"
              onSubmit={(event) => {
                event.preventDefault();
                if (!effectiveDraft.defaultSiteId) {
                  toast({ title: "Choose a site first", variant: "destructive" });
                  return;
                }
                if (
                  !effectiveDraft.defaultRegisterId &&
                  !effectiveDraft.newRegisterName.trim()
                ) {
                  toast({
                    title: "Choose or create a register",
                    variant: "destructive",
                  });
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
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...(current ?? EMPTY_FORM),
                      defaultSiteId: value,
                      defaultRegisterId: "",
                    }))
                  }
                />

                <SearchableSelect
                  label="Default register"
                  value={effectiveDraft.defaultRegisterId || undefined}
                  options={registerOptions}
                  placeholder={
                    !selectedSite
                      ? "Select a branch first"
                      : registerOptions.length > 0
                        ? "Choose an existing register"
                        : "No registers on this branch yet"
                  }
                  searchPlaceholder="Search registers"
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...(current ?? EMPTY_FORM),
                      defaultRegisterId: value,
                      newRegisterName: "",
                    }))
                  }
                  disabled={!selectedSite || registerOptions.length === 0}
                />

                <div className="space-y-2">
                  <Label>New register name</Label>
                  <Input
                    value={effectiveDraft.newRegisterName}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...(current ?? EMPTY_FORM),
                        newRegisterName: event.target.value,
                        defaultRegisterId: "",
                      }))
                    }
                    placeholder="Front till"
                    className="h-12"
                  />
                  <p className="t-caption t-muted">
                    Leave this blank if you are choosing one of the existing
                    registers above.
                  </p>
                </div>

                <div className="flex items-start gap-3 border-t border-[color:var(--border-subtle)] pt-4">
                  <Server className="mt-1 h-5 w-5 text-[color:var(--text-muted)]" />
                  <div>
                    <p className="t-body-sm font-medium text-[color:var(--text-strong)]">
                      What this saves
                    </p>
                    <p className="t-body-sm t-muted mt-1">
                      Cashiers will only pick from the registers provisioned here. Register codes
                      are generated automatically behind the scenes.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="t-eyebrow t-muted">Preview</p>
                  <p className="t-section t-strong mt-2">{selectedSite?.name ?? "Choose a branch"}</p>
                  <p className="t-body-sm t-muted">
                    {selectedSite
                      ? `${selectedSite.code}${selectedSite.location ? ` · ${selectedSite.location}` : ""}`
                      : "The register will follow the chosen branch."}
                  </p>
                  <p className="t-body-sm t-muted mt-2">
                    {selectedSite
                      ? `${selectedSite.registerCount} register${selectedSite.registerCount === 1 ? "" : "s"} · ${selectedSite.openShiftCount} open shift${selectedSite.openShiftCount === 1 ? "" : "s"}`
                      : "No branch selected yet"}
                  </p>
                </div>

                <StatCard
                  label="Terminal label"
                  value={
                    selectedSiteRegisters.find(
                      (register) => register.id === effectiveDraft.defaultRegisterId,
                    )?.name ||
                    effectiveDraft.newRegisterName ||
                    "Not chosen"
                  }
                  footer="What the cashier will see"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="submit"
                    disabled={
                      saveMutation.isPending ||
                      !effectiveDraft.defaultSiteId ||
                      (!effectiveDraft.defaultRegisterId &&
                        !effectiveDraft.newRegisterName.trim())
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Save register setup
                  </Button>
                  {draft ? <Badge tone="warn">Unsaved changes</Badge> : null}
                </div>
              </div>
            </form>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card title="Known branches and registers" flush>
            {overviewQuery.data.registers.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="No registers provisioned yet"
                  body="Create one on the left and cashiers will have a terminal to open a shift on."
                />
              </div>
            ) : (
              <ul className="list-plain">
                {overviewQuery.data.registers.map((register) => (
                  <li key={register.id} className="list-item">
                    <span className="lead" aria-hidden="true" />
                    <div>
                      <div className="title bold">{register.name}</div>
                      <div className="sub">{register.site?.name ?? "Unknown branch"}</div>
                    </div>
                    <div className="meta">
                      {overviewQuery.data.setupProfile.defaultRegisterId === register.id ? (
                        <Badge tone="info">Default</Badge>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Continue the setup flow" flush>
            <ul className="list-plain">
              {[
                { label: "Receipt branding", href: "/retail/setup/branding" },
                { label: "POS policy", href: "/retail/setup/pos-policy" },
                { label: "Accounting mapping", href: "/retail/setup/accounting" },
              ].map((item) => (
                <li key={item.label}>
                  <Link href={item.href} className="list-item">
                    <span className="lead" aria-hidden="true" />
                    <div className="title bold">{item.label}</div>
                    <div className="meta">
                      <ArrowRight className="chev h-4 w-4" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </RetailShell>
  );
}


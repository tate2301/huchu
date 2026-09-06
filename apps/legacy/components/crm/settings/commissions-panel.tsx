"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ReportTable, node, type ReportRow } from "@/components/accounting/report-table";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { SegmentedControl } from "@corelithzw/ui/components/segmented-control";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@corelithzw/ui/components/dialog";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus, X } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

import { SetupPanel } from "./setup-chrome";

type Basis = "INVOICED" | "PAID";

type CommissionRule = {
  id: string;
  name: string;
  basis: Basis;
  isActive: boolean;
  tiers: Array<{ thresholdFrom: number; ratePercent: number }>;
};

const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

/** The band bars need a ceiling to be drawn against; the top tier has none. */
const DISPLAY_CEILING = 100_000;

/** What the worked example assumes a rep has brought in, until it is changed. */
const DEFAULT_EXAMPLE_REVENUE = 62_400;

/**
 * Who earns what, and at which thresholds.
 *
 * Two things the artboard adds to what was a create-form with a list under it.
 *
 * The rules become a rail, so the page reads "pick a rule, then read it"
 * rather than "fill in a form, and the rules you already have are underneath".
 *
 * And the maths is spelled out. `thresholdFrom` is a *cumulative* threshold and
 * the rate is *marginal* — 5% from $15,000 does not mean 5% of everything once
 * you pass $15,000, it means 5% of the part above it. That is the one thing
 * about this page people get wrong, and a table of numbers cannot say it. The
 * worked example says it by doing it, against a figure you can change.
 */
export function CommissionsPanel({
  createOpen,
  onCreateOpenChange,
}: {
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exampleRevenue, setExampleRevenue] = useState(String(DEFAULT_EXAMPLE_REVENUE));
  const [newName, setNewName] = useState("");
  const [newBasis, setNewBasis] = useState<Basis>("PAID");

  const rulesQuery = useQuery({
    queryKey: ["crm-commission-rules"],
    queryFn: () =>
      fetchJson<{ data: CommissionRule[] }>("/api/v2/crm/commissions/rules").then((r) => r.data),
  });

  const rules = useMemo(() => rulesQuery.data ?? [], [rulesQuery.data]);

  // Derived rather than synced. `selectedId` is only ever what the reader last
  // pressed; which rule is *shown* falls back to the first one, so a rule
  // deleted elsewhere — or the very first load, before anything is pressed —
  // resolves without an effect writing state back during render.
  const selected = rules.find((rule) => rule.id === selectedId) ?? rules[0] ?? null;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["crm-commission-rules"] });

  const save = useMutation({
    mutationFn: (input: {
      id: string;
      basis?: Basis;
      name?: string;
      tiers?: CommissionRule["tiers"];
    }) =>
      fetchJson(`/api/v2/crm/commissions/rules/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify({ basis: input.basis, name: input.name, tiers: input.tiers }),
      }),
    onSuccess: invalidate,
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const create = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/crm/commissions/rules", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          basis: newBasis,
          tiers: [{ thresholdFrom: 0, ratePercent: 5 }],
        }),
      }),
    onSuccess: () => {
      setNewName("");
      setNewBasis("PAID");
      onCreateOpenChange(false);
      invalidate();
    },
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const tiers = useMemo(
    () => [...(selected?.tiers ?? [])].sort((a, b) => a.thresholdFrom - b.thresholdFrom),
    [selected],
  );

  const patchTiers = (next: CommissionRule["tiers"]) => {
    if (!selected) return;
    save.mutate({ id: selected.id, tiers: next });
  };

  // The ceiling the band bars are drawn against. A rule whose top threshold is
  // already above the default would otherwise produce a negative last band.
  const ceiling = Math.max(DISPLAY_CEILING, Math.round((tiers.at(-1)?.thresholdFrom ?? 0) * 1.25));

  const tierRows: ReportRow[] = tiers.map((tier, index) => {
    const next = tiers[index + 1]?.thresholdFrom ?? null;
    const upper = next ?? ceiling;
    const width = Math.max(0, Math.min(100, ((upper - tier.thresholdFrom) / ceiling) * 100));
    return {
      id: `${tier.thresholdFrom}-${index}`,
      cells: [
        node(
          <Input
            defaultValue={String(tier.thresholdFrom)}
            inputMode="numeric"
            aria-label={`Tier ${index + 1} threshold`}
            className="h-7 font-mono text-sm"
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (!Number.isFinite(value) || value === tier.thresholdFrom) return;
              patchTiers(
                tiers.map((entry, i) => (i === index ? { ...entry, thresholdFrom: value } : entry)),
              );
            }}
          />,
        ),
        node(
          <Input
            defaultValue={String(tier.ratePercent)}
            inputMode="decimal"
            aria-label={`Tier ${index + 1} rate`}
            className="h-7 text-right font-mono text-sm font-bold"
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (!Number.isFinite(value) || value === tier.ratePercent) return;
              patchTiers(
                tiers.map((entry, i) => (i === index ? { ...entry, ratePercent: value } : entry)),
              );
            }}
          />,
        ),
        node(
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-[3px] bg-[var(--surface-muted)]">
              <span
                className="block h-1.5 rounded-[3px] bg-[var(--brand)]"
                style={{ width: `${width}%` }}
              />
            </span>
            <span className="acct-caption shrink-0">
              {next === null
                ? `${money(tier.thresholdFrom)} and up`
                : `${money(tier.thresholdFrom)} – ${money(next)}`}
            </span>
          </span>,
        ),
        node(
          <span className="block truncate text-right font-mono text-sm font-semibold tabular-nums text-[var(--text-strong)]">
            {money(((upper - tier.thresholdFrom) * tier.ratePercent) / 100)}
          </span>,
        ),
        node(
          <Button
            size="sm"
            variant="ghost"
            className="size-6 px-0"
            aria-label={`Remove tier ${index + 1}`}
            disabled={tiers.length <= 1 || save.isPending}
            onClick={() => patchTiers(tiers.filter((_, i) => i !== index))}
          >
            <X aria-hidden="true" className="size-3.5 text-[var(--text-subtle)]" />
          </Button>,
          { align: "right" },
        ),
      ],
    };
  });

  /*
    The marginal maths, done rather than described.

    Each band pays its own rate on only the part of the revenue that falls
    inside it, so a rep on $62,400 under 3 / 5 / 7 / 9 is paid 3% of the first
    $15,000, 5% of the next $25,000 and 7% of what is left — not 7% of
    everything.
  */
  const revenue = Math.max(0, Number(exampleRevenue) || 0);
  const worked: Array<{ band: string; amount: number; rate: number; pay: number }> = [];
  let commissionDue = 0;
  for (let index = 0; index < tiers.length; index += 1) {
    const { thresholdFrom, ratePercent } = tiers[index];
    if (revenue <= thresholdFrom) break;
    const next = tiers[index + 1]?.thresholdFrom ?? Infinity;
    const amount = Math.min(revenue, next) - thresholdFrom;
    const pay = (amount * ratePercent) / 100;
    commissionDue += pay;
    worked.push({
      band:
        next === Infinity
          ? `${money(thresholdFrom)} and up`
          : `${money(thresholdFrom)} – ${money(next)}`,
      amount,
      rate: ratePercent,
      pay,
    });
  }

  if (rulesQuery.isLoading) return <Skeleton className="h-96 w-full" />;

  if (!selected) {
    return (
      <SetupPanel title="Rules">
        <p className="text-sm text-[var(--text-muted)]">
          No commission rules yet. Create one to start paying on revenue.
        </p>
        <CreateRuleDialog
          open={createOpen}
          onOpenChange={onCreateOpenChange}
          name={newName}
          onNameChange={setNewName}
          basis={newBasis}
          onBasisChange={setNewBasis}
          pending={create.isPending}
          onCreate={() => create.mutate()}
        />
      </SetupPanel>
    );
  }

  return (
    <div className="grid min-w-0 gap-2.5 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
      <SetupPanel title="Rules" className="lg:sticky lg:top-3" flush>
        <div className="p-1.5">
          {rules.map((rule) => (
            <button
              key={rule.id}
              type="button"
              onClick={() => setSelectedId(rule.id)}
              aria-current={rule.id === selected.id}
              className={cn(
                "block w-full rounded-[var(--radius-md)] px-2.5 py-2 text-left",
                rule.id === selected.id
                  ? "bg-[var(--brand-soft)]"
                  : "hover:bg-[var(--surface-hover)]",
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "min-w-0 truncate text-sm font-semibold",
                    rule.id === selected.id
                      ? "text-[var(--brand-strong)]"
                      : "text-[var(--text-strong)]",
                  )}
                >
                  {rule.name}
                </span>
                <span
                  className="acct-badge ml-auto shrink-0"
                  data-tone={rule.basis === "PAID" ? "ok" : "warn"}
                >
                  {rule.basis === "PAID" ? "On payment" : "On invoice"}
                </span>
              </span>
              <span className="acct-caption mt-0.5 block">
                {rule.tiers.length} tier{rule.tiers.length === 1 ? "" : "s"}
                {rule.isActive ? "" : " · inactive"}
              </span>
            </button>
          ))}
        </div>
      </SetupPanel>

      <div className="flex min-w-0 flex-col gap-2.5">
        <SetupPanel
          title={selected.name}
          hint="marginal rate from a cumulative revenue threshold"
          flush
        >
          <div className="grid gap-3 px-[13px] py-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="commission-rule-name"
                className="mb-1.5 block text-sm font-semibold text-[var(--text-muted)]"
              >
                Rule name
              </label>
              <Input
                id="commission-rule-name"
                key={selected.id}
                defaultValue={selected.name}
                maxLength={120}
                className="h-[30px] text-sm"
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value && value !== selected.name) {
                    save.mutate({ id: selected.id, name: value });
                  }
                }}
              />
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-semibold text-[var(--text-muted)]">
                Basis
              </span>
              <SegmentedControl
                aria-label="Commission basis"
                value={selected.basis}
                onValueChange={(value) => save.mutate({ id: selected.id, basis: value as Basis })}
                options={[
                  { value: "PAID", label: "On payment received" },
                  { value: "INVOICED", label: "On invoiced amount" },
                ]}
              />
            </div>
          </div>

          <p className="acct-rail-heading px-[13px] pb-1 pt-1.5">Tiers</p>
          <ReportTable
            label={`Tiers in ${selected.name}`}
            tracks="150px 110px minmax(0,1fr) 130px 36px"
            columns={[
              { label: "From revenue" },
              { label: "Rate", align: "right" },
              { label: "Band" },
              { label: "Earned in band", align: "right" },
              { label: "" },
            ]}
            rows={tierRows}
            emptyLabel="This rule has no tiers yet."
          />
          <div className="px-[13px] py-2.5">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={save.isPending}
              onClick={() =>
                patchTiers([
                  ...tiers,
                  {
                    thresholdFrom: (tiers.at(-1)?.thresholdFrom ?? 0) + 10_000,
                    ratePercent: (tiers.at(-1)?.ratePercent ?? 5) + 1,
                  },
                ])
              }
            >
              <Plus aria-hidden="true" className="size-3.5 text-[var(--text-subtle)]" />
              Add tier
            </Button>
          </div>
        </SetupPanel>

        <SetupPanel title="Worked example" hint="the marginal maths, spelled out">
          <div className="mb-2.5 flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
            <span>A rep who has brought in</span>
            <Input
              value={exampleRevenue}
              inputMode="numeric"
              aria-label="Example revenue"
              className="h-7 w-28 font-mono text-sm"
              onChange={(event) => setExampleRevenue(event.target.value)}
            />
            <span>earns, under this rule:</span>
          </div>

          <div className="flex flex-col gap-1.5">
            {worked.map((band) => (
              <div
                key={band.band}
                className="grid min-h-6 items-center gap-2 sm:grid-cols-[minmax(0,200px)_110px_110px_minmax(0,1fr)]"
              >
                <span className="truncate text-sm text-[var(--text-body)]">{band.band}</span>
                <span className="pr-3.5 text-right font-mono text-sm tabular-nums text-[var(--text-muted)]">
                  {money(band.amount)}
                </span>
                <span className="pr-3.5 text-right font-mono text-sm tabular-nums text-[var(--text-muted)]">
                  {band.rate}%
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums text-[var(--text-body)]">
                  {money(band.pay)}
                </span>
              </div>
            ))}
            {worked.length === 0 ? (
              <p className="text-sm text-[var(--text-subtle)]">
                Below the first threshold — nothing is earned yet.
              </p>
            ) : null}
          </div>

          <div className="mt-2.5 grid items-center gap-2 border-t border-[var(--border)] pt-2.5 sm:grid-cols-[minmax(0,200px)_110px_110px_minmax(0,1fr)]">
            <span className="text-sm font-bold text-[var(--text-strong)]">Commission due</span>
            <span className="pr-3.5 text-right font-mono text-sm tabular-nums text-[var(--text-subtle)]">
              {money(revenue)}
            </span>
            <span aria-hidden="true" />
            <span className="font-mono text-base font-bold tabular-nums text-[var(--brand-strong)]">
              {money(commissionDue)}
            </span>
          </div>
        </SetupPanel>
      </div>

      <CreateRuleDialog
        open={createOpen}
        onOpenChange={onCreateOpenChange}
        name={newName}
        onNameChange={setNewName}
        basis={newBasis}
        onBasisChange={setNewBasis}
        pending={create.isPending}
        onCreate={() => create.mutate()}
      />
    </div>
  );
}

/** A new rule starts with one tier at 0; the table is where it is shaped. */
function CreateRuleDialog({
  open,
  onOpenChange,
  name,
  onNameChange,
  basis,
  onBasisChange,
  pending,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (value: string) => void;
  basis: Basis;
  onBasisChange: (value: Basis) => void;
  pending: boolean;
  onCreate: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a commission rule</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            autoFocus
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Standard sales"
            maxLength={120}
            aria-label="Rule name"
          />
          <SegmentedControl
            aria-label="Basis"
            value={basis}
            onValueChange={(value) => onBasisChange(value as Basis)}
            options={[
              { value: "PAID", label: "On payment received" },
              { value: "INVOICED", label: "On invoiced amount" },
            ]}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onCreate} disabled={!name.trim() || pending}>
            {pending ? "Creating…" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

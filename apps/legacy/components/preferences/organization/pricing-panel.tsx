"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Alert, Badge } from "@corelithzw/react";
import { Button } from "@corelithzw/ui/components/button";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { Check, ChevronDown, ChevronRight, Plus } from "@corelithzw/ui/lib/icons";
import { ViewIcon } from "@corelithzw/ui/components/view-icon";
import { cn } from "@corelithzw/ui/lib/utils";

type PricingFeature = {
  key: string;
  name: string;
  description: string;
  monthlyPrice: number;
  isBillable: boolean;
  enabled: boolean;
};

type PricingModule = {
  domain: string;
  features: PricingFeature[];
  enabledCount: number;
  totalCount: number;
  monthlyTotal: number;
  availableTotal: number;
};

type PricingResponse = {
  modules: PricingModule[];
  monthlyTotal: number;
  availableTotal: number;
};

const DOMAIN_LABELS: Record<string, string> = {
  accounting: "Accounting",
  admin: "Administration",
  compliance: "Compliance",
  core: "Platform",
  crm: "CRM",
  gold: "Gold",
  hr: "People & payroll",
  maintenance: "Maintenance",
  ops: "Operations",
  other: "Other",
  portal: "Customer portal",
  reports: "Reporting",
  retail: "Retail",
  schools: "Schools",
  stores: "Stores",
};

function money(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function ModuleRow({ module }: { module: PricingModule }) {
  const [expanded, setExpanded] = useState(false);
  const label = DOMAIN_LABELS[module.domain] ?? module.domain;

  return (
    <li className="border-b border-[var(--border-subtle)] last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-[var(--surface-subtle)]"
      >
        {expanded ? (
          <ChevronDown className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden="true" />
        )}
        <ViewIcon
          id={module.domain}
          label={label}
          className="size-4 shrink-0 text-[var(--text-muted)]"
        />

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{label}</span>
          <span className="block text-sm text-[var(--text-muted)]">
            {module.enabledCount} of {module.totalCount} on
            {module.availableTotal > 0
              ? ` · ${money(module.availableTotal)} more available`
              : ""}
          </span>
        </span>

        <span className="shrink-0 font-mono text-sm">
          {module.monthlyTotal > 0 ? `${money(module.monthlyTotal)}/mo` : "—"}
        </span>
      </button>

      {expanded ? (
        <ul className="space-y-0.5 pb-3 pl-11 pr-1">
          {module.features.map((feature) => (
            <li
              key={feature.key}
              className="flex items-start gap-3 rounded-[var(--radius-sm)] px-2 py-1.5"
            >
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                {feature.enabled ? (
                  <Check
                    className="size-4 text-[var(--status-success-text)]"
                    aria-label="On"
                  />
                ) : (
                  <Plus
                    className="size-3.5 text-[var(--text-subtle)]"
                    aria-label="Available"
                  />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm">{feature.name}</span>
                <span className="block text-sm text-[var(--text-muted)]">
                  {feature.description}
                </span>
              </span>

              <span
                className={cn(
                  "shrink-0 font-mono text-sm",
                  feature.enabled ? "" : "text-[var(--text-muted)]",
                )}
              >
                {feature.isBillable && feature.monthlyPrice > 0
                  ? `${money(feature.monthlyPrice)}/mo`
                  : "Included"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * What the workspace pays for, module by module.
 *
 * The billing page could say what the plan costs and not what made it cost
 * that, which is the question somebody has the month the number moves. This is
 * the itemised answer, with the modules that are off listed at their price —
 * so "what would adding Gold cost" stops being an email to support.
 *
 * Nothing here switches anything on. Turning a module on is a billing decision
 * with a contract behind it, and a one-click purchase inside a settings screen
 * is how somebody buys Surveillance by mis-clicking.
 */
export function PricingPanel() {
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["platform-pricing"],
    queryFn: () => fetchJson<PricingResponse>("/api/v2/platform/pricing"),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (error || !data) {
    return (
      <Alert tone="danger" title="Couldn't load pricing">
        {error ? getApiErrorMessage(error) : "Try again in a moment."}
      </Alert>
    );
  }

  const paying = data.modules.filter((module) => module.monthlyTotal > 0);
  const visible = showAll ? data.modules : paying;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">What you are paying for</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Every module, what is switched on inside it, and what the rest would add.
          </p>
        </div>

        <div className="text-right">
          <p className="font-mono text-xl font-semibold">{money(data.monthlyTotal)}</p>
          <p className="text-sm text-[var(--text-muted)]">per month, before tax</p>
        </div>
      </div>

      {paying.length === 0 ? (
        <Alert tone="info" title="Nothing billable is switched on">
          Everything this workspace uses is included in the base plan.
        </Alert>
      ) : (
        <ul className="rounded-[var(--card-radius)] border border-[var(--border)] px-2">
          {visible.map((module) => (
            <ModuleRow key={module.domain} module={module} />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll
            ? "Show only what is on"
            : `Show everything available (${data.modules.length - paying.length} more)`}
        </Button>

        {data.availableTotal > 0 ? (
          <Badge tone="neutral">
            {money(data.availableTotal)}/mo available but not switched on
          </Badge>
        ) : null}
      </div>

      <p className="text-sm text-[var(--text-muted)]">
        Switching a module on is a billing change — talk to whoever holds the account
        and it will appear here next cycle.
      </p>
    </section>
  );
}

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { SectionAction } from "@/components/management/ui";
import { ViewIcon } from "@/components/ui/view-icon";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Check, ChevronDown, ChevronRight, Plus } from "@/lib/icons";

import {
  FactRow,
  FactRowsSkeleton,
  FormSection,
  LoadFailure,
  NothingHere,
} from "./form-parts";
import styles from "./organization.module.css";

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
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <li className={styles.module}>
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className={styles.moduleButton}
      >
        <span className={styles.moduleGutter}>
          <Chevron className="size-3.5" aria-hidden="true" />
          <ViewIcon id={module.domain} label={label} className="size-3.5" />
        </span>
        <span className={styles.moduleName}>{label}</span>
        <span className={styles.moduleOn}>
          {module.enabledCount}/{module.totalCount}
        </span>
        <span className={styles.modulePrice}>
          {module.monthlyTotal > 0 ? money(module.monthlyTotal) : "—"}
        </span>
      </button>

      {expanded ? (
        <ul className={styles.features}>
          {module.features.map((feature) => (
            <li key={feature.key} className={styles.feature}>
              {/* `role="img"` beside the label: an `aria-label` on a bare
                  <svg> is not reliably announced, and this mark is the only
                  thing on the row that says whether the feature is on. */}
              <span
                className={styles.featureState}
                data-on={feature.enabled ? "true" : "false"}
              >
                {feature.enabled ? (
                  <Check className="size-3.5" role="img" aria-label="On" />
                ) : (
                  <Plus className="size-3" role="img" aria-label="Available" />
                )}
              </span>
              <span className={styles.featureName}>{feature.name}</span>
              <span
                className={styles.featurePrice}
                data-on={feature.enabled ? "true" : "false"}
              >
                {feature.isBillable && feature.monthlyPrice > 0
                  ? money(feature.monthlyPrice)
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
 * is how somebody buys Surveillance by mis-clicking. That is also why this is
 * now reached from Billing's "Change plan" rather than drawn permanently under
 * the plan: it answers a question somebody came with, and `Billing.dc.html`
 * draws a page with two sections on it, not six.
 *
 * Every feature used to carry its `description` under its name — rule 1 says
 * if a control needs explaining its name is wrong, and eighty lines of grey
 * text under eighty feature names is the most expensive way there is to say
 * nothing. The name and the price are what the row is for.
 */
export function PricingPanel() {
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["platform-pricing"],
    queryFn: () => fetchJson<PricingResponse>("/api/v2/platform/pricing"),
  });

  if (isLoading) {
    return (
      <>
        <FormSection>Pricing</FormSection>
        <FactRowsSkeleton rows={4} />
      </>
    );
  }

  if (error || !data) {
    return (
      <LoadFailure
        message={error ? getApiErrorMessage(error) : "Couldn’t load pricing."}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const paying = data.modules.filter((module) => module.monthlyTotal > 0);
  const visible = showAll ? data.modules : paying;

  return (
    <>
      <FormSection
        count={visible.length}
        action={
          data.modules.length > paying.length ? (
            <SectionAction
              aria-expanded={showAll}
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? "Only what is on" : "Everything available"}
            </SectionAction>
          ) : undefined
        }
      >
        Pricing
      </FormSection>

      {visible.length === 0 ? (
        <NothingHere>Nothing billable is switched on</NothingHere>
      ) : (
        <>
          <div className={styles.columns}>
            <span className={styles.columnGutter} />
            <span className={styles.columnRow}>Module</span>
            <span className={styles.columnOn}>On</span>
            <span className={styles.columnPrice}>Per month</span>
          </div>
          <ul className={styles.modules}>
            {visible.map((module) => (
              <ModuleRow key={module.domain} module={module} />
            ))}
          </ul>
        </>
      )}

      <FactRow label="Per month" mono className={styles.total}>
        {money(data.monthlyTotal)}
      </FactRow>
      {data.availableTotal > 0 ? (
        <FactRow label="Available, not on" mono>
          {money(data.availableTotal)}
        </FactRow>
      ) : null}
    </>
  );
}

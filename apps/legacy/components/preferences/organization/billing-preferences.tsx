"use client";

import { useQuery } from "@tanstack/react-query";
import { Alert, Badge, Card, Skeleton, StatCard } from "@corelithzw/react";

import { getApiErrorMessage } from "@/lib/api-client";
import {
  fetchBillingPreferences,
  type BillingPreferences as BillingPreferencesResponse,
} from "@/lib/preferences/api";

import { PricingPanel } from "./pricing-panel";

function formatMoney(value: number | null | undefined, currency = "USD") {
  if (typeof value !== "number" || Number.isNaN(value)) return "Not set";
  const symbol = currency === "USD" ? "$" : currency;
  return `${symbol} ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function healthTone(state: BillingPreferencesResponse["health"]["state"]): "success" | "warn" | "danger" {
  if (state === "ACTIVE") return "success";
  if (state === "EXPIRING_SOON" || state === "IN_GRACE") return "warn";
  return "danger";
}

export function BillingPreferences() {
  const billingQuery = useQuery({
    queryKey: ["preferences", "billing"],
    queryFn: fetchBillingPreferences,
  });

  if (billingQuery.isLoading) {
    return (
      <Card>
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} variant="text" />
          ))}
        </div>
      </Card>
    );
  }

  if (billingQuery.error || !billingQuery.data) {
    return (
      <Alert tone="danger" title="Unable to load billing">
        {getApiErrorMessage(billingQuery.error)}
      </Alert>
    );
  }

  const billing = billingQuery.data;
  const currency = billing.plan?.currency ?? "USD";
  const monthlyAmount =
    billing.subscription?.effectiveMonthlyAmount ?? billing.plan?.monthlyPrice ?? null;

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Offline payments only">
        {billing.payments.guidance}
      </Alert>

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard
          label="Plan"
          value={billing.plan?.name ?? "No plan"}
          delta={billing.subscription?.status ?? billing.health.state}
          tone="neutral"
        />
        <StatCard
          label="Monthly amount"
          value={<span className="t-mono">{formatMoney(monthlyAmount, currency)}</span>}
          delta="Offline billing"
          tone="neutral"
        />
        <StatCard
          label="Next cycle"
          value={<span className="t-mono">{formatDate(billing.subscription?.currentPeriodEnd)}</span>}
          delta={billing.health.daysUntilEnd !== null ? `${billing.health.daysUntilEnd} days` : "No date"}
          tone={billing.health.daysUntilEnd !== null && billing.health.daysUntilEnd <= billing.health.warningDays ? "danger" : "neutral"}
        />
        <StatCard
          label="Status"
          value={<Badge tone={healthTone(billing.health.state)}>{billing.health.status ?? billing.health.state}</Badge>}
          delta={billing.health.reason}
          tone={billing.health.shouldBlock ? "danger" : "neutral"}
        />
      </div>

      <Card title="Plan limits">
        <div className="settings-section">
          <div className="settings-row">
            <div>
              <div className="t-label-sm">Sites</div>
              <p className="t-caption t-muted">Active sites counted against the current plan.</p>
            </div>
            <span className="t-mono">
              {billing.usage.activeSites} / {billing.usage.maxSites ?? "Unlimited"}
            </span>
          </div>
          <div className="settings-row">
            <div>
              <div className="t-label-sm">Users</div>
              <p className="t-caption t-muted">Active users counted against the current plan.</p>
            </div>
            <span className="t-mono">
              {billing.usage.activeUsers} / {billing.usage.maxUsers ?? "Unlimited"}
            </span>
          </div>
          <div className="settings-row">
            <div>
              <div className="t-label-sm">Accepted payment methods</div>
              <p className="t-caption t-muted">Online payments are not enabled for this workspace.</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {billing.payments.methods.map((method) => (
                <Badge key={method} tone="outline">
                  {method}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Add-ons">
        {billing.addons.length > 0 ? (
          <div className="settings-section">
            {billing.addons.map((addon) => (
              <div className="settings-row" key={addon.id}>
                <div>
                  <div className="t-label-sm">{addon.name}</div>
                  <p className="t-caption t-muted">{addon.code}</p>
                </div>
                <span className="t-mono">
                  {formatMoney(addon.monthlyPrice, currency)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="t-body t-muted">No add-ons are enabled for this workspace.</p>
        )}
      </Card>

      {/* The plan says what it costs; this says what made it cost that. */}
      <PricingPanel />
    </div>
  );
}

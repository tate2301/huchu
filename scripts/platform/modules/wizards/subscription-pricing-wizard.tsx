import React, { useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { PlatformServices, SubscriptionHealthSummary, SubscriptionPricingSummary, SubscriptionSummary } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface SubscriptionPricingWizardProps {
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

function companyLabel(subscription: SubscriptionSummary | null): string {
  if (!subscription) return "<none>";
  return subscription.companySlug || subscription.companyName || subscription.companyId;
}

export function SubscriptionPricingWizard({
  services,
  focusCompanyId,
  readOnly,
  setInputLocked,
  onBackToTree,
}: SubscriptionPricingWizardProps) {
  const [step, setStep] = useState(0);
  const [subscriptions, setSubscriptions] = useState<SubscriptionSummary[]>([]);
  const [subscriptionIndex, setSubscriptionIndex] = useState(0);
  const [health, setHealth] = useState<SubscriptionHealthSummary | null>(null);
  const [summary, setSummary] = useState<SubscriptionPricingSummary | null>(null);
  const [confirmDraft, setConfirmDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useInputLock(setInputLocked, true);

  useEffect(() => {
    let ignore = false;
    async function loadSubscriptions() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const rows = await services.subscription.list({
          companyId: focusCompanyId || undefined,
          limit: 100,
        });
        if (!ignore) {
          setSubscriptions(rows);
          setSubscriptionIndex(0);
          setSummary(null);
          setConfirmDraft("");
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load subscriptions.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void loadSubscriptions();
    return () => {
      ignore = true;
    };
  }, [focusCompanyId, services.subscription]);

  const selectedSubscription = subscriptions[subscriptionIndex] ?? null;
  const requiresTypedConfirmation = true;

  useEffect(() => {
    let ignore = false;
    async function loadHealth() {
      if (!selectedSubscription?.companyId) {
        setHealth(null);
        return;
      }
      try {
        const next = await services.subscription.health(selectedSubscription.companyId);
        if (!ignore) setHealth(next);
      } catch {
        if (!ignore) setHealth(null);
      }
    }
    void loadHealth();
    return () => {
      ignore = true;
    };
  }, [selectedSubscription?.companyId, services.subscription]);

  const confirmPhrase = useMemo(
    () => `CONFIRM RECOMPUTE_PRICING ${companyLabel(selectedSubscription)}`,
    [selectedSubscription],
  );

  async function runRecomputePricing() {
    if (!selectedSubscription) return;
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await services.subscription.recomputePricing(selectedSubscription.companyId);
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setSummary(result.resource);
      setSuccessMessage(
        `${result.resource.companySlug}: ${result.resource.totalAmount.toFixed(2)} ${result.resource.currency}/month`,
      );
      setStatusMessage("Pricing recomputed and persisted.");
      setConfirmDraft("");
      setStep(1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to recompute pricing.");
    } finally {
      setLoading(false);
    }
  }

  useInput((input, key) => {
    if (loading) return;

    if (key.escape) {
      if (step === 0) {
        onBackToTree?.();
        return;
      }
      setStep((current) => Math.max(0, current - 1));
      return;
    }

    if (step === 0) {
      if (key.upArrow) setSubscriptionIndex((current) => Math.max(0, current - 1));
      if (key.downArrow) setSubscriptionIndex((current) => Math.min(Math.max(0, subscriptions.length - 1), current + 1));
      if (key.return) setStep(1);
      return;
    }

    if (step === 1) {
      if (key.return) {
        setStep(2);
      }
      return;
    }

    if (step === 2) {
      if (key.return) {
        if (requiresTypedConfirmation && confirmDraft.trim() !== confirmPhrase) {
          setErrorMessage(`Type exact phrase: ${confirmPhrase}`);
          return;
        }
        void runRecomputePricing();
        return;
      }
      if (requiresTypedConfirmation) {
        setConfirmDraft((current) => applyTextInput(current, input, key));
      }
    }
  });

  return (
    <WizardFrame
      title="Recompute Subscription Pricing Wizard"
      description="Recalculate tier + add-ons + billable feature total and persist snapshot."
      step={step}
      steps={["Select Company", "Preview", "Review & Confirm"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={["Keys: Up/Down select, Enter next/submit, Esc back.", loading ? "Working..." : "Esc on first step returns to tree."]}
      body={
        <>
          {step === 0 ? (
            <SelectorList
              items={subscriptions}
              selectedIndex={subscriptionIndex}
              emptyMessage="No subscriptions available."
              render={(item) => `${item.companySlug || item.companyId} | ${item.status} | plan ${item.planCode || "none"}`}
            />
          ) : null}
          {step === 1 ? (
            <>
              <Text>company: {companyLabel(selectedSubscription)}</Text>
              <Text>current plan: {selectedSubscription?.planCode || "<none>"}</Text>
              <Text>
                health: {health?.state || "<unknown>"} {health?.reason ? `| ${health.reason}` : ""}
              </Text>
              {summary ? (
                <>
                  <Text>
                    sites: {summary.siteCount} | included: {summary.tierIncludedSites} | overage:{" "}
                    {summary.tierSiteOverageCount} x {summary.tierSiteOverageRate.toFixed(2)} ={" "}
                    {summary.tierSiteOverageAmount.toFixed(2)}
                  </Text>
                  <Text>
                    addons: base {summary.addonBaseAmount.toFixed(2)} + site {summary.addonSiteAmount.toFixed(2)} ={" "}
                    {summary.addonAmount.toFixed(2)}
                  </Text>
                  <Text>last computed total: {summary.totalAmount.toFixed(2)} {summary.currency}/month</Text>
                  <Text dimColor>line items:</Text>
                  {summary.lineItems.slice(0, 8).map((item) => (
                    <Text key={`${item.type}:${item.code}`} dimColor>
                      - {item.type}: {item.code} ({item.amount.toFixed(2)})
                    </Text>
                  ))}
                </>
              ) : (
                <Text dimColor>No persisted preview loaded in this session yet. Continue to recompute now.</Text>
              )}
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Text>company: {companyLabel(selectedSubscription)}</Text>
              <Text>action: recompute and persist monthly pricing snapshot</Text>
              {requiresTypedConfirmation ? (
                <>
                  <Text color="yellow">Type: {confirmPhrase}</Text>
                  <Text>Input: {confirmDraft || "<waiting>"}</Text>
                </>
              ) : (
                <Text color="yellow">Press Enter to confirm.</Text>
              )}
            </>
          ) : null}
        </>
      }
    />
  );
}

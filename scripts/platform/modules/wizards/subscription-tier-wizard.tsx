import React, { useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { PlatformServices, SubscriptionSummary, TierPlanSummary } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface SubscriptionTierWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

export function SubscriptionTierWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  setInputLocked,
  onBackToTree,
}: SubscriptionTierWizardProps) {
  const [step, setStep] = useState(0);
  const [subscriptions, setSubscriptions] = useState<SubscriptionSummary[]>([]);
  const [plans, setPlans] = useState<TierPlanSummary[]>([]);
  const [subscriptionIndex, setSubscriptionIndex] = useState(0);
  const [planIndex, setPlanIndex] = useState(0);
  const [reason, setReason] = useState("");
  const [confirmDraft, setConfirmDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useInputLock(setInputLocked, true);

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const [subRows, planRows] = await Promise.all([
          services.subscription.list({ companyId: focusCompanyId || undefined, limit: 100 }),
          services.subscription.listPlans(),
        ]);
        if (!ignore) {
          setSubscriptions(subRows);
          setPlans(planRows);
          setSubscriptionIndex(0);
          setPlanIndex(0);
        }
      } catch (error) {
        if (!ignore) setErrorMessage(error instanceof Error ? error.message : "Failed to load data.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void loadData();
    return () => {
      ignore = true;
    };
  }, [focusCompanyId, services.subscription]);

  const selectedSubscription = subscriptions[subscriptionIndex] ?? null;
  const selectedPlan = plans[planIndex] ?? null;
  const requiresTypedConfirmation = true;
  const confirmPhrase = useMemo(
    () => `CONFIRM ASSIGN_TIER ${selectedSubscription?.companySlug || selectedSubscription?.companyId || "company"}`,
    [selectedSubscription?.companyId, selectedSubscription?.companySlug],
  );

  async function runAssignTier() {
    if (!selectedSubscription || !selectedPlan) return;
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await services.subscription.assignTier({
        companyId: selectedSubscription.companyId,
        tierCode: selectedPlan.code,
        actor,
        reason: reason || undefined,
      });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setSuccessMessage(
        `${result.resource.companySlug}: ${result.resource.beforePlanCode || "none"} -> ${result.resource.afterPlanCode}`,
      );
      setStatusMessage("Subscription tier updated.");
      setConfirmDraft("");
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
      if (key.upArrow) setPlanIndex((current) => Math.max(0, current - 1));
      if (key.downArrow) setPlanIndex((current) => Math.min(Math.max(0, plans.length - 1), current + 1));
      if (key.return) setStep(2);
      return;
    }

    if (step === 2) {
      if (key.return) {
        setStep(3);
        return;
      }
      setReason((current) => applyTextInput(current, input, key));
      return;
    }

    if (step === 3) {
      if (key.return) {
        if (requiresTypedConfirmation && confirmDraft.trim() !== confirmPhrase) {
          setErrorMessage(`Type exact phrase: ${confirmPhrase}`);
          return;
        }
        void runAssignTier();
        return;
      }
      if (requiresTypedConfirmation) {
        setConfirmDraft((current) => applyTextInput(current, input, key));
      }
    }
  });

  return (
    <WizardFrame
      title="Assign Subscription Tier Wizard"
      description="Select company, choose tier, and confirm."
      step={step}
      steps={["Select Company", "Select Tier", "Reason", "Review & Confirm"]}
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
              <Text>company: {selectedSubscription?.companySlug || selectedSubscription?.companyId || "<none>"}</Text>
              <SelectorList
                items={plans}
                selectedIndex={planIndex}
                emptyMessage="No tiers available."
                render={(item) =>
                  `${item.code} | ${item.monthlyPrice.toFixed(2)} base | includes ${item.includedSites} site(s) | +${item.additionalSiteMonthlyPrice.toFixed(2)}/site ${item.isActive ? "" : "(inactive)"}`
                }
              />
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Text>company: {selectedSubscription?.companySlug || selectedSubscription?.companyId || "<none>"}</Text>
              <Text>target tier: {selectedPlan?.code || "<none>"}</Text>
              <Text>reason: {reason || "<optional>"}</Text>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <Text>company: {selectedSubscription?.companySlug || selectedSubscription?.companyId || "<none>"}</Text>
              <Text>current tier: {selectedSubscription?.planCode || "<none>"}</Text>
              <Text>target tier: {selectedPlan?.code || "<none>"}</Text>
              <Text>
                tier pricing: {selectedPlan?.monthlyPrice.toFixed(2) || "0.00"} base | includes{" "}
                {selectedPlan?.includedSites ?? 0} site(s) | +{selectedPlan?.additionalSiteMonthlyPrice.toFixed(2) || "0.00"}/site
              </Text>
              <Text>reason: {reason || "<none>"}</Text>
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

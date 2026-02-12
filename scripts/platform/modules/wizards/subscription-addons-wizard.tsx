import React, { useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { AddonBundleSummary, PlatformServices, SubscriptionSummary } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface SubscriptionAddonsWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

type ActionChoice = "ENABLE" | "DISABLE";

function companyLabel(subscription: SubscriptionSummary | null): string {
  if (!subscription) return "<none>";
  return subscription.companySlug || subscription.companyName || subscription.companyId;
}

export function SubscriptionAddonsWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  setInputLocked,
  onBackToTree,
}: SubscriptionAddonsWizardProps) {
  const [step, setStep] = useState(0);
  const [subscriptions, setSubscriptions] = useState<SubscriptionSummary[]>([]);
  const [addons, setAddons] = useState<AddonBundleSummary[]>([]);
  const [subscriptionIndex, setSubscriptionIndex] = useState(0);
  const [addonIndex, setAddonIndex] = useState(0);
  const [actionIndex, setActionIndex] = useState(0);
  const [reason, setReason] = useState("");
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

  useEffect(() => {
    let ignore = false;
    async function loadAddons() {
      if (!selectedSubscription?.companyId) {
        setAddons([]);
        setAddonIndex(0);
        return;
      }
      setLoading(true);
      setErrorMessage(null);
      try {
        const rows = await services.subscription.listAddons({
          companyId: selectedSubscription.companyId,
        });
        if (!ignore) {
          setAddons(rows);
          setAddonIndex(0);
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load add-ons.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void loadAddons();
    return () => {
      ignore = true;
    };
  }, [selectedSubscription?.companyId, services.subscription]);

  const selectedAddon = addons[addonIndex] ?? null;

  useEffect(() => {
    if (!selectedAddon) return;
    setActionIndex(selectedAddon.enabled ? 1 : 0);
  }, [selectedAddon]);

  const actionChoice = (actionIndex === 0 ? "ENABLE" : "DISABLE") as ActionChoice;
  const targetEnabled = actionChoice === "ENABLE";
  const requiresTypedConfirmation = true;
  const confirmPhrase = useMemo(
    () =>
      `CONFIRM SET_ADDON ${companyLabel(selectedSubscription)} ${selectedAddon?.code || "bundle"} ${actionChoice}`,
    [actionChoice, selectedAddon?.code, selectedSubscription],
  );

  async function refreshAddons(companyId: string) {
    const rows = await services.subscription.listAddons({ companyId });
    setAddons(rows);
    setAddonIndex((current) => Math.min(current, Math.max(0, rows.length - 1)));
  }

  async function runSetAddon() {
    if (!selectedSubscription || !selectedAddon) return;
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await services.subscription.setAddon({
        companyId: selectedSubscription.companyId,
        bundleCode: selectedAddon.code,
        enabled: targetEnabled,
        actor,
        reason: reason || undefined,
      });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      await refreshAddons(selectedSubscription.companyId);
      setSuccessMessage(
        `${result.resource.companySlug}: ${result.resource.bundleCode} -> ${result.resource.enabled ? "enabled" : "disabled"}`,
      );
      setStatusMessage("Add-on state updated.");
      setReason("");
      setConfirmDraft("");
      setStep(1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update add-on.");
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
      if (key.upArrow) setAddonIndex((current) => Math.max(0, current - 1));
      if (key.downArrow) setAddonIndex((current) => Math.min(Math.max(0, addons.length - 1), current + 1));
      if (key.return) setStep(2);
      return;
    }

    if (step === 2) {
      if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
        setActionIndex((current) => (current === 0 ? 1 : 0));
        return;
      }
      if (key.return) {
        setStep(3);
      }
      return;
    }

    if (step === 3) {
      if (key.return) {
        setStep(4);
        return;
      }
      setReason((current) => applyTextInput(current, input, key));
      return;
    }

    if (step === 4) {
      if (key.return) {
        if (requiresTypedConfirmation && confirmDraft.trim() !== confirmPhrase) {
          setErrorMessage(`Type exact phrase: ${confirmPhrase}`);
          return;
        }
        void runSetAddon();
        return;
      }
      if (requiresTypedConfirmation) {
        setConfirmDraft((current) => applyTextInput(current, input, key));
      }
    }
  });

  return (
    <WizardFrame
      title="Manage Subscription Add-ons Wizard"
      description="Select company and bundle, choose target state, then confirm."
      step={step}
      steps={["Select Company", "Select Add-on", "Select Action", "Reason", "Review & Confirm"]}
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
              <SelectorList
                items={addons}
                selectedIndex={addonIndex}
                emptyMessage="No add-on bundles available."
                render={(item) =>
                  `${item.code} | ${item.name} | ${item.monthlyPrice.toFixed(2)} base + ${item.additionalSiteMonthlyPrice.toFixed(2)}/site | ${item.enabled ? "enabled" : "disabled"}`
                }
              />
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Text>company: {companyLabel(selectedSubscription)}</Text>
              <Text>bundle: {selectedAddon?.code || "<none>"}</Text>
              <Text>current: {selectedAddon?.enabled ? "enabled" : "disabled"}</Text>
              <SelectorList
                items={["ENABLE", "DISABLE"] as ActionChoice[]}
                selectedIndex={actionIndex}
                emptyMessage="No action."
                render={(item) => item}
              />
            </>
          ) : null}
          {step === 3 ? (
            <>
              <Text>company: {companyLabel(selectedSubscription)}</Text>
              <Text>bundle: {selectedAddon?.code || "<none>"}</Text>
              <Text>
                bundle pricing: {selectedAddon?.monthlyPrice.toFixed(2) || "0.00"} base +{" "}
                {selectedAddon?.additionalSiteMonthlyPrice.toFixed(2) || "0.00"}/site
              </Text>
              <Text>target: {targetEnabled ? "enabled" : "disabled"}</Text>
              <Text>reason: {reason || "<optional>"}</Text>
            </>
          ) : null}
          {step === 4 ? (
            <>
              <Text>company: {companyLabel(selectedSubscription)}</Text>
              <Text>bundle: {selectedAddon?.code || "<none>"}</Text>
              <Text>target: {targetEnabled ? "enabled" : "disabled"}</Text>
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

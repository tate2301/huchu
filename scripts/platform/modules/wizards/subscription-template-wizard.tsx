import React, { useEffect, useState } from "react";
import { Text, useInput } from "ink";

import type { ClientTemplateSummary, PlatformServices, SubscriptionSummary } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface SubscriptionTemplateWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

type ApplyMode = "ADDITIVE" | "REPLACE";

function companyLabel(subscription: SubscriptionSummary | null): string {
  if (!subscription) return "<none>";
  return subscription.companySlug || subscription.companyName || subscription.companyId;
}

export function SubscriptionTemplateWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  setInputLocked,
  onBackToTree,
}: SubscriptionTemplateWizardProps) {
  const [step, setStep] = useState(0);
  const [subscriptions, setSubscriptions] = useState<SubscriptionSummary[]>([]);
  const [templates, setTemplates] = useState<ClientTemplateSummary[]>([]);
  const [subscriptionIndex, setSubscriptionIndex] = useState(0);
  const [templateIndex, setTemplateIndex] = useState(0);
  const [modeIndex, setModeIndex] = useState(0);
  const [reason, setReason] = useState("");
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
        const [subscriptionRows, templateRows] = await Promise.all([
          services.subscription.list({ companyId: focusCompanyId || undefined, limit: 100 }),
          services.subscription.listTemplates(),
        ]);
        if (!ignore) {
          setSubscriptions(subscriptionRows);
          setTemplates(templateRows);
          setSubscriptionIndex(0);
          setTemplateIndex(0);
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load templates.");
        }
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
  const selectedTemplate = templates[templateIndex] ?? null;
  const mode = (modeIndex === 0 ? "ADDITIVE" : "REPLACE") as ApplyMode;

  async function runApplyTemplate() {
    if (!selectedSubscription || !selectedTemplate) return;
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await services.subscription.applyTemplate({
        companyId: selectedSubscription.companyId,
        templateCode: selectedTemplate.code,
        actor,
        mode,
        reason: reason || undefined,
      });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setSuccessMessage(
        `${result.resource.companySlug}: template ${result.resource.templateCode} | tier ${result.resource.beforePlanCode || "none"} -> ${result.resource.afterPlanCode}`,
      );
      setStatusMessage("Subscription template applied.");
      setReason("");
      setStep(1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to apply template.");
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
      if (key.upArrow) setTemplateIndex((current) => Math.max(0, current - 1));
      if (key.downArrow) setTemplateIndex((current) => Math.min(Math.max(0, templates.length - 1), current + 1));
      if (key.return) setStep(2);
      return;
    }

    if (step === 2) {
      if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
        setModeIndex((current) => (current === 0 ? 1 : 0));
        return;
      }
      if (key.return) {
        setStep(3);
      }
      return;
    }

    if (step === 3) {
      if (key.return) {
        void runApplyTemplate();
        return;
      }
      setReason((current) => applyTextInput(current, input, key));
    }
  });

  return (
    <WizardFrame
      title="Apply Client Template Wizard"
      description="Apply a client profile (tier + bundles + feature flags) to a subscription."
      step={step}
      steps={["Select Company", "Select Template", "Apply Mode", "Reason & Apply"]}
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
                items={templates}
                selectedIndex={templateIndex}
                emptyMessage="No templates available."
                render={(item) =>
                  `${item.code} | tier ${item.recommendedTierCode} | ${item.bundleCodes.length} bundles | ${item.featureCount} features`
                }
              />
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Text>company: {companyLabel(selectedSubscription)}</Text>
              <Text>template: {selectedTemplate?.code || "<none>"} ({selectedTemplate?.label || "Unknown"})</Text>
              <SelectorList
                items={["ADDITIVE", "REPLACE"] as ApplyMode[]}
                selectedIndex={modeIndex}
                emptyMessage="No mode."
                render={(item) => item}
              />
            </>
          ) : null}
          {step === 3 ? (
            <>
              <Text>company: {companyLabel(selectedSubscription)}</Text>
              <Text>template: {selectedTemplate?.code || "<none>"} ({selectedTemplate?.label || "Unknown"})</Text>
              <Text>tier target: {selectedTemplate?.recommendedTierCode || "<none>"}</Text>
              <Text>bundles: {selectedTemplate?.bundleCodes.join(", ") || "<none>"}</Text>
              <Text>mode: {mode}</Text>
              <Text>reason: {reason || "<optional>"}</Text>
              <Text color="yellow">Press Enter to apply.</Text>
            </>
          ) : null}
        </>
      }
    />
  );
}

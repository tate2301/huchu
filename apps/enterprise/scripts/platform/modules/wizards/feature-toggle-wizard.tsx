import React, { useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { FeatureSummary, OrganizationListItem, PlatformServices } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface FeatureToggleWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  enable: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

type Step = 0 | 1 | 2 | 3;

export function FeatureToggleWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  enable,
  setInputLocked,
  onBackToTree,
}: FeatureToggleWizardProps) {
  const [step, setStep] = useState<Step>(0);
  const [organizations, setOrganizations] = useState<OrganizationListItem[]>([]);
  const [companyIndex, setCompanyIndex] = useState(0);
  const [features, setFeatures] = useState<FeatureSummary[]>([]);
  const [featureIndex, setFeatureIndex] = useState(0);
  const [reason, setReason] = useState("");
  const [confirmDraft, setConfirmDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useInputLock(setInputLocked, true);

  useEffect(() => {
    let ignore = false;
    async function loadOrganizations() {
      try {
        const rows = await services.org.list({ limit: 100 });
        const filtered = focusCompanyId
          ? rows.filter((row) => row.id === focusCompanyId || row.slug === focusCompanyId)
          : rows;
        if (!ignore) {
          setOrganizations(filtered);
          setCompanyIndex(0);
        }
      } catch (error) {
        if (!ignore) setErrorMessage(error instanceof Error ? error.message : "Failed to load organizations.");
      }
    }
    void loadOrganizations();
    return () => {
      ignore = true;
    };
  }, [focusCompanyId, services.org]);

  const selectedCompany = organizations[companyIndex] ?? null;

  useEffect(() => {
    let ignore = false;
    async function loadFeatures() {
      if (!selectedCompany?.id) {
        setFeatures([]);
        setFeatureIndex(0);
        return;
      }
      try {
        const rows = await services.feature.list({ companyId: selectedCompany.id });
        if (!ignore) {
          setFeatures(rows);
          setFeatureIndex(0);
        }
      } catch (error) {
        if (!ignore) setErrorMessage(error instanceof Error ? error.message : "Failed to load features.");
      }
    }
    void loadFeatures();
    return () => {
      ignore = true;
    };
  }, [selectedCompany?.id, services.feature]);

  const selectedFeature = features[featureIndex] ?? null;
  const actionWord = enable ? "ENABLE" : "DISABLE";
  const requiresTypedConfirmation = false;
  const confirmationPhrase = useMemo(
    () => `CONFIRM ${actionWord} ${selectedFeature?.feature || "feature"}`,
    [actionWord, selectedFeature?.feature],
  );

  async function runSetFeature() {
    if (!selectedCompany || !selectedFeature) return;
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await services.feature.set({
        companyId: selectedCompany.id,
        featureKey: selectedFeature.feature,
        enabled: enable,
        actor,
        reason: reason || undefined,
      });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setSuccessMessage(
        `${result.resource.feature} set to ${String(result.resource.enabled)} for ${selectedCompany.slug}`,
      );
      setStatusMessage("Feature update completed.");
      setConfirmDraft("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Feature update failed.");
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
      setStep((current) => (Math.max(0, current - 1) as Step));
      return;
    }

    if (step === 0) {
      if (key.upArrow) {
        setCompanyIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setCompanyIndex((current) => Math.min(Math.max(0, organizations.length - 1), current + 1));
        return;
      }
      if (key.return) {
        if (!selectedCompany) {
          setErrorMessage("No company selected.");
          return;
        }
        setStep(1);
        setErrorMessage(null);
      }
      return;
    }

    if (step === 1) {
      if (key.upArrow) {
        setFeatureIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setFeatureIndex((current) => Math.min(Math.max(0, features.length - 1), current + 1));
        return;
      }
      if (key.return) {
        if (!selectedFeature) {
          setErrorMessage("No feature selected.");
          return;
        }
        setStep(2);
      }
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
        if (requiresTypedConfirmation && confirmDraft.trim() !== confirmationPhrase) {
          setErrorMessage(`Type exact phrase: ${confirmationPhrase}`);
          return;
        }
        void runSetFeature();
        return;
      }
      if (requiresTypedConfirmation) {
        setConfirmDraft((current) => applyTextInput(current, input, key));
      }
    }
  });

  return (
    <WizardFrame
      title={`${enable ? "Enable" : "Disable"} Feature Wizard`}
      description="Pick company, pick feature, review, and confirm."
      step={step}
      steps={["Select Company", "Select Feature", "Reason", "Review & Confirm"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={["Keys: Up/Down select, Enter next/submit, Esc back.", loading ? "Working..." : "Esc on first step returns to tree."]}
      body={
        <>
          {step === 0 ? (
            <SelectorList
              items={organizations}
              selectedIndex={companyIndex}
              emptyMessage="No organizations available."
              render={(item) => `${item.name} (${item.slug})`}
            />
          ) : null}
          {step === 1 ? (
            <>
              <Text>company: {selectedCompany ? `${selectedCompany.name} (${selectedCompany.slug})` : "<none>"}</Text>
              <SelectorList
                items={features}
                selectedIndex={featureIndex}
                emptyMessage="No features available."
                render={(item) =>
                  `${item.feature} | enabled ${String(item.enabled)} | platform ${String(item.platformActive)}`
                }
              />
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Text>company: {selectedCompany ? selectedCompany.slug : "<none>"}</Text>
              <Text>feature: {selectedFeature?.feature || "<none>"}</Text>
              <Text>reason: {reason || "<optional>"}</Text>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <Text>company: {selectedCompany ? `${selectedCompany.name} (${selectedCompany.slug})` : "<none>"}</Text>
              <Text>feature: {selectedFeature?.feature || "<none>"}</Text>
              <Text>target: {enable ? "enabled" : "disabled"}</Text>
              <Text>reason: {reason || "<none>"}</Text>
              {requiresTypedConfirmation ? (
                <>
                  <Text color="yellow">Type: {confirmationPhrase}</Text>
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

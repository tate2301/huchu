import React, { useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { CatalogSyncResult, PlatformServices } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { WizardFrame } from "./wizard-frame";

interface SubscriptionCatalogSyncWizardProps {
  actor: string;
  services: PlatformServices;
  readOnly: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

export function SubscriptionCatalogSyncWizard({
  actor,
  services,
  readOnly,
  setInputLocked,
  onBackToTree,
}: SubscriptionCatalogSyncWizardProps) {
  const [step, setStep] = useState(0);
  const [confirmDraft, setConfirmDraft] = useState("");
  const [summary, setSummary] = useState<CatalogSyncResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useInputLock(setInputLocked, true);

  const requiresTypedConfirmation = true;
  const confirmPhrase = useMemo(() => `CONFIRM SYNC_CATALOG ${actor}`, [actor]);

  async function runSyncCatalog() {
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await services.subscription.syncCatalog(actor);
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setSummary(result.resource);
      setSuccessMessage(
        `Synced features=${result.resource.features}, bundles=${result.resource.bundles}, tiers=${result.resource.tiers}`,
      );
      setStatusMessage("Commercial catalog synced from code definitions.");
      setConfirmDraft("");
      setStep(0);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Catalog sync failed.");
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
      if (key.return) setStep(1);
      return;
    }

    if (step === 1) {
      if (key.return) {
        if (requiresTypedConfirmation && confirmDraft.trim() !== confirmPhrase) {
          setErrorMessage(`Type exact phrase: ${confirmPhrase}`);
          return;
        }
        void runSyncCatalog();
        return;
      }
      if (requiresTypedConfirmation) {
        setConfirmDraft((current) => applyTextInput(current, input, key));
      }
    }
  });

  return (
    <WizardFrame
      title="Sync Commercial Catalog Wizard"
      description="Sync platform features, bundles, and tier defaults from code catalog."
      step={step}
      steps={["Review", "Confirm & Run"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={["Enter to continue/submit, Esc back.", loading ? "Working..." : "Esc on first step returns to tree."]}
      body={
        <>
          {step === 0 ? (
            <>
              <Text>operation: sync feature catalog, bundle mappings, and tier plan defaults</Text>
              <Text>actor: {actor}</Text>
              <Text>mode: {readOnly ? "read-only (blocked)" : "read-write"}</Text>
              {summary ? (
                <>
                  <Text dimColor>last sync in this session:</Text>
                  <Text dimColor>
                    features={summary.features}, bundles={summary.bundles}, bundleItems={summary.bundleItems}, tiers={summary.tiers}
                  </Text>
                </>
              ) : (
                <Text dimColor>No sync executed in this session yet.</Text>
              )}
            </>
          ) : null}
          {step === 1 ? (
            <>
              <Text>actor: {actor}</Text>
              <Text>action: sync catalog from static definitions</Text>
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

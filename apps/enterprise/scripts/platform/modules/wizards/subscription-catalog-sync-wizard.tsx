import React, { useState } from "react";
import { Text, useInput } from "ink";

import type { CatalogSyncResult, PlatformServices } from "../../types";
import { useInputLock } from "../input-utils";
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
  const [summary, setSummary] = useState<CatalogSyncResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useInputLock(setInputLocked, true);

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
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Catalog sync failed.");
    } finally {
      setLoading(false);
    }
  }

  useInput((input, key) => {
    if (loading) return;

    if (key.escape) {
      onBackToTree?.();
      return;
    }

    if (key.return) {
      void runSyncCatalog();
    }
  });

  return (
    <WizardFrame
      title="Sync Commercial Catalog Wizard"
      description="Sync platform features, bundles, and tier defaults from code catalog."
      step={0}
      steps={["Review & Run"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={["Enter to run, Esc back.", loading ? "Working..." : "Esc returns to tree."]}
      body={
        <>
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
            <Text color="yellow">Press Enter to run sync.</Text>
          </>
        </>
      }
    />
  );
}

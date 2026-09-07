import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { BundleCatalogSummary, PlatformServices } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface SubscriptionBundleFeatureMapWizardProps {
  actor: string;
  services: PlatformServices;
  readOnly: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

type DraftField = "extraFeatureKeys" | "reason";

const DRAFT_FIELDS: DraftField[] = ["extraFeatureKeys", "reason"];

function normalizeFeatureKey(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function parseFeatureKeys(value: string): string[] {
  const tokens = String(value || "")
    .split(/[\s,]+/g)
    .map(normalizeFeatureKey)
    .filter(Boolean);
  return [...new Set(tokens)];
}

function mergeFeatureKeys(...groups: string[][]): string[] {
  const set = new Set<string>();
  for (const group of groups) {
    for (const featureKey of group) {
      const normalized = normalizeFeatureKey(featureKey);
      if (normalized) set.add(normalized);
    }
  }
  return [...set].sort();
}

export function SubscriptionBundleFeatureMapWizard({
  actor,
  services,
  readOnly,
  setInputLocked,
  onBackToTree,
}: SubscriptionBundleFeatureMapWizardProps) {
  const [step, setStep] = useState(0);
  const [bundles, setBundles] = useState<BundleCatalogSummary[]>([]);
  const [bundleIndex, setBundleIndex] = useState(0);
  const [catalogFeatureKeys, setCatalogFeatureKeys] = useState<string[]>([]);
  const [featureIndex, setFeatureIndex] = useState(0);
  const [selectedFeatureKeys, setSelectedFeatureKeys] = useState<string[]>([]);
  const [featureFilter, setFeatureFilter] = useState("");
  const [fieldIndex, setFieldIndex] = useState(0);
  const [draft, setDraft] = useState({
    extraFeatureKeys: "",
    reason: "",
  });
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useInputLock(setInputLocked, true);

  const loadCatalog = useCallback(async (preferredBundleCode?: string) => {
    const [bundleRows, featureRows] = await Promise.all([
      services.subscription.listBundleCatalog(),
      services.feature.list(),
    ]);

    setBundles(bundleRows);
    const allKeys = mergeFeatureKeys(
      featureRows.map((feature) => feature.feature),
      bundleRows.flatMap((bundle) => bundle.featureKeys),
    );
    setCatalogFeatureKeys(allKeys);
    setBundleIndex((current) => {
      if (bundleRows.length === 0) return 0;
      if (preferredBundleCode) {
        const preferred = bundleRows.findIndex((bundle) => bundle.code === preferredBundleCode);
        if (preferred >= 0) return preferred;
      }
      return Math.min(current, bundleRows.length - 1);
    });
  }, [services.feature, services.subscription]);

  useEffect(() => {
    let ignore = false;
    async function run() {
      setLoading(true);
      setErrorMessage(null);
      try {
        await loadCatalog();
      } catch (error) {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load bundle feature catalog.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void run();
    return () => {
      ignore = true;
    };
  }, [loadCatalog]);

  const selectedBundle = bundles[bundleIndex] ?? null;
  const selectedSet = useMemo(() => new Set(selectedFeatureKeys.map(normalizeFeatureKey)), [selectedFeatureKeys]);
  const filterQuery = featureFilter.trim().toLowerCase();
  const visibleFeatureKeys = useMemo(() => {
    const rows = mergeFeatureKeys(catalogFeatureKeys, selectedFeatureKeys);
    if (!filterQuery) return rows;
    return rows.filter((featureKey) => featureKey.includes(filterQuery));
  }, [catalogFeatureKeys, filterQuery, selectedFeatureKeys]);
  const activeFeatureKey = visibleFeatureKeys[featureIndex] ?? null;
  const activeField = DRAFT_FIELDS[fieldIndex] ?? DRAFT_FIELDS[0];

  function hydrateFromBundle(bundle: BundleCatalogSummary) {
    const keys = mergeFeatureKeys(bundle.featureKeys);
    setSelectedFeatureKeys(keys);
    setFeatureFilter("");
    setFeatureIndex(0);
    setFieldIndex(0);
    setDraft({ extraFeatureKeys: "", reason: "" });
  }

  function toggleFeatureKey(featureKey: string) {
    const normalized = normalizeFeatureKey(featureKey);
    if (!normalized) return;
    setSelectedFeatureKeys((current) => {
      const next = new Set(current.map(normalizeFeatureKey));
      if (next.has(normalized)) {
        next.delete(normalized);
      } else {
        next.add(normalized);
      }
      return [...next].sort();
    });
  }

  async function runSave() {
    if (!selectedBundle) {
      setErrorMessage("Select a bundle first.");
      return;
    }
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }

    const extraKeys = parseFeatureKeys(draft.extraFeatureKeys);
    const featureKeys = mergeFeatureKeys(selectedFeatureKeys, extraKeys);
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await services.subscription.setBundleFeatures({
        bundleCode: selectedBundle.code,
        featureKeys,
        actor,
        reason: draft.reason || undefined,
      });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      setSelectedFeatureKeys(mergeFeatureKeys(result.resource.featureKeys));
      setDraft({ extraFeatureKeys: "", reason: "" });
      setStatusMessage("Bundle feature mapping updated.");
      setSuccessMessage(
        `Saved ${result.resource.code} with ${result.resource.featureKeys.length} feature${result.resource.featureKeys.length === 1 ? "" : "s"}.`,
      );
      await loadCatalog(result.resource.code);
      setStep(1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update bundle feature mapping.");
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
      if (key.upArrow) setBundleIndex((current) => Math.max(0, current - 1));
      if (key.downArrow) setBundleIndex((current) => Math.min(Math.max(0, bundles.length - 1), current + 1));
      if (key.return) {
        if (!selectedBundle) {
          setErrorMessage("No bundles available. Create one first.");
          return;
        }
        hydrateFromBundle(selectedBundle);
        setStep(1);
      }
      return;
    }

    if (step === 1) {
      if (key.upArrow) {
        setFeatureIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setFeatureIndex((current) => Math.min(Math.max(0, visibleFeatureKeys.length - 1), current + 1));
        return;
      }
      if (input === " " && activeFeatureKey) {
        toggleFeatureKey(activeFeatureKey);
        return;
      }
      if (key.return || key.rightArrow) {
        setStep(2);
        return;
      }
      if (key.backspace || key.delete) {
        setFeatureFilter((current) => current.slice(0, -1));
        setFeatureIndex(0);
        return;
      }
      if (!key.ctrl && !key.meta && input.length === 1 && input >= " ") {
        setFeatureFilter((current) => `${current}${input}`);
        setFeatureIndex(0);
      }
      return;
    }

    if (step === 2) {
      if (key.upArrow) {
        setFieldIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setFieldIndex((current) => Math.min(DRAFT_FIELDS.length - 1, current + 1));
        return;
      }
      if (key.return) {
        if (activeField === "extraFeatureKeys") {
          setFieldIndex(1);
          return;
        }
        void runSave();
        return;
      }
      setDraft((current) => ({
        ...current,
        [activeField]: applyTextInput(current[activeField], input, key),
      }));
    }
  });

  return (
    <WizardFrame
      title="Bundle Feature Mapping Wizard"
      description="Select a bundle and choose which feature flags it provisions."
      step={step}
      steps={["Select Bundle", "Select Included Features", "Reason & Save"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={[
        "Keys: Up/Down select, Space toggle feature, Enter next/save, Esc back.",
        loading ? "Working..." : "Type in feature list to filter quickly.",
      ]}
      body={
        <>
          {step === 0 ? (
            <SelectorList
              items={bundles}
              selectedIndex={bundleIndex}
              emptyMessage="No bundles available. Use Create/Edit Bundle first."
              render={(item) =>
                `${item.code} | ${item.name} | ${item.featureKeys.length} features | ${item.source} | $${item.monthlyPrice.toFixed(2)}`
              }
            />
          ) : null}

          {step === 1 ? (
            <>
              <Text>
                bundle: {selectedBundle?.code || "<none>"} ({selectedBundle?.name || "Unknown"})
              </Text>
              <Text>
                selected: {selectedFeatureKeys.length} | filter: {featureFilter || "<none>"} | matches: {visibleFeatureKeys.length}
              </Text>
              {visibleFeatureKeys.length === 0 ? (
                <Text dimColor>No features match filter. Type to search, or clear with backspace.</Text>
              ) : (
                <SelectorList
                  items={visibleFeatureKeys}
                  selectedIndex={featureIndex}
                  emptyMessage="No features."
                  render={(item) => `${selectedSet.has(item) ? "[x]" : "[ ]"} ${item}`}
                />
              )}
              <Text dimColor>Tip: custom keys can be added in the next step.</Text>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Text>
                bundle: {selectedBundle?.code || "<none>"} ({selectedBundle?.name || "Unknown"})
              </Text>
              <Text>selected features: {selectedFeatureKeys.length}</Text>
              <Text color={activeField === "extraFeatureKeys" ? "cyan" : undefined}>
                extra feature keys: {draft.extraFeatureKeys || "<optional comma/space separated>"}
              </Text>
              <Text color={activeField === "reason" ? "cyan" : undefined}>reason: {draft.reason || "<optional>"}</Text>
              <Text dimColor>Press Enter on reason to save mapping.</Text>
            </>
          ) : null}
        </>
      }
    />
  );
}

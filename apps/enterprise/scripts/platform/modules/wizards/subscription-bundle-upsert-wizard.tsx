import React, { useEffect, useState } from "react";
import { Text, useInput } from "ink";

import type { BundleCatalogSummary, PlatformServices } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface SubscriptionBundleUpsertWizardProps {
  actor: string;
  services: PlatformServices;
  readOnly: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

type Mode = "CREATE" | "EDIT";
type Field = "code" | "name" | "monthlyPrice" | "additionalSiteMonthlyPrice" | "description" | "isActive" | "reason";

const CREATE_FIELDS: Field[] = ["code", "name", "monthlyPrice", "additionalSiteMonthlyPrice", "description", "isActive", "reason"];
const EDIT_FIELDS: Field[] = ["name", "monthlyPrice", "additionalSiteMonthlyPrice", "description", "isActive", "reason"];

export function SubscriptionBundleUpsertWizard({
  actor,
  services,
  readOnly,
  setInputLocked,
  onBackToTree,
}: SubscriptionBundleUpsertWizardProps) {
  const [step, setStep] = useState(0);
  const [modeIndex, setModeIndex] = useState(0);
  const [bundles, setBundles] = useState<BundleCatalogSummary[]>([]);
  const [bundleIndex, setBundleIndex] = useState(0);
  const [fieldIndex, setFieldIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    code: "ADDON_CUSTOM",
    name: "",
    monthlyPrice: "0",
    additionalSiteMonthlyPrice: "0",
    description: "",
    isActive: true,
    reason: "",
  });

  useInputLock(setInputLocked, true);

  async function loadBundles() {
    const rows = await services.subscription.listBundleCatalog();
    setBundles(rows);
    setBundleIndex((current) => Math.min(current, Math.max(0, rows.length - 1)));
    return rows;
  }

  useEffect(() => {
    let ignore = false;
    async function run() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const rows = await services.subscription.listBundleCatalog();
        if (!ignore) {
          setBundles(rows);
          setBundleIndex(0);
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load bundle catalog.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void run();
    return () => {
      ignore = true;
    };
  }, [services.subscription]);

  const mode = (modeIndex === 0 ? "CREATE" : "EDIT") as Mode;
  const selectedBundle = bundles[bundleIndex] ?? null;
  const fields = mode === "CREATE" ? CREATE_FIELDS : EDIT_FIELDS;
  const activeField = fields[fieldIndex] ?? fields[0];

  function primeDraftFromBundle(bundle: BundleCatalogSummary) {
    setDraft({
      code: bundle.code,
      name: bundle.name,
      monthlyPrice: String(bundle.monthlyPrice),
      additionalSiteMonthlyPrice: String(bundle.additionalSiteMonthlyPrice),
      description: bundle.description ?? "",
      isActive: bundle.isActive,
      reason: "",
    });
  }

  async function runSave() {
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }
    const code = mode === "CREATE" ? draft.code : selectedBundle?.code || draft.code;
    const monthlyPrice = Number(draft.monthlyPrice);
    const additionalSiteMonthlyPrice = Number(draft.additionalSiteMonthlyPrice);
    if (!draft.name.trim()) {
      setErrorMessage("Bundle name is required.");
      return;
    }
    if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0) {
      setErrorMessage("Monthly price must be a valid non-negative number.");
      return;
    }
    if (!Number.isFinite(additionalSiteMonthlyPrice) || additionalSiteMonthlyPrice < 0) {
      setErrorMessage("Additional site monthly price must be a valid non-negative number.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await services.subscription.upsertBundleCatalog({
        code,
        name: draft.name,
        monthlyPrice,
        additionalSiteMonthlyPrice,
        description: draft.description || undefined,
        isActive: draft.isActive,
        actor,
        reason: draft.reason || undefined,
      });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setSuccessMessage(`Saved bundle ${result.resource.code} (${result.resource.name}).`);
      setStatusMessage("Bundle catalog updated.");
      setDraft((current) => ({ ...current, reason: "" }));
      const nextBundles = await loadBundles();
      setModeIndex(1);
      const index = nextBundles.findIndex((bundle) => bundle.code === result.resource.code);
      if (index >= 0) setBundleIndex(index);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save bundle.");
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
      if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
        setModeIndex((current) => (current === 0 ? 1 : 0));
        return;
      }
      if (key.return) {
        if (mode === "EDIT") {
          setStep(1);
          return;
        }
        setFieldIndex(0);
        setStep(2);
      }
      return;
    }

    if (step === 1) {
      if (key.upArrow) setBundleIndex((current) => Math.max(0, current - 1));
      if (key.downArrow) setBundleIndex((current) => Math.min(Math.max(0, bundles.length - 1), current + 1));
      if (key.return) {
        if (!selectedBundle) {
          setErrorMessage("Select a bundle first.");
          return;
        }
        primeDraftFromBundle(selectedBundle);
        setFieldIndex(0);
        setStep(2);
      }
      return;
    }

    if (step === 2) {
      if (key.upArrow) {
        setFieldIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setFieldIndex((current) => Math.min(fields.length - 1, current + 1));
        return;
      }
      if (key.return) {
        void runSave();
        return;
      }
      if (activeField === "isActive") {
        if (key.leftArrow || key.rightArrow || input === " ") {
          setDraft((current) => ({ ...current, isActive: !current.isActive }));
        }
        return;
      }
      if (activeField === "code" && mode !== "CREATE") {
        return;
      }
      setDraft((current) => ({
        ...current,
        [activeField]: applyTextInput(String(current[activeField] ?? ""), input, key),
      }));
    }
  });

  return (
    <WizardFrame
      title="Bundle Catalog Wizard"
      description="Create new bundles or edit existing bundle metadata."
      step={step}
      steps={["Choose Mode", "Select Bundle", "Edit & Save"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={["Keys: Up/Down select, Enter next/save, Esc back.", loading ? "Working..." : "No typed confirmation required."]}
      body={
        <>
          {step === 0 ? (
            <SelectorList
              items={["CREATE", "EDIT"] as Mode[]}
              selectedIndex={modeIndex}
              emptyMessage="No mode."
              render={(item) => (item === "CREATE" ? "Create New Bundle" : "Edit Existing Bundle")}
            />
          ) : null}
          {step === 1 ? (
            <SelectorList
              items={bundles}
              selectedIndex={bundleIndex}
              emptyMessage="No bundles available."
              render={(item) =>
                `${item.code} | ${item.name} | ${item.monthlyPrice.toFixed(2)} + ${item.additionalSiteMonthlyPrice.toFixed(2)}/site | ${item.featureKeys.length} features | ${item.source}`
              }
            />
          ) : null}
          {step === 2 ? (
            <>
              <Text color={activeField === "code" ? "cyan" : undefined}>code: {mode === "CREATE" ? draft.code || "<required>" : selectedBundle?.code || draft.code}</Text>
              <Text color={activeField === "name" ? "cyan" : undefined}>name: {draft.name || "<required>"}</Text>
              <Text color={activeField === "monthlyPrice" ? "cyan" : undefined}>monthlyPrice: {draft.monthlyPrice || "0"}</Text>
              <Text color={activeField === "additionalSiteMonthlyPrice" ? "cyan" : undefined}>
                additionalSiteMonthlyPrice: {draft.additionalSiteMonthlyPrice || "0"}
              </Text>
              <Text color={activeField === "description" ? "cyan" : undefined}>description: {draft.description || "<none>"}</Text>
              <Text color={activeField === "isActive" ? "cyan" : undefined}>isActive: {String(draft.isActive)}</Text>
              <Text color={activeField === "reason" ? "cyan" : undefined}>reason: {draft.reason || "<optional>"}</Text>
              <Text dimColor>Tip: use Left/Right/Space to toggle active state.</Text>
              <Text color="yellow">Press Enter to save.</Text>
            </>
          ) : null}
        </>
      }
    />
  );
}

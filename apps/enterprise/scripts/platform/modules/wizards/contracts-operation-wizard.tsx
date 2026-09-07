import React, { useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { ContractEvaluationResult, PlatformServices } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

type ContractsOperationId = "contract.enforce" | "contract.override";

interface ContractsOperationWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  operationId: ContractsOperationId;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

export function ContractsOperationWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  operationId,
  setInputLocked,
  onBackToTree,
}: ContractsOperationWizardProps) {
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<ContractEvaluationResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [reason, setReason] = useState("");
  const [confirmDraft, setConfirmDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useInputLock(setInputLocked, true);

  useEffect(() => {
    let ignore = false;
    async function loadRows() {
      setLoading(true);
      try {
        const companies = await services.org.list({ limit: 100 });
        const filteredCompanies = focusCompanyId
          ? companies.filter((company) => company.id === focusCompanyId || company.slug === focusCompanyId)
          : companies;
        const evaluations = await Promise.all(
          filteredCompanies.map(async (company) => {
            const result = await services.contract.evaluate({ companyId: company.id });
            if (!result.ok) {
              throw new Error(result.message);
            }
            return result.resource;
          }),
        );
        if (!ignore) {
          setRows(evaluations);
          setSelectedIndex(0);
        }
      } catch (error) {
        if (!ignore) setErrorMessage(error instanceof Error ? error.message : "Failed to load contracts.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void loadRows();
    return () => {
      ignore = true;
    };
  }, [focusCompanyId, services.contract, services.org]);

  const selected = rows[selectedIndex] ?? null;
  const isOverride = operationId === "contract.override";
  const requiresTypedConfirmation = false;
  const steps = isOverride
    ? ["Select Company", "Override Reason", "Review & Confirm"]
    : ["Select Company", "Review & Confirm"];
  const confirmPhrase = useMemo(() => {
    return `${isOverride ? "CONFIRM OVERRIDE" : "CONFIRM ENFORCE"} ${selected?.companySlug || "company"}`;
  }, [isOverride, selected?.companySlug]);

  async function runOperation() {
    if (!selected) return;
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      if (isOverride) {
        if (!reason.trim()) {
          setErrorMessage("Override reason is required.");
          return;
        }
        const result = await services.contract.override({
          companyId: selected.companyId,
          actor,
          reason: reason.trim(),
        });
        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }
        setSuccessMessage(`Override applied for ${result.resource.companySlug}`);
        setStatusMessage("Contract override completed.");
      } else {
        const result = await services.contract.enforce({
          companyId: selected.companyId,
          actor,
          reason: reason.trim() || "Manual enforcement from wizard",
        });
        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }
        setSuccessMessage(
          `${result.resource.companySlug}: ${result.resource.beforeState} -> ${result.resource.afterState}`,
        );
        setStatusMessage("Contract enforcement completed.");
      }
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
      if (key.upArrow) {
        setSelectedIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((current) => Math.min(Math.max(0, rows.length - 1), current + 1));
        return;
      }
      if (key.return) {
        setStep(isOverride ? 1 : 1);
      }
      return;
    }

    if (isOverride && step === 1) {
      if (key.return) {
        setStep(2);
        return;
      }
      setReason((current) => applyTextInput(current, input, key));
      return;
    }

    if (!isOverride && step === 1) {
      if (key.return) {
        if (requiresTypedConfirmation && confirmDraft.trim() !== confirmPhrase) {
          setErrorMessage(`Type exact phrase: ${confirmPhrase}`);
          return;
        }
        void runOperation();
        return;
      }
      if (requiresTypedConfirmation) {
        setConfirmDraft((current) => applyTextInput(current, input, key));
      }
      return;
    }

    if (isOverride && step === 2) {
      if (key.return) {
        if (requiresTypedConfirmation && confirmDraft.trim() !== confirmPhrase) {
          setErrorMessage(`Type exact phrase: ${confirmPhrase}`);
          return;
        }
        void runOperation();
        return;
      }
      if (requiresTypedConfirmation) {
        setConfirmDraft((current) => applyTextInput(current, input, key));
      }
    }
  });

  return (
    <WizardFrame
      title={isOverride ? "Contract Override Wizard" : "Contract Enforce Wizard"}
      description="Guided contract operation."
      step={step}
      steps={steps}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={[
        "Keys: Up/Down select, Enter next/submit, Esc back.",
        loading ? "Working..." : "Esc on first step returns to tree.",
      ]}
      body={
        <>
          {step === 0 ? (
            <SelectorList
              items={rows}
              selectedIndex={selectedIndex}
              emptyMessage="No contracts available."
              render={(item) =>
                `${item.companySlug} | current ${item.currentState} | recommended ${item.recommendedState} | sub ${item.subscriptionStatus || "none"}`
              }
            />
          ) : null}
          {isOverride && step === 1 ? (
            <>
              <Text>company: {selected?.companySlug || "<none>"}</Text>
              <Text>reason: {reason || "<required>"}</Text>
            </>
          ) : null}
          {((!isOverride && step === 1) || (isOverride && step === 2)) ? (
            <>
              <Text>company: {selected?.companySlug || "<none>"}</Text>
              <Text>operation: {isOverride ? "override" : "enforce"}</Text>
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

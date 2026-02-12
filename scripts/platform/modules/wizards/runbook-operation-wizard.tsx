import React, { useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { OrganizationListItem, PlatformServices, RunbookDefinitionRecord } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

type RunbookOperationId = "runbook.create" | "runbook.execute";

interface RunbookOperationWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  operationId: RunbookOperationId;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

interface ScopeItem {
  id: string;
  label: string;
  companyId?: string;
}

const GLOBAL_SCOPE_ID = "__GLOBAL__";

export function RunbookOperationWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  operationId,
  setInputLocked,
  onBackToTree,
}: RunbookOperationWizardProps) {
  const isCreate = operationId === "runbook.create";
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [scopeItems, setScopeItems] = useState<ScopeItem[]>([]);
  const [scopeIndex, setScopeIndex] = useState(0);
  const [runbooks, setRunbooks] = useState<RunbookDefinitionRecord[]>([]);
  const [runbookIndex, setRunbookIndex] = useState(0);
  const [dryRun, setDryRun] = useState(true);
  const [confirmDraft, setConfirmDraft] = useState("");
  const [fieldIndex, setFieldIndex] = useState(0);
  const [draft, setDraft] = useState({
    name: "",
    actionType: "support.expire-sessions",
    schedule: "",
    riskLevel: "LOW",
    enabled: "true",
  });

  const createFields = ["name", "actionType", "schedule", "riskLevel", "enabled"] as const;

  useInputLock(setInputLocked, true);

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const [orgRows, runbookRows] = await Promise.all([
          services.org.list({ limit: 100 }),
          services.runbook.listDefinitions(focusCompanyId || undefined),
        ]);
        if (ignore) return;
        const filteredOrgs = focusCompanyId
          ? orgRows.filter((row) => row.id === focusCompanyId || row.slug === focusCompanyId)
          : orgRows;
        const nextScopeItems: ScopeItem[] = [{ id: GLOBAL_SCOPE_ID, label: "Global (no company scope)" }];
        nextScopeItems.push(
          ...filteredOrgs.map((row: OrganizationListItem) => ({
            id: row.id,
            label: `${row.name} (${row.slug})`,
            companyId: row.id,
          })),
        );
        setScopeItems(nextScopeItems);
        setScopeIndex(0);
        setRunbooks(runbookRows);
        setRunbookIndex(0);
      } catch (error) {
        if (!ignore) setErrorMessage(error instanceof Error ? error.message : "Failed to load runbook data.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void loadData();
    return () => {
      ignore = true;
    };
  }, [focusCompanyId, services.org, services.runbook]);

  const selectedScope = scopeItems[scopeIndex] ?? null;
  const selectedRunbook = runbooks[runbookIndex] ?? null;
  const requiresTypedConfirmation = false;
  const confirmPhrase = useMemo(() => {
    if (isCreate) {
      return `CONFIRM CREATE_RUNBOOK ${draft.name || "runbook"}`;
    }
    return `CONFIRM EXECUTE_RUNBOOK ${selectedRunbook?.id || "runbook"}`;
  }, [draft.name, isCreate, selectedRunbook?.id]);

  async function runOperation() {
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      if (isCreate) {
        if (!draft.name.trim()) {
          setErrorMessage("Runbook name is required.");
          return;
        }
        const result = await services.runbook.upsertDefinition({
          name: draft.name.trim(),
          companyId: selectedScope?.companyId,
          actionType: draft.actionType.trim(),
          schedule: draft.schedule.trim() || undefined,
          riskLevel: draft.riskLevel as "LOW" | "MEDIUM" | "HIGH",
          enabled: draft.enabled.toLowerCase() !== "false",
          createdBy: actor,
        });
        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }
        setSuccessMessage(`Created runbook ${result.resource.name}`);
        setStatusMessage("Runbook created.");
      } else {
        if (!selectedRunbook) {
          setErrorMessage("No runbook selected.");
          return;
        }
        const result = await services.runbook.execute({
          runbookId: selectedRunbook.id,
          actor,
          dryRun,
        });
        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }
        setSuccessMessage(`Executed runbook ${selectedRunbook.name} (${dryRun ? "dry-run" : "live"})`);
        setStatusMessage("Runbook execution completed.");
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
      if (isCreate) {
        if (key.upArrow) setScopeIndex((current) => Math.max(0, current - 1));
        if (key.downArrow) setScopeIndex((current) => Math.min(Math.max(0, scopeItems.length - 1), current + 1));
      } else {
        if (key.upArrow) setRunbookIndex((current) => Math.max(0, current - 1));
        if (key.downArrow) setRunbookIndex((current) => Math.min(Math.max(0, runbooks.length - 1), current + 1));
      }
      if (key.return) setStep(1);
      return;
    }

    if (step === 1) {
      if (isCreate) {
        if (key.upArrow) setFieldIndex((current) => Math.max(0, current - 1));
        if (key.downArrow) setFieldIndex((current) => Math.min(createFields.length - 1, current + 1));
        if (key.return) {
          setStep(2);
          return;
        }
        const field = createFields[fieldIndex];
        setDraft((current) => ({ ...current, [field]: applyTextInput(current[field], input, key) }));
        return;
      }
      if (key.return) {
        setStep(2);
        return;
      }
      if (input.toLowerCase() === "t") {
        setDryRun((current) => !current);
      }
      return;
    }

    if (step === 2) {
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
      title={isCreate ? "Create Runbook Wizard" : "Execute Runbook Wizard"}
      description="Guided runbook operation."
      step={step}
      steps={isCreate ? ["Select Scope", "Runbook Details", "Review & Confirm"] : ["Select Runbook", "Execution Mode", "Review & Confirm"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={[
        "Keys: Up/Down select, Enter next/submit, Esc back.",
        isCreate ? "Fill runbook fields in step 2." : "Press t in step 2 to toggle dry-run.",
      ]}
      body={
        <>
          {step === 0 && isCreate ? (
            <SelectorList
              items={scopeItems}
              selectedIndex={scopeIndex}
              emptyMessage="No scope options available."
              render={(item) => item.label}
            />
          ) : null}
          {step === 0 && !isCreate ? (
            <SelectorList
              items={runbooks}
              selectedIndex={runbookIndex}
              emptyMessage="No runbooks available."
              render={(item) => `${item.name} | ${item.actionType} | ${item.riskLevel} | ${item.enabled ? "enabled" : "disabled"}`}
            />
          ) : null}

          {step === 1 && isCreate ? (
            <>
              <Text>scope: {selectedScope?.label || "<none>"}</Text>
              <Text color={fieldIndex === 0 ? "cyan" : undefined}>name: {draft.name || "<required>"}</Text>
              <Text color={fieldIndex === 1 ? "cyan" : undefined}>actionType: {draft.actionType || "<required>"}</Text>
              <Text color={fieldIndex === 2 ? "cyan" : undefined}>schedule: {draft.schedule || "<optional>"}</Text>
              <Text color={fieldIndex === 3 ? "cyan" : undefined}>riskLevel: {draft.riskLevel || "LOW"}</Text>
              <Text color={fieldIndex === 4 ? "cyan" : undefined}>enabled: {draft.enabled || "true"}</Text>
            </>
          ) : null}
          {step === 1 && !isCreate ? (
            <>
              <Text>runbook: {selectedRunbook?.name || "<none>"}</Text>
              <Text>dryRun: {String(dryRun)} (press t to toggle)</Text>
            </>
          ) : null}

          {step === 2 ? (
            <>
              {isCreate ? (
                <>
                  <Text>scope: {selectedScope?.label || "<none>"}</Text>
                  <Text>name: {draft.name || "<none>"}</Text>
                  <Text>actionType: {draft.actionType || "<none>"}</Text>
                  <Text>schedule: {draft.schedule || "<none>"}</Text>
                  <Text>riskLevel: {draft.riskLevel || "LOW"}</Text>
                  <Text>enabled: {draft.enabled || "true"}</Text>
                </>
              ) : (
                <>
                  <Text>runbook: {selectedRunbook?.name || "<none>"}</Text>
                  <Text>dryRun: {String(dryRun)}</Text>
                </>
              )}
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

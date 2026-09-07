import React, { useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import { RISK_LEVELS, type OrganizationListItem, type PlatformServices, type RunbookDefinitionRecord, type RiskLevel } from "../../types";
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
const CUSTOM_ACTION_TYPE = "__CUSTOM_ACTION_TYPE__";
const ACTION_TYPE_OPTIONS = ["support.expire-sessions", "contract.enforce", CUSTOM_ACTION_TYPE] as const;
const EXECUTION_MODE_OPTIONS = ["DRY_RUN", "LIVE"] as const;
const ENABLED_OPTIONS = ["ENABLED", "DISABLED"] as const;

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

  const [name, setName] = useState("");
  const [actionTypeIndex, setActionTypeIndex] = useState(0);
  const [customActionType, setCustomActionType] = useState("");
  const [schedule, setSchedule] = useState("");
  const [riskIndex, setRiskIndex] = useState(0);
  const [enabledIndex, setEnabledIndex] = useState(0);
  const [executionModeIndex, setExecutionModeIndex] = useState(0);
  const [confirmDraft, setConfirmDraft] = useState("");

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
  const selectedActionTypeOption = ACTION_TYPE_OPTIONS[actionTypeIndex] ?? ACTION_TYPE_OPTIONS[0];
  const selectedRisk = (RISK_LEVELS[riskIndex] ?? RISK_LEVELS[0]) as RiskLevel;
  const selectedEnabled = ENABLED_OPTIONS[enabledIndex] ?? ENABLED_OPTIONS[0];
  const selectedExecutionMode = EXECUTION_MODE_OPTIONS[executionModeIndex] ?? EXECUTION_MODE_OPTIONS[0];
  const resolvedActionType = selectedActionTypeOption === CUSTOM_ACTION_TYPE ? customActionType.trim() : selectedActionTypeOption;
  const dryRun = selectedExecutionMode === "DRY_RUN";

  const requiresTypedConfirmation = false;
  const confirmPhrase = useMemo(() => {
    if (isCreate) {
      return `CONFIRM CREATE_RUNBOOK ${name || "runbook"}`;
    }
    return `CONFIRM EXECUTE_RUNBOOK ${selectedRunbook?.id || "runbook"}`;
  }, [isCreate, name, selectedRunbook?.id]);

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
        if (!name.trim()) {
          setErrorMessage("Runbook name is required.");
          return;
        }
        if (!resolvedActionType) {
          setErrorMessage("Action type is required.");
          return;
        }
        const result = await services.runbook.upsertDefinition({
          name: name.trim(),
          companyId: selectedScope?.companyId,
          actionType: resolvedActionType,
          schedule: schedule.trim() || undefined,
          riskLevel: selectedRisk,
          enabled: selectedEnabled === "ENABLED",
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
      if (isCreate && step === 4 && selectedActionTypeOption !== CUSTOM_ACTION_TYPE) {
        setStep(2);
        return;
      }
      setStep((current) => Math.max(0, current - 1));
      return;
    }

    if (isCreate) {
      if (step === 0) {
        if (key.upArrow) setScopeIndex((current) => Math.max(0, current - 1));
        if (key.downArrow) setScopeIndex((current) => Math.min(Math.max(0, scopeItems.length - 1), current + 1));
        if (key.return) setStep(1);
        return;
      }

      if (step === 1) {
        if (key.return) {
          if (!name.trim()) {
            setErrorMessage("Runbook name is required.");
            return;
          }
          setStep(2);
          return;
        }
        setName((current) => applyTextInput(current, input, key));
        return;
      }

      if (step === 2) {
        if (key.upArrow) setActionTypeIndex((current) => Math.max(0, current - 1));
        if (key.downArrow) setActionTypeIndex((current) => Math.min(Math.max(0, ACTION_TYPE_OPTIONS.length - 1), current + 1));
        if (key.return) {
          if (selectedActionTypeOption === CUSTOM_ACTION_TYPE) {
            setStep(3);
            return;
          }
          setStep(4);
        }
        return;
      }

      if (step === 3) {
        if (key.return) {
          if (!customActionType.trim()) {
            setErrorMessage("Custom action type is required.");
            return;
          }
          setStep(4);
          return;
        }
        setCustomActionType((current) => applyTextInput(current, input, key));
        return;
      }

      if (step === 4) {
        if (key.return) {
          setStep(5);
          return;
        }
        setSchedule((current) => applyTextInput(current, input, key));
        return;
      }

      if (step === 5) {
        if (key.upArrow) setRiskIndex((current) => Math.max(0, current - 1));
        if (key.downArrow) setRiskIndex((current) => Math.min(Math.max(0, RISK_LEVELS.length - 1), current + 1));
        if (key.return) setStep(6);
        return;
      }

      if (step === 6) {
        if (key.upArrow) setEnabledIndex((current) => Math.max(0, current - 1));
        if (key.downArrow) setEnabledIndex((current) => Math.min(Math.max(0, ENABLED_OPTIONS.length - 1), current + 1));
        if (key.return) setStep(7);
        return;
      }

      if (step === 7) {
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
      return;
    }

    if (step === 0) {
      if (key.upArrow) setRunbookIndex((current) => Math.max(0, current - 1));
      if (key.downArrow) setRunbookIndex((current) => Math.min(Math.max(0, runbooks.length - 1), current + 1));
      if (key.return) setStep(1);
      return;
    }

    if (step === 1) {
      if (key.upArrow) setExecutionModeIndex((current) => Math.max(0, current - 1));
      if (key.downArrow) setExecutionModeIndex((current) => Math.min(Math.max(0, EXECUTION_MODE_OPTIONS.length - 1), current + 1));
      if (key.return) setStep(2);
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

  const createSteps = ["Select Scope", "Runbook Name", "Select Action Type", "Custom Action Type", "Schedule", "Select Risk Level", "Select Enabled", "Review & Confirm"];

  return (
    <WizardFrame
      title={isCreate ? "Create Runbook Wizard" : "Execute Runbook Wizard"}
      description="Guided runbook operation."
      step={step}
      steps={isCreate ? createSteps : ["Select Runbook", "Execution Mode", "Review & Confirm"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={[
        "Keys: Up/Down select, Enter next/submit, Esc back.",
        isCreate ? "Enumerables are list-selected. Use custom mode only when needed." : "Choose execution mode from list.",
      ]}
      body={
        <>
          {isCreate && step === 0 ? (
            <SelectorList
              items={scopeItems}
              selectedIndex={scopeIndex}
              emptyMessage="No scope options available."
              render={(item) => item.label}
            />
          ) : null}
          {isCreate && step === 1 ? (
            <>
              <Text>scope: {selectedScope?.label || "<none>"}</Text>
              <Text>name: {name || "<required>"}</Text>
            </>
          ) : null}
          {isCreate && step === 2 ? (
            <>
              <Text>scope: {selectedScope?.label || "<none>"}</Text>
              <Text>name: {name || "<none>"}</Text>
              <SelectorList
                items={[...ACTION_TYPE_OPTIONS]}
                selectedIndex={actionTypeIndex}
                emptyMessage="No action types."
                render={(item) => (item === CUSTOM_ACTION_TYPE ? "Custom actionType..." : item)}
              />
            </>
          ) : null}
          {isCreate && step === 3 ? (
            <>
              <Text>actionType mode: custom</Text>
              <Text>custom actionType: {customActionType || "<required>"}</Text>
            </>
          ) : null}
          {isCreate && step === 4 ? (
            <>
              <Text>actionType: {resolvedActionType || "<none>"}</Text>
              <Text>schedule: {schedule || "<optional>"}</Text>
            </>
          ) : null}
          {isCreate && step === 5 ? (
            <>
              <Text>actionType: {resolvedActionType || "<none>"}</Text>
              <SelectorList
                items={[...RISK_LEVELS]}
                selectedIndex={riskIndex}
                emptyMessage="No risk levels."
                render={(item) => item}
              />
            </>
          ) : null}
          {isCreate && step === 6 ? (
            <>
              <Text>riskLevel: {selectedRisk}</Text>
              <SelectorList
                items={[...ENABLED_OPTIONS]}
                selectedIndex={enabledIndex}
                emptyMessage="No enabled states."
                render={(item) => item}
              />
            </>
          ) : null}
          {isCreate && step === 7 ? (
            <>
              <Text>scope: {selectedScope?.label || "<none>"}</Text>
              <Text>name: {name || "<none>"}</Text>
              <Text>actionType: {resolvedActionType || "<none>"}</Text>
              <Text>schedule: {schedule || "<none>"}</Text>
              <Text>riskLevel: {selectedRisk}</Text>
              <Text>enabled: {selectedEnabled === "ENABLED" ? "true" : "false"}</Text>
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

          {!isCreate && step === 0 ? (
            <SelectorList
              items={runbooks}
              selectedIndex={runbookIndex}
              emptyMessage="No runbooks available."
              render={(item) => `${item.name} | ${item.actionType} | ${item.riskLevel} | ${item.enabled ? "enabled" : "disabled"}`}
            />
          ) : null}
          {!isCreate && step === 1 ? (
            <>
              <Text>runbook: {selectedRunbook?.name || "<none>"}</Text>
              <SelectorList
                items={[...EXECUTION_MODE_OPTIONS]}
                selectedIndex={executionModeIndex}
                emptyMessage="No execution modes."
                render={(item) => item}
              />
            </>
          ) : null}
          {!isCreate && step === 2 ? (
            <>
              <Text>runbook: {selectedRunbook?.name || "<none>"}</Text>
              <Text>mode: {selectedExecutionMode}</Text>
              <Text>dryRun: {String(dryRun)}</Text>
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

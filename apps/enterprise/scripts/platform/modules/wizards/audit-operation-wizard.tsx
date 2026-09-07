import React, { useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { AuditEventRecord, OrganizationListItem, PlatformServices } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

type AuditOperationId = "audit.add-note" | "audit.verify-chain" | "audit.export";

interface AuditOperationWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  operationId: AuditOperationId;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

interface CompanyOption {
  id: string;
  label: string;
  companyId?: string;
}

const ALL_COMPANIES_ID = "__ALL__";
const EXPORT_FIELDS = ["actorFilter", "actionFilter", "format"] as const;
type ExportField = (typeof EXPORT_FIELDS)[number];

export function AuditOperationWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  operationId,
  setInputLocked,
  onBackToTree,
}: AuditOperationWizardProps) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [companyIndex, setCompanyIndex] = useState(0);
  const [events, setEvents] = useState<AuditEventRecord[]>([]);
  const [message, setMessage] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [exportFieldIndex, setExportFieldIndex] = useState(0);
  const [confirmDraft, setConfirmDraft] = useState("");

  useInputLock(setInputLocked, true);

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const [orgRows, auditRows] = await Promise.all([
          services.org.list({ limit: 100 }),
          services.audit.list({ companyId: focusCompanyId || undefined, limit: 50 }),
        ]);
        if (ignore) return;
        const filtered = focusCompanyId
          ? orgRows.filter((row) => row.id === focusCompanyId || row.slug === focusCompanyId)
          : orgRows;
        const options: CompanyOption[] = [{ id: ALL_COMPANIES_ID, label: "All companies" }];
        options.push(
          ...filtered.map((row: OrganizationListItem) => ({
            id: row.id,
            label: `${row.name} (${row.slug})`,
            companyId: row.id,
          })),
        );
        setCompanyOptions(options);
        setCompanyIndex(focusCompanyId ? Math.min(1, options.length - 1) : 0);
        setEvents(auditRows);
      } catch (error) {
        if (!ignore) setErrorMessage(error instanceof Error ? error.message : "Failed to load audit data.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void loadData();
    return () => {
      ignore = true;
    };
  }, [focusCompanyId, services.audit, services.org]);

  const selectedCompany = companyOptions[companyIndex] ?? null;
  const selectedCompanyId = selectedCompany?.companyId;
  const isAddNote = operationId === "audit.add-note";
  const isVerify = operationId === "audit.verify-chain";
  const requiresTypedConfirmation = false;
  const confirmPhrase = useMemo(() => {
    if (isAddNote) {
      return `CONFIRM AUDIT_NOTE ${selectedCompanyId || "company"}`;
    }
    if (isVerify) {
      return `CONFIRM VERIFY_CHAIN ${selectedCompanyId || "all"}`;
    }
    return `CONFIRM EXPORT_AUDIT ${format.toUpperCase()}`;
  }, [format, isAddNote, isVerify, selectedCompanyId]);

  async function runOperation() {
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      if (isAddNote) {
        if (readOnly) {
          setErrorMessage("Read-only mode is enabled.");
          return;
        }
        if (!selectedCompanyId) {
          setErrorMessage("Select a specific company for audit note.");
          return;
        }
        if (!message.trim()) {
          setErrorMessage("Note message is required.");
          return;
        }
        const result = await services.audit.addNote({
          actor,
          companyId: selectedCompanyId,
          message: message.trim(),
        });
        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }
        setSuccessMessage(`Audit note added: ${result.resource.id}`);
        setStatusMessage("Audit note created.");
      } else if (isVerify) {
        const result = await services.audit.verifyChain(selectedCompanyId);
        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }
        setSuccessMessage(result.resource.message);
        setStatusMessage("Audit chain verification completed.");
      } else {
        const result = await services.audit.export({
          companyId: selectedCompanyId,
          actor: actorFilter.trim() || undefined,
          action: actionFilter.trim() || undefined,
          format,
        });
        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }
        setSuccessMessage(`Exported ${result.resource.count} events (${result.resource.format}).`);
        setStatusMessage("Audit export completed.");
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
      if (key.upArrow) setCompanyIndex((current) => Math.max(0, current - 1));
      if (key.downArrow) setCompanyIndex((current) => Math.min(Math.max(0, companyOptions.length - 1), current + 1));
      if (key.return) setStep(1);
      return;
    }

    if (step === 1) {
      if (isAddNote) {
        if (key.return) {
          setStep(2);
          return;
        }
        setMessage((current) => applyTextInput(current, input, key));
        return;
      }
      if (!isVerify) {
        if (key.upArrow) {
          setExportFieldIndex((current) => Math.max(0, current - 1));
          return;
        }
        if (key.downArrow) {
          setExportFieldIndex((current) => Math.min(EXPORT_FIELDS.length - 1, current + 1));
          return;
        }
        if (key.return) {
          setStep(2);
          return;
        }
        const activeField = EXPORT_FIELDS[exportFieldIndex] as ExportField;
        if (activeField === "format") {
          if (key.leftArrow || key.rightArrow || input.toLowerCase() === "t") {
            setFormat((current) => (current === "json" ? "csv" : "json"));
          }
          return;
        }
        if (activeField === "actorFilter") {
          setActorFilter((current) => applyTextInput(current, input, key));
          return;
        }
        setActionFilter((current) => applyTextInput(current, input, key));
        return;
      }
      if (key.return) {
        setStep(2);
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
      title={isAddNote ? "Add Audit Note Wizard" : isVerify ? "Verify Audit Chain Wizard" : "Export Audit Wizard"}
      description="Guided audit operation."
      step={step}
      steps={["Select Company Scope", "Operation Details", "Review & Confirm"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={[
        "Keys: Up/Down select, Enter next/submit, Esc back.",
        operationId === "audit.export"
          ? "Export details: Up/Down choose field, type filter values, Left/Right (or t) toggles format."
          : "Esc on first step returns to tree.",
      ]}
      body={
        <>
          {step === 0 ? (
            <SelectorList
              items={companyOptions}
              selectedIndex={companyIndex}
              emptyMessage="No company options available."
              render={(item) => item.label}
            />
          ) : null}

          {step === 1 && isAddNote ? (
            <>
              <Text>company: {selectedCompany?.label || "<none>"}</Text>
              <Text>message: {message || "<required>"}</Text>
            </>
          ) : null}
          {step === 1 && isVerify ? (
            <>
              <Text>company scope: {selectedCompany?.label || "<none>"}</Text>
              <Text dimColor>Recent events loaded: {String(events.length)}</Text>
            </>
          ) : null}
          {step === 1 && !isAddNote && !isVerify ? (
            <>
              <Text>company scope: {selectedCompany?.label || "<none>"}</Text>
              <Text color={exportFieldIndex === 0 ? "cyan" : undefined}>actor filter: {actorFilter || "<none>"}</Text>
              <Text color={exportFieldIndex === 1 ? "cyan" : undefined}>action filter: {actionFilter || "<none>"}</Text>
              <Text color={exportFieldIndex === 2 ? "cyan" : undefined}>format: {format}</Text>
              <Text dimColor>Tip: use Up/Down to choose field; Left/Right or t toggles format.</Text>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Text>company scope: {selectedCompany?.label || "<none>"}</Text>
              {isAddNote ? <Text>message: {message || "<none>"}</Text> : null}
              {isVerify ? <Text>operation: verify chain</Text> : null}
              {!isAddNote && !isVerify ? (
                <>
                  <Text>format: {format}</Text>
                  <Text>actor filter: {actorFilter || "<none>"}</Text>
                  <Text>action filter: {actionFilter || "<none>"}</Text>
                </>
              ) : null}
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

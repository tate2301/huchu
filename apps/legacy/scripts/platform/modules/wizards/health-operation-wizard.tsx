import React, { useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { HealthIncidentRecord, OrganizationListItem, PlatformServices } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

type HealthOperationId = "health.record-metric" | "health.remediate";

interface HealthOperationWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  operationId: HealthOperationId;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

const CUSTOM_METRIC_KEY = "__CUSTOM_METRIC_KEY__";
const METRIC_KEY_OPTIONS = ["uptime", "latency", "error-rate", CUSTOM_METRIC_KEY] as const;
const STATUS_OPTIONS = ["OK", "WARN", "CRITICAL"] as const;

export function HealthOperationWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  operationId,
  setInputLocked,
  onBackToTree,
}: HealthOperationWizardProps) {
  const isRecord = operationId === "health.record-metric";
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [organizations, setOrganizations] = useState<OrganizationListItem[]>([]);
  const [companyIndex, setCompanyIndex] = useState(0);
  const [incidents, setIncidents] = useState<HealthIncidentRecord[]>([]);
  const [incidentIndex, setIncidentIndex] = useState(0);

  const [metricKeyIndex, setMetricKeyIndex] = useState(0);
  const [customMetricKey, setCustomMetricKey] = useState("");
  const [metricValue, setMetricValue] = useState("99.9");
  const [statusIndex, setStatusIndex] = useState(0);

  const [reason, setReason] = useState("");
  const [confirmDraft, setConfirmDraft] = useState("");

  useInputLock(setInputLocked, true);

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const [orgRows, incidentRows] = await Promise.all([
          services.org.list({ limit: 100 }),
          services.health.listIncidents({ companyId: focusCompanyId || undefined, limit: 100 }),
        ]);
        if (ignore) return;
        const filteredOrgs = focusCompanyId
          ? orgRows.filter((row) => row.id === focusCompanyId || row.slug === focusCompanyId)
          : orgRows;
        setOrganizations(filteredOrgs);
        setIncidents(incidentRows);
        setCompanyIndex(0);
        setIncidentIndex(0);
      } catch (error) {
        if (!ignore) setErrorMessage(error instanceof Error ? error.message : "Failed to load health data.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void loadData();
    return () => {
      ignore = true;
    };
  }, [focusCompanyId, services.health, services.org]);

  const selectedCompany = organizations[companyIndex] ?? null;
  const selectedIncident = incidents[incidentIndex] ?? null;
  const selectedMetricKeyOption = METRIC_KEY_OPTIONS[metricKeyIndex] ?? METRIC_KEY_OPTIONS[0];
  const selectedStatus = STATUS_OPTIONS[statusIndex] ?? STATUS_OPTIONS[0];
  const metricKey = selectedMetricKeyOption === CUSTOM_METRIC_KEY ? customMetricKey.trim() : selectedMetricKeyOption;

  const requiresTypedConfirmation = false;
  const confirmPhrase = useMemo(() => {
    if (isRecord) {
      return `CONFIRM RECORD ${selectedCompany?.slug || "company"}`;
    }
    return `CONFIRM REMEDIATE ${selectedIncident?.id || "incident"}`;
  }, [isRecord, selectedCompany?.slug, selectedIncident?.id]);

  async function runOperation() {
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      if (isRecord) {
        if (!selectedCompany) {
          setErrorMessage("No company selected.");
          return;
        }
        if (!metricKey) {
          setErrorMessage("Metric key is required.");
          return;
        }
        const value = Number(metricValue);
        if (!Number.isFinite(value)) {
          setErrorMessage("Metric value must be numeric.");
          return;
        }
        const result = await services.health.recordMetric({
          companyId: selectedCompany.id,
          metricKey,
          value,
          status: selectedStatus,
        });
        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }
        setSuccessMessage(`Recorded ${result.resource.metricKey}=${String(result.resource.value)} for ${selectedCompany.slug}`);
        setStatusMessage("Metric recorded.");
      } else {
        if (!selectedIncident) {
          setErrorMessage("No incident selected.");
          return;
        }
        const result = await services.health.triggerRemediation({
          incidentId: selectedIncident.id,
          actor,
          reason: reason.trim() || "Manual remediation from wizard",
        });
        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }
        setSuccessMessage(`Remediation executed for incident ${result.resource.id}`);
        setStatusMessage("Remediation completed.");
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
      if (isRecord && step === 3 && selectedMetricKeyOption !== CUSTOM_METRIC_KEY) {
        setStep(1);
        return;
      }
      setStep((current) => Math.max(0, current - 1));
      return;
    }

    if (isRecord) {
      if (step === 0) {
        if (key.upArrow) setCompanyIndex((current) => Math.max(0, current - 1));
        if (key.downArrow) setCompanyIndex((current) => Math.min(Math.max(0, organizations.length - 1), current + 1));
        if (key.return) setStep(1);
        return;
      }

      if (step === 1) {
        if (key.upArrow) setMetricKeyIndex((current) => Math.max(0, current - 1));
        if (key.downArrow) setMetricKeyIndex((current) => Math.min(Math.max(0, METRIC_KEY_OPTIONS.length - 1), current + 1));
        if (key.return) {
          if (selectedMetricKeyOption === CUSTOM_METRIC_KEY) {
            setStep(2);
            return;
          }
          setStep(3);
        }
        return;
      }

      if (step === 2) {
        if (key.return) {
          if (!customMetricKey.trim()) {
            setErrorMessage("Custom metric key is required.");
            return;
          }
          setStep(3);
          return;
        }
        setCustomMetricKey((current) => applyTextInput(current, input, key));
        return;
      }

      if (step === 3) {
        if (key.return) {
          setStep(4);
          return;
        }
        setMetricValue((current) => applyTextInput(current, input, key));
        return;
      }

      if (step === 4) {
        if (key.upArrow) setStatusIndex((current) => Math.max(0, current - 1));
        if (key.downArrow) setStatusIndex((current) => Math.min(Math.max(0, STATUS_OPTIONS.length - 1), current + 1));
        if (key.return) setStep(5);
        return;
      }

      if (step === 5) {
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
      if (key.upArrow) setIncidentIndex((current) => Math.max(0, current - 1));
      if (key.downArrow) setIncidentIndex((current) => Math.min(Math.max(0, incidents.length - 1), current + 1));
      if (key.return) setStep(1);
      return;
    }

    if (step === 1) {
      if (key.return) {
        setStep(2);
        return;
      }
      setReason((current) => applyTextInput(current, input, key));
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

  const recordSteps = ["Select Company", "Select Metric Key", "Custom Metric Key", "Metric Value", "Select Status", "Review & Confirm"];

  return (
    <WizardFrame
      title={isRecord ? "Record Health Metric Wizard" : "Remediate Incident Wizard"}
      description="Guided health operation."
      step={step}
      steps={isRecord ? recordSteps : ["Select Incident", "Reason", "Review & Confirm"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={[
        "Keys: Up/Down select, Enter next/submit, Esc back.",
        loading ? "Working..." : "Enumerables are selected from lists.",
      ]}
      body={
        <>
          {isRecord && step === 0 ? (
            <SelectorList
              items={organizations}
              selectedIndex={companyIndex}
              emptyMessage="No companies available."
              render={(item) => `${item.name} (${item.slug})`}
            />
          ) : null}
          {isRecord && step === 1 ? (
            <>
              <Text>company: {selectedCompany ? `${selectedCompany.name} (${selectedCompany.slug})` : "<none>"}</Text>
              <SelectorList
                items={[...METRIC_KEY_OPTIONS]}
                selectedIndex={metricKeyIndex}
                emptyMessage="No metric keys."
                render={(item) => (item === CUSTOM_METRIC_KEY ? "Custom metric key..." : item)}
              />
            </>
          ) : null}
          {isRecord && step === 2 ? (
            <>
              <Text>metric key mode: custom</Text>
              <Text>custom metric key: {customMetricKey || "<required>"}</Text>
            </>
          ) : null}
          {isRecord && step === 3 ? (
            <>
              <Text>metric key: {metricKey || "<none>"}</Text>
              <Text>metric value: {metricValue || "<required>"}</Text>
            </>
          ) : null}
          {isRecord && step === 4 ? (
            <>
              <Text>metric key: {metricKey || "<none>"}</Text>
              <SelectorList
                items={[...STATUS_OPTIONS]}
                selectedIndex={statusIndex}
                emptyMessage="No status options."
                render={(item) => item}
              />
            </>
          ) : null}
          {isRecord && step === 5 ? (
            <>
              <Text>company: {selectedCompany ? `${selectedCompany.name} (${selectedCompany.slug})` : "<none>"}</Text>
              <Text>metric: {metricKey}={metricValue}</Text>
              <Text>status: {selectedStatus}</Text>
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

          {!isRecord && step === 0 ? (
            <SelectorList
              items={incidents}
              selectedIndex={incidentIndex}
              emptyMessage="No incidents available."
              render={(item) => `${item.id} | ${item.status} | ${item.metricKey} | ${item.message}`}
            />
          ) : null}
          {!isRecord && step === 1 ? (
            <>
              <Text>incident: {selectedIncident?.id || "<none>"}</Text>
              <Text>reason: {reason || "<optional>"}</Text>
            </>
          ) : null}
          {!isRecord && step === 2 ? (
            <>
              <Text>incident: {selectedIncident?.id || "<none>"}</Text>
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

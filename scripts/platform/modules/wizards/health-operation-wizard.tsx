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
  const [reason, setReason] = useState("");
  const [confirmDraft, setConfirmDraft] = useState("");

  const [metricDraft, setMetricDraft] = useState({
    metricKey: "uptime",
    value: "99.9",
    status: "OK",
  });
  const [metricFieldIndex, setMetricFieldIndex] = useState(0);
  const metricFields = ["metricKey", "value", "status"] as const;

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
        const value = Number(metricDraft.value);
        if (!Number.isFinite(value)) {
          setErrorMessage("Metric value must be numeric.");
          return;
        }
        const result = await services.health.recordMetric({
          companyId: selectedCompany.id,
          metricKey: metricDraft.metricKey,
          value,
          status: metricDraft.status,
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
      setStep((current) => Math.max(0, current - 1));
      return;
    }

    if (step === 0) {
      if (isRecord) {
        if (key.upArrow) setCompanyIndex((current) => Math.max(0, current - 1));
        if (key.downArrow) setCompanyIndex((current) => Math.min(Math.max(0, organizations.length - 1), current + 1));
      } else {
        if (key.upArrow) setIncidentIndex((current) => Math.max(0, current - 1));
        if (key.downArrow) setIncidentIndex((current) => Math.min(Math.max(0, incidents.length - 1), current + 1));
      }
      if (key.return) setStep(1);
      return;
    }

    if (step === 1) {
      if (isRecord) {
        if (key.upArrow) setMetricFieldIndex((current) => Math.max(0, current - 1));
        if (key.downArrow) setMetricFieldIndex((current) => Math.min(metricFields.length - 1, current + 1));
        if (key.return) {
          setStep(2);
          return;
        }
        const field = metricFields[metricFieldIndex];
        setMetricDraft((current) => ({ ...current, [field]: applyTextInput(current[field], input, key) }));
        return;
      }
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

  return (
    <WizardFrame
      title={isRecord ? "Record Health Metric Wizard" : "Remediate Incident Wizard"}
      description="Guided health operation."
      step={step}
      steps={isRecord ? ["Select Company", "Metric Details", "Review & Confirm"] : ["Select Incident", "Reason", "Review & Confirm"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={[
        "Keys: Up/Down select, Enter next/submit, Esc back.",
        loading ? "Working..." : "Esc on first step returns to tree.",
      ]}
      body={
        <>
          {step === 0 && isRecord ? (
            <SelectorList
              items={organizations}
              selectedIndex={companyIndex}
              emptyMessage="No companies available."
              render={(item) => `${item.name} (${item.slug})`}
            />
          ) : null}
          {step === 0 && !isRecord ? (
            <SelectorList
              items={incidents}
              selectedIndex={incidentIndex}
              emptyMessage="No incidents available."
              render={(item) => `${item.id} | ${item.status} | ${item.metricKey} | ${item.message}`}
            />
          ) : null}

          {step === 1 && isRecord ? (
            <>
              <Text>company: {selectedCompany ? `${selectedCompany.name} (${selectedCompany.slug})` : "<none>"}</Text>
              <Text color={metricFieldIndex === 0 ? "cyan" : undefined}>metricKey: {metricDraft.metricKey || "<required>"}</Text>
              <Text color={metricFieldIndex === 1 ? "cyan" : undefined}>value: {metricDraft.value || "<required>"}</Text>
              <Text color={metricFieldIndex === 2 ? "cyan" : undefined}>status: {metricDraft.status || "OK"}</Text>
            </>
          ) : null}
          {step === 1 && !isRecord ? (
            <>
              <Text>incident: {selectedIncident?.id || "<none>"}</Text>
              <Text>reason: {reason || "<optional>"}</Text>
            </>
          ) : null}

          {step === 2 ? (
            <>
              {isRecord ? (
                <>
                  <Text>company: {selectedCompany ? `${selectedCompany.name} (${selectedCompany.slug})` : "<none>"}</Text>
                  <Text>metric: {metricDraft.metricKey}={metricDraft.value}</Text>
                  <Text>status: {metricDraft.status}</Text>
                </>
              ) : (
                <>
                  <Text>incident: {selectedIncident?.id || "<none>"}</Text>
                  <Text>reason: {reason || "<none>"}</Text>
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

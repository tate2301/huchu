import React, { useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type {
  OrganizationListItem,
  PlatformServices,
  SupportAccessRequestRecord,
  SupportSessionRecord,
} from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

type SupportOperationId =
  | "support.request"
  | "support.approve"
  | "support.start-session"
  | "support.end-session";

interface SupportOperationWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  operationId: SupportOperationId;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

const SCOPE_OPTIONS = ["READ_ONLY", "READ_WRITE"] as const;
const SESSION_MODES = ["IMPERSONATE", "SHADOW"] as const;
const APPROVAL_OPTIONS = ["APPROVE", "DENY"] as const;

function isRequestOperation(operationId: SupportOperationId) {
  return operationId === "support.request";
}

function isApproveOperation(operationId: SupportOperationId) {
  return operationId === "support.approve";
}

function isStartOperation(operationId: SupportOperationId) {
  return operationId === "support.start-session";
}

function isEndOperation(operationId: SupportOperationId) {
  return operationId === "support.end-session";
}

function operationTitle(operationId: SupportOperationId) {
  if (operationId === "support.request") return "Create Support Request Wizard";
  if (operationId === "support.approve") return "Approve Support Request Wizard";
  if (operationId === "support.start-session") return "Start Support Session Wizard";
  return "End Support Session Wizard";
}

function operationSteps(operationId: SupportOperationId) {
  if (operationId === "support.request") return ["Select Company", "Request Details", "Review & Confirm"];
  if (operationId === "support.approve") return ["Select Request", "Decision", "Review & Confirm"];
  if (operationId === "support.start-session") return ["Select Request", "Session Mode", "Review & Confirm"];
  return ["Select Session", "Reason", "Review & Confirm"];
}

export function SupportOperationWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  operationId,
  setInputLocked,
  onBackToTree,
}: SupportOperationWizardProps) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [organizations, setOrganizations] = useState<OrganizationListItem[]>([]);
  const [requests, setRequests] = useState<SupportAccessRequestRecord[]>([]);
  const [sessions, setSessions] = useState<SupportSessionRecord[]>([]);

  const [companyIndex, setCompanyIndex] = useState(0);
  const [requestIndex, setRequestIndex] = useState(0);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [scopeIndex, setScopeIndex] = useState(0);
  const [approvalIndex, setApprovalIndex] = useState(0);
  const [modeIndex, setModeIndex] = useState(0);
  const [reason, setReason] = useState("");
  const [confirmDraft, setConfirmDraft] = useState("");

  useInputLock(setInputLocked, true);

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const [orgRows, requestRows, sessionRows] = await Promise.all([
          services.org.list({ limit: 100 }),
          services.support.listRequests({ companyId: focusCompanyId || undefined, limit: 100 }),
          services.support.listSessions(focusCompanyId || undefined),
        ]);
        if (ignore) return;
        const filteredOrgs = focusCompanyId
          ? orgRows.filter((row) => row.id === focusCompanyId || row.slug === focusCompanyId)
          : orgRows;
        setOrganizations(filteredOrgs);
        setRequests(requestRows);
        setSessions(sessionRows);
        setCompanyIndex(0);
        setRequestIndex(0);
        setSessionIndex(0);
      } catch (error) {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load support data.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void loadData();
    return () => {
      ignore = true;
    };
  }, [focusCompanyId, services.org, services.support]);

  const selectedCompany = organizations[companyIndex] ?? null;
  const selectedRequest = requests[requestIndex] ?? null;
  const selectedSession = sessions[sessionIndex] ?? null;
  const selectedScope = SCOPE_OPTIONS[scopeIndex];
  const selectedApproval = APPROVAL_OPTIONS[approvalIndex];
  const selectedMode = SESSION_MODES[modeIndex];
  const requiresTypedConfirmation = false;

  const confirmPhrase = useMemo(() => {
    if (isRequestOperation(operationId)) {
      return `CONFIRM SUPPORT_REQUEST ${selectedCompany?.slug || "company"}`;
    }
    if (isApproveOperation(operationId)) {
      return `CONFIRM ${selectedApproval} ${selectedRequest?.id || "request"}`;
    }
    if (isStartOperation(operationId)) {
      return `CONFIRM START_SESSION ${selectedRequest?.id || "request"}`;
    }
    return `CONFIRM END_SESSION ${selectedSession?.id || "session"}`;
  }, [operationId, selectedApproval, selectedCompany?.slug, selectedRequest?.id, selectedSession?.id]);

  async function runOperation() {
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      if (isRequestOperation(operationId)) {
        if (!selectedCompany) {
          setErrorMessage("No company selected.");
          return;
        }
        const result = await services.support.requestAccess({
          companyId: selectedCompany.id,
          requestedBy: actor,
          reason: reason.trim(),
          scope: selectedScope,
        });
        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }
        setSuccessMessage(`Created support request ${result.resource.id} for ${selectedCompany.slug}`);
        setStatusMessage("Support request created.");
      } else if (isApproveOperation(operationId)) {
        if (!selectedRequest) {
          setErrorMessage("No request selected.");
          return;
        }
        const result = await services.support.approveRequest({
          requestId: selectedRequest.id,
          approvedBy: actor,
          approve: selectedApproval === "APPROVE",
          reason: reason.trim() || undefined,
        });
        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }
        setSuccessMessage(`${selectedApproval} applied to request ${result.resource.id}`);
        setStatusMessage("Request decision applied.");
      } else if (isStartOperation(operationId)) {
        if (!selectedRequest) {
          setErrorMessage("No request selected.");
          return;
        }
        const result = await services.support.startSession({
          requestId: selectedRequest.id,
          actor,
          mode: selectedMode,
        });
        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }
        setSuccessMessage(`Started session ${result.resource.id} in ${selectedMode} mode`);
        setStatusMessage("Support session started.");
      } else {
        if (!selectedSession) {
          setErrorMessage("No session selected.");
          return;
        }
        const result = await services.support.endSession({
          sessionId: selectedSession.id,
          actor,
          reason: reason.trim() || undefined,
        });
        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }
        setSuccessMessage(`Ended session ${result.resource.id}`);
        setStatusMessage("Support session ended.");
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
      if (isRequestOperation(operationId)) {
        if (key.upArrow) setCompanyIndex((current) => Math.max(0, current - 1));
        if (key.downArrow) setCompanyIndex((current) => Math.min(Math.max(0, organizations.length - 1), current + 1));
      } else if (isEndOperation(operationId)) {
        if (key.upArrow) setSessionIndex((current) => Math.max(0, current - 1));
        if (key.downArrow) setSessionIndex((current) => Math.min(Math.max(0, sessions.length - 1), current + 1));
      } else {
        if (key.upArrow) setRequestIndex((current) => Math.max(0, current - 1));
        if (key.downArrow) setRequestIndex((current) => Math.min(Math.max(0, requests.length - 1), current + 1));
      }
      if (key.return) {
        setStep(1);
      }
      return;
    }

    if (step === 1) {
      if (isRequestOperation(operationId)) {
        if (key.upArrow) setScopeIndex((current) => Math.max(0, current - 1));
        if (key.downArrow) setScopeIndex((current) => Math.min(SCOPE_OPTIONS.length - 1, current + 1));
        if (key.return) {
          setStep(2);
          return;
        }
        setReason((current) => applyTextInput(current, input, key));
        return;
      }
      if (isApproveOperation(operationId)) {
        if (key.upArrow) setApprovalIndex((current) => Math.max(0, current - 1));
        if (key.downArrow) setApprovalIndex((current) => Math.min(APPROVAL_OPTIONS.length - 1, current + 1));
        if (key.return) {
          setStep(2);
          return;
        }
        setReason((current) => applyTextInput(current, input, key));
        return;
      }
      if (isStartOperation(operationId)) {
        if (key.upArrow) setModeIndex((current) => Math.max(0, current - 1));
        if (key.downArrow) setModeIndex((current) => Math.min(SESSION_MODES.length - 1, current + 1));
        if (key.return) {
          setStep(2);
        }
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
      title={operationTitle(operationId)}
      description="Guided support operation flow."
      step={step}
      steps={operationSteps(operationId)}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={[
        "Keys: Up/Down select, Enter next/submit, Esc back.",
        loading ? "Working..." : "Esc on first step returns to tree.",
      ]}
      body={
        <>
          {step === 0 && isRequestOperation(operationId) ? (
            <SelectorList
              items={organizations}
              selectedIndex={companyIndex}
              emptyMessage="No companies available."
              render={(item) => `${item.name} (${item.slug})`}
            />
          ) : null}
          {step === 0 && (isApproveOperation(operationId) || isStartOperation(operationId)) ? (
            <SelectorList
              items={requests}
              selectedIndex={requestIndex}
              emptyMessage="No support requests available."
              render={(item) => `${item.id} | ${item.status} | ${item.companySlug || item.companyId} | ${item.scope}`}
            />
          ) : null}
          {step === 0 && isEndOperation(operationId) ? (
            <SelectorList
              items={sessions}
              selectedIndex={sessionIndex}
              emptyMessage="No support sessions available."
              render={(item) => `${item.id} | ${item.status} | ${item.companySlug || item.companyId} | ${item.mode}`}
            />
          ) : null}

          {step === 1 && isRequestOperation(operationId) ? (
            <>
              <Text>company: {selectedCompany ? `${selectedCompany.name} (${selectedCompany.slug})` : "<none>"}</Text>
              <Text>scope: {selectedScope}</Text>
              <Text>reason: {reason || "<required>"}</Text>
            </>
          ) : null}
          {step === 1 && isApproveOperation(operationId) ? (
            <>
              <Text>request: {selectedRequest?.id || "<none>"}</Text>
              <Text>decision: {selectedApproval}</Text>
              <Text>reason: {reason || "<optional>"}</Text>
            </>
          ) : null}
          {step === 1 && isStartOperation(operationId) ? (
            <>
              <Text>request: {selectedRequest?.id || "<none>"}</Text>
              <Text>mode: {selectedMode}</Text>
            </>
          ) : null}
          {step === 1 && isEndOperation(operationId) ? (
            <>
              <Text>session: {selectedSession?.id || "<none>"}</Text>
              <Text>reason: {reason || "<optional>"}</Text>
            </>
          ) : null}

          {step === 2 ? (
            <>
              {isRequestOperation(operationId) ? (
                <>
                  <Text>company: {selectedCompany ? `${selectedCompany.name} (${selectedCompany.slug})` : "<none>"}</Text>
                  <Text>scope: {selectedScope}</Text>
                  <Text>reason: {reason || "<none>"}</Text>
                </>
              ) : null}
              {isApproveOperation(operationId) ? (
                <>
                  <Text>request: {selectedRequest?.id || "<none>"}</Text>
                  <Text>decision: {selectedApproval}</Text>
                  <Text>reason: {reason || "<none>"}</Text>
                </>
              ) : null}
              {isStartOperation(operationId) ? (
                <>
                  <Text>request: {selectedRequest?.id || "<none>"}</Text>
                  <Text>mode: {selectedMode}</Text>
                </>
              ) : null}
              {isEndOperation(operationId) ? (
                <>
                  <Text>session: {selectedSession?.id || "<none>"}</Text>
                  <Text>reason: {reason || "<none>"}</Text>
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

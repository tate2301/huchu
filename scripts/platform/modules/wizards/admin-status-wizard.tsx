import React, { useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { AdminSummary, PlatformServices } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface AdminStatusWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  activate: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

type Step = 0 | 1 | 2;

export function AdminStatusWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  activate,
  setInputLocked,
  onBackToTree,
}: AdminStatusWizardProps) {
  const [step, setStep] = useState<Step>(0);
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
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
    async function loadAdmins() {
      try {
        const rows = await services.admin.list({ companyId: focusCompanyId || undefined, limit: 100 });
        if (!ignore) {
          setAdmins(rows);
          setSelectedIndex(0);
        }
      } catch (error) {
        if (!ignore) setErrorMessage(error instanceof Error ? error.message : "Failed to load admins.");
      }
    }
    void loadAdmins();
    return () => {
      ignore = true;
    };
  }, [focusCompanyId, services.admin]);

  const selected = admins[selectedIndex] ?? null;
  const actionWord = activate ? "ACTIVATE" : "DEACTIVATE";
  const requiresTypedConfirmation = !activate;
  const confirmPhrase = useMemo(() => `CONFIRM ${actionWord} ${selected?.email || "admin"}`, [actionWord, selected?.email]);

  async function runStatusChange() {
    if (!selected) return;
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = activate
        ? await services.admin.activate({ userId: selected.id, actor, reason: reason || undefined })
        : await services.admin.deactivate({ userId: selected.id, actor, reason: reason || undefined });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setSuccessMessage(`${actionWord} completed for ${selected.email}`);
      setStatusMessage("Admin status update completed.");
      setConfirmDraft("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Status update failed.");
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
      setStep((current) => (Math.max(0, current - 1) as Step));
      return;
    }

    if (step === 0) {
      if (key.upArrow) {
        setSelectedIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((current) => Math.min(Math.max(0, admins.length - 1), current + 1));
        return;
      }
      if (key.return) {
        if (!selected) {
          setErrorMessage("No admin selected.");
          return;
        }
        setStep(1);
      }
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
        void runStatusChange();
        return;
      }
      if (requiresTypedConfirmation) {
        setConfirmDraft((current) => applyTextInput(current, input, key));
      }
    }
  });

  return (
    <WizardFrame
      title={`${activate ? "Activate" : "Deactivate"} Admin Wizard`}
      description="Guided admin status update."
      step={step}
      steps={["Select Admin", "Reason", "Review & Confirm"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={["Keys: Up/Down select, Enter next/submit, Esc back.", loading ? "Working..." : "Esc on first step returns to tree."]}
      body={
        <>
          {step === 0 ? (
            <SelectorList
              items={admins}
              selectedIndex={selectedIndex}
              emptyMessage="No admins available."
              render={(item) => `${item.email} | ${item.role} | active ${String(item.isActive)} | ${item.companyName || item.companyId}`}
            />
          ) : null}
          {step === 1 ? (
            <>
              <Text>admin: {selected?.email || "<none>"}</Text>
              <Text>reason: {reason || "<optional>"}</Text>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Text>admin: {selected?.email || "<none>"}</Text>
              <Text>target: {activate ? "active" : "inactive"}</Text>
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

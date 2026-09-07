import React, { useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { AdminSummary, PlatformServices } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface AdminResetPasswordWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

type Step = 0 | 1 | 2;
type Field = "password" | "reason";

export function AdminResetPasswordWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  setInputLocked,
  onBackToTree,
}: AdminResetPasswordWizardProps) {
  const [step, setStep] = useState<Step>(0);
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [fieldIndex, setFieldIndex] = useState(0);
  const [confirmDraft, setConfirmDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState({ password: "", reason: "" });

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
  const fields: Field[] = ["password", "reason"];
  const currentField = fields[fieldIndex];
  const requiresTypedConfirmation = false;
  const confirmPhrase = useMemo(() => `CONFIRM RESET ${selected?.email || "admin"}`, [selected?.email]);

  async function runReset() {
    if (!selected) return;
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }
    if (draft.password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await services.admin.resetPassword({
        userId: selected.id,
        newPassword: draft.password,
        actor,
        reason: draft.reason || undefined,
      });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setSuccessMessage(`Password reset completed for ${selected.email}`);
      setStatusMessage("Password reset done.");
      setConfirmDraft("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Password reset failed.");
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
      if (key.upArrow) {
        setFieldIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setFieldIndex((current) => Math.min(fields.length - 1, current + 1));
        return;
      }
      if (key.return) {
        if (draft.password.length < 8) {
          setErrorMessage("Password must be at least 8 characters.");
          return;
        }
        setStep(2);
        return;
      }
      setDraft((current) => ({ ...current, [currentField]: applyTextInput(current[currentField], input, key) }));
      return;
    }

    if (step === 2) {
      if (key.return) {
        if (requiresTypedConfirmation && confirmDraft.trim() !== confirmPhrase) {
          setErrorMessage(`Type exact phrase: ${confirmPhrase}`);
          return;
        }
        void runReset();
        return;
      }
      if (requiresTypedConfirmation) {
        setConfirmDraft((current) => applyTextInput(current, input, key));
      }
    }
  });

  return (
    <WizardFrame
      title="Reset Admin Password Wizard"
      description="Guided password reset with explicit confirmation."
      step={step}
      steps={["Select Admin", "New Password", "Review & Confirm"]}
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
              render={(item) => `${item.email} | ${item.role} | ${item.companyName || item.companyId}`}
            />
          ) : null}
          {step === 1 ? (
            <>
              <Text>admin: {selected?.email || "<none>"}</Text>
              <Text color={fieldIndex === 0 ? "cyan" : undefined}>
                newPassword: {draft.password ? "***" : "<required>"}
              </Text>
              <Text color={fieldIndex === 1 ? "cyan" : undefined}>reason: {draft.reason || "<optional>"}</Text>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Text>admin: {selected?.email || "<none>"}</Text>
              <Text>reason: {draft.reason || "<none>"}</Text>
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

import React, { useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { OrganizationListItem, PlatformServices } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface AdminCreateWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

type Step = 0 | 1 | 2;
type AdminField = "email" | "name" | "password" | "role";

const ADMIN_FIELDS: AdminField[] = ["email", "name", "password", "role"];

export function AdminCreateWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  setInputLocked,
  onBackToTree,
}: AdminCreateWizardProps) {
  const [step, setStep] = useState<Step>(0);
  const [organizations, setOrganizations] = useState<OrganizationListItem[]>([]);
  const [companyIndex, setCompanyIndex] = useState(0);
  const [fieldIndex, setFieldIndex] = useState(0);
  const [confirmDraft, setConfirmDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    email: "",
    name: "",
    password: "",
    role: "SUPERADMIN",
  });

  useInputLock(setInputLocked, true);

  useEffect(() => {
    let ignore = false;
    async function loadOrganizations() {
      try {
        const rows = await services.org.list({ limit: 100 });
        const filtered = focusCompanyId
          ? rows.filter((row) => row.id === focusCompanyId || row.slug === focusCompanyId)
          : rows;
        if (!ignore) {
          setOrganizations(filtered);
          setCompanyIndex(0);
        }
      } catch (error) {
        if (!ignore) setErrorMessage(error instanceof Error ? error.message : "Failed to load organizations.");
      }
    }
    void loadOrganizations();
    return () => {
      ignore = true;
    };
  }, [focusCompanyId, services.org]);

  const selectedCompany = organizations[companyIndex] ?? null;
  const requiresTypedConfirmation = false;
  const confirmPhrase = useMemo(() => `CONFIRM CREATE ${draft.email || "admin"}`, [draft.email]);

  async function runCreate() {
    if (!selectedCompany) return;
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await services.admin.create({
        companyId: selectedCompany.id,
        email: draft.email.trim(),
        name: draft.name.trim(),
        password: draft.password,
        role: draft.role || "SUPERADMIN",
        actor,
      });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setSuccessMessage(`Created admin ${result.resource.email} for ${selectedCompany.slug}`);
      setStatusMessage("Admin creation completed.");
      setConfirmDraft("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Admin creation failed.");
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
        setCompanyIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setCompanyIndex((current) => Math.min(Math.max(0, organizations.length - 1), current + 1));
        return;
      }
      if (key.return) {
        if (!selectedCompany) {
          setErrorMessage("No company selected.");
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
        setFieldIndex((current) => Math.min(ADMIN_FIELDS.length - 1, current + 1));
        return;
      }
      if (key.return) {
        if (!draft.email.includes("@")) {
          setErrorMessage("Email is invalid.");
          return;
        }
        if (!draft.name.trim()) {
          setErrorMessage("Name is required.");
          return;
        }
        if (draft.password.length < 8) {
          setErrorMessage("Password must be at least 8 characters.");
          return;
        }
        setStep(2);
        return;
      }
      const field = ADMIN_FIELDS[fieldIndex];
      setDraft((current) => ({ ...current, [field]: applyTextInput(current[field], input, key) }));
      return;
    }

    if (step === 2) {
      if (key.return) {
        if (requiresTypedConfirmation && confirmDraft.trim() !== confirmPhrase) {
          setErrorMessage(`Type exact phrase: ${confirmPhrase}`);
          return;
        }
        void runCreate();
        return;
      }
      if (requiresTypedConfirmation) {
        setConfirmDraft((current) => applyTextInput(current, input, key));
      }
    }
  });

  return (
    <WizardFrame
      title="Create Admin Wizard"
      description="Guided flow to create admin without manual IDs."
      step={step}
      steps={["Select Company", "Admin Details", "Review & Confirm"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={["Keys: Up/Down select, Enter next/submit, Esc back.", loading ? "Working..." : "Esc on first step returns to tree."]}
      body={
        <>
          {step === 0 ? (
            <SelectorList
              items={organizations}
              selectedIndex={companyIndex}
              emptyMessage="No organizations available."
              render={(item) => `${item.name} (${item.slug})`}
            />
          ) : null}
          {step === 1 ? (
            <>
              <Text>company: {selectedCompany ? `${selectedCompany.name} (${selectedCompany.slug})` : "<none>"}</Text>
              <Text color={fieldIndex === 0 ? "cyan" : undefined}>email: {draft.email || "<required>"}</Text>
              <Text color={fieldIndex === 1 ? "cyan" : undefined}>name: {draft.name || "<required>"}</Text>
              <Text color={fieldIndex === 2 ? "cyan" : undefined}>password: {draft.password ? "***" : "<required>"}</Text>
              <Text color={fieldIndex === 3 ? "cyan" : undefined}>role: {draft.role || "SUPERADMIN"}</Text>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Text>company: {selectedCompany ? `${selectedCompany.name} (${selectedCompany.slug})` : "<none>"}</Text>
              <Text>email: {draft.email || "<none>"}</Text>
              <Text>name: {draft.name || "<none>"}</Text>
              <Text>role: {draft.role || "SUPERADMIN"}</Text>
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

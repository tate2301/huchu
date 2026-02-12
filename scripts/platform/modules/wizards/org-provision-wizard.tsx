import React, { useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { PlatformServices } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { WizardFrame } from "./wizard-frame";

interface OrgProvisionWizardProps {
  actor: string;
  services: PlatformServices;
  readOnly: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

type Step = 0 | 1 | 2 | 3;
type OrgField = "name" | "slug";
type AdminField = "adminEmail" | "adminName" | "adminPassword";
type ConfigField = "tierCode" | "featureTemplate" | "subdomain";

function slugify(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

const STEPS = ["Organization", "Admin", "Configuration", "Review"];
const ORG_FIELDS: OrgField[] = ["name", "slug"];
const ADMIN_FIELDS: AdminField[] = ["adminEmail", "adminName", "adminPassword"];
const CONFIG_FIELDS: ConfigField[] = ["tierCode", "featureTemplate", "subdomain"];

export function OrgProvisionWizard({
  actor,
  services,
  readOnly,
  setInputLocked,
  onBackToTree,
}: OrgProvisionWizardProps) {
  const [step, setStep] = useState<Step>(0);
  const [orgField, setOrgField] = useState(0);
  const [adminField, setAdminField] = useState(0);
  const [configField, setConfigField] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmDraft, setConfirmDraft] = useState("");

  const [draft, setDraft] = useState({
    name: "",
    slug: "",
    adminEmail: "",
    adminName: "",
    adminPassword: "",
    tierCode: "CUSTOM",
    featureTemplate: "BASE",
    subdomain: "",
  });

  useInputLock(setInputLocked, true);

  const resolvedSlug = useMemo(() => slugify(draft.slug || draft.name), [draft.name, draft.slug]);
  const resolvedSubdomain = useMemo(() => slugify(draft.subdomain || resolvedSlug), [draft.subdomain, resolvedSlug]);
  const requiresTypedConfirmation = false;
  const confirmationPhrase = `PROVISION ${resolvedSlug || "org"}`;

  async function runProvision() {
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await services.org.provisionBundle({
        organizationName: draft.name,
        organizationSlug: draft.slug || undefined,
        adminEmail: draft.adminEmail,
        adminName: draft.adminName,
        adminPassword: draft.adminPassword,
        tierCode: draft.tierCode || undefined,
        featureTemplate: draft.featureTemplate || undefined,
        subdomain: draft.subdomain || undefined,
        actor,
        reason: "Provisioned from guided TUI wizard",
      });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setSuccessMessage(
        `Provisioned ${result.resource.organization.slug} | Admin ${result.resource.admin.email} | Subdomain ${result.resource.subdomainReservation.subdomain}`,
      );
      setStatusMessage("Provision flow completed.");
      setConfirmDraft("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Provision failed.");
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
        setOrgField((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setOrgField((current) => Math.min(ORG_FIELDS.length - 1, current + 1));
        return;
      }
      if (key.return) {
        if (!draft.name.trim()) {
          setErrorMessage("Organization name is required.");
          return;
        }
        setStep(1);
        setErrorMessage(null);
        return;
      }
      const field = ORG_FIELDS[orgField];
      setDraft((current) => ({ ...current, [field]: applyTextInput(current[field], input, key) }));
      return;
    }

    if (step === 1) {
      if (key.upArrow) {
        setAdminField((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setAdminField((current) => Math.min(ADMIN_FIELDS.length - 1, current + 1));
        return;
      }
      if (key.return) {
        if (!draft.adminEmail.includes("@")) {
          setErrorMessage("Admin email is invalid.");
          return;
        }
        if (!draft.adminName.trim()) {
          setErrorMessage("Admin name is required.");
          return;
        }
        if (draft.adminPassword.length < 8) {
          setErrorMessage("Admin password must be at least 8 characters.");
          return;
        }
        setStep(2);
        setErrorMessage(null);
        return;
      }
      const field = ADMIN_FIELDS[adminField];
      setDraft((current) => ({ ...current, [field]: applyTextInput(current[field], input, key) }));
      return;
    }

    if (step === 2) {
      if (key.upArrow) {
        setConfigField((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setConfigField((current) => Math.min(CONFIG_FIELDS.length - 1, current + 1));
        return;
      }
      if (key.return) {
        setStep(3);
        setErrorMessage(null);
        return;
      }
      const field = CONFIG_FIELDS[configField];
      setDraft((current) => ({ ...current, [field]: applyTextInput(current[field], input, key) }));
      return;
    }

    if (step === 3) {
      if (key.return) {
        if (requiresTypedConfirmation && confirmDraft.trim() !== confirmationPhrase) {
          setErrorMessage(`Type exact phrase: ${confirmationPhrase}`);
          return;
        }
        void runProvision();
        return;
      }
      if (requiresTypedConfirmation) {
        setConfirmDraft((current) => applyTextInput(current, input, key));
      }
    }
  });

  return (
    <WizardFrame
      title="Provision Organization Wizard"
      description="Linear guided flow for new client setup."
      step={step}
      steps={STEPS}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={[
        "Keys: Up/Down select field, Enter next/submit, Esc back.",
        loading ? "Working..." : "Esc on first step returns to operation tree.",
      ]}
      body={
        <>
          {step === 0 ? (
            <>
              <Text color={orgField === 0 ? "cyan" : undefined}>name: {draft.name || "<required>"}</Text>
              <Text color={orgField === 1 ? "cyan" : undefined}>slug: {draft.slug || "<auto>"}</Text>
              <Text dimColor>Resolved slug: {resolvedSlug || "<none>"}</Text>
            </>
          ) : null}
          {step === 1 ? (
            <>
              <Text color={adminField === 0 ? "cyan" : undefined}>adminEmail: {draft.adminEmail || "<required>"}</Text>
              <Text color={adminField === 1 ? "cyan" : undefined}>adminName: {draft.adminName || "<required>"}</Text>
              <Text color={adminField === 2 ? "cyan" : undefined}>
                adminPassword: {draft.adminPassword ? "***" : "<required>"}
              </Text>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Text color={configField === 0 ? "cyan" : undefined}>tierCode: {draft.tierCode || "CUSTOM"}</Text>
              <Text color={configField === 1 ? "cyan" : undefined}>
                featureTemplate: {draft.featureTemplate || "BASE"}
              </Text>
              <Text color={configField === 2 ? "cyan" : undefined}>subdomain: {draft.subdomain || "<auto>"}</Text>
              <Text dimColor>Resolved subdomain: {resolvedSubdomain || "<none>"}</Text>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <Text>org: {draft.name || "<none>"} ({resolvedSlug || "<none>"})</Text>
              <Text>admin: {draft.adminEmail || "<none>"} ({draft.adminName || "<none>"})</Text>
              <Text>tier/template: {draft.tierCode || "CUSTOM"} / {draft.featureTemplate || "BASE"}</Text>
              <Text>subdomain: {resolvedSubdomain || "<none>"}</Text>
              <Text>actor: {actor}</Text>
              {requiresTypedConfirmation ? (
                <>
                  <Text color="yellow">Type: {confirmationPhrase}</Text>
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

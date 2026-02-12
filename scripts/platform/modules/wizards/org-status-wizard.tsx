import React, { useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { OrganizationListItem, PlatformServices } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface OrgStatusWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  target: "ACTIVE" | "SUSPENDED" | "DISABLED";
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

type Step = 0 | 1 | 2;

const LABEL_BY_TARGET: Record<OrgStatusWizardProps["target"], string> = {
  ACTIVE: "Activate Organization",
  SUSPENDED: "Suspend Organization",
  DISABLED: "Disable Organization",
};

export function OrgStatusWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  target,
  setInputLocked,
  onBackToTree,
}: OrgStatusWizardProps) {
  const [step, setStep] = useState<Step>(0);
  const [rows, setRows] = useState<OrganizationListItem[]>([]);
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
    async function loadRows() {
      setLoading(true);
      try {
        const organizations = await services.org.list({ limit: 100 });
        const filtered = focusCompanyId
          ? organizations.filter((row) => row.id === focusCompanyId || row.slug === focusCompanyId)
          : organizations;
        if (!ignore) {
          setRows(filtered);
          if (filtered.length > 0) {
            setSelectedIndex(0);
          }
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load organizations.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    void loadRows();
    return () => {
      ignore = true;
    };
  }, [focusCompanyId, services.org]);

  const selected = rows[selectedIndex] ?? null;
  const requiresTypedConfirmation = target === "DISABLED";
  const confirmPhrase = useMemo(() => {
    const action = target === "ACTIVE" ? "ACTIVATE" : target === "SUSPENDED" ? "SUSPEND" : "DISABLE";
    return `CONFIRM ${action} ${selected?.slug ?? "org"}`;
  }, [selected?.slug, target]);

  async function runStatusUpdate() {
    if (!selected) return;
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const payload = { companyId: selected.id, actor, reason: reason || undefined };
      const result =
        target === "ACTIVE"
          ? await services.org.activate(payload)
          : target === "SUSPENDED"
            ? await services.org.suspend(payload)
            : await services.org.disable(payload);
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setSuccessMessage(`${result.resource.afterStatus} applied for ${selected.slug}`);
      setStatusMessage(`Updated ${selected.name}.`);
      setConfirmDraft("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update status.");
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
        setSelectedIndex((current) => Math.min(Math.max(0, rows.length - 1), current + 1));
        return;
      }
      if (key.return) {
        if (!selected) {
          setErrorMessage("No organization selected.");
          return;
        }
        setStep(1);
        setErrorMessage(null);
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
        void runStatusUpdate();
        return;
      }
      if (requiresTypedConfirmation) {
        setConfirmDraft((current) => applyTextInput(current, input, key));
      }
    }
  });

  return (
    <WizardFrame
      title={`${LABEL_BY_TARGET[target]} Wizard`}
      description="Safe status transition with explicit review and confirmation."
      step={step}
      steps={["Select Organization", "Reason", "Review & Confirm"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={["Keys: Up/Down select, Enter next/submit, Esc back.", loading ? "Working..." : "Esc on first step returns to tree."]}
      body={
        <>
          {step === 0 ? (
            <>
              <Text dimColor>Focus: {focusCompanyId || "all organizations"}</Text>
              <SelectorList
                items={rows}
                selectedIndex={selectedIndex}
                emptyMessage="No organizations available."
                render={(item) =>
                  `${item.slug} | ${item.status} | users ${String(item.activeUserCount)}/${String(item.userCount)}`
                }
              />
            </>
          ) : null}
          {step === 1 ? (
            <>
              <Text>Selected: {selected ? `${selected.name} (${selected.slug})` : "<none>"}</Text>
              <Text>reason: {reason || "<optional>"}</Text>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Text>organization: {selected ? `${selected.name} (${selected.slug})` : "<none>"}</Text>
              <Text>target: {target}</Text>
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

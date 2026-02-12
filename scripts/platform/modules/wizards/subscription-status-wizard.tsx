import React, { useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import {
  SUBSCRIPTION_STATUSES,
  type PlatformServices,
  type SubscriptionStatusValue,
  type SubscriptionSummary,
} from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface SubscriptionStatusWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

type Step = 0 | 1 | 2 | 3;

export function SubscriptionStatusWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  setInputLocked,
  onBackToTree,
}: SubscriptionStatusWizardProps) {
  const [step, setStep] = useState<Step>(0);
  const [rows, setRows] = useState<SubscriptionSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [statusIndex, setStatusIndex] = useState(1);
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
      try {
        const subscriptions = await services.subscription.list({
          companyId: focusCompanyId || undefined,
          limit: 100,
        });
        if (!ignore) {
          setRows(subscriptions);
          setSelectedIndex(0);
        }
      } catch (error) {
        if (!ignore) setErrorMessage(error instanceof Error ? error.message : "Failed to load subscriptions.");
      }
    }
    void loadRows();
    return () => {
      ignore = true;
    };
  }, [focusCompanyId, services.subscription]);

  const selected = rows[selectedIndex] ?? null;
  const statusOptions: SubscriptionStatusValue[] = [...SUBSCRIPTION_STATUSES];
  const targetStatus = statusOptions[statusIndex] as SubscriptionStatusValue;
  const requiresTypedConfirmation = targetStatus === "CANCELED" || targetStatus === "EXPIRED";
  const stepLabels = requiresTypedConfirmation
    ? ["Select Subscription", "Target Status", "Reason", "Review & Confirm"]
    : ["Select Subscription", "Target Status", "Reason & Apply"];
  const confirmPhrase = useMemo(
    () => `CONFIRM SET_STATUS ${selected?.companySlug || selected?.companyId || "company"}`,
    [selected?.companyId, selected?.companySlug],
  );

  async function runSetStatus() {
    if (!selected) return;
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await services.subscription.setStatus({
        companyId: selected.companyId,
        status: targetStatus,
        actor,
        reason: reason || undefined,
      });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setSuccessMessage(
        `${result.resource.companySlug} status: ${result.resource.beforeStatus || "none"} -> ${result.resource.afterStatus}`,
      );
      setStatusMessage("Subscription status updated.");
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
        setSelectedIndex((current) => Math.min(Math.max(0, rows.length - 1), current + 1));
        return;
      }
      if (key.return) {
        if (!selected) {
          setErrorMessage("No subscription selected.");
          return;
        }
        setStep(1);
      }
      return;
    }

    if (step === 1) {
      if (key.upArrow) {
        setStatusIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setStatusIndex((current) => Math.min(SUBSCRIPTION_STATUSES.length - 1, current + 1));
        return;
      }
      if (key.return) {
        setStep(2);
      }
      return;
    }

    if (step === 2) {
      if (key.return) {
        if (requiresTypedConfirmation) {
          setStep(3);
          return;
        }
        void runSetStatus();
        return;
      }
      setReason((current) => applyTextInput(current, input, key));
      return;
    }

    if (step === 3) {
      if (key.return) {
        if (requiresTypedConfirmation && confirmDraft.trim() !== confirmPhrase) {
          setErrorMessage(`Type exact phrase: ${confirmPhrase}`);
          return;
        }
        void runSetStatus();
        return;
      }
      if (requiresTypedConfirmation) {
        setConfirmDraft((current) => applyTextInput(current, input, key));
      }
    }
  });

  return (
    <WizardFrame
      title="Set Subscription Status Wizard"
      description="Linear workflow to update subscription status safely."
      step={step}
      steps={stepLabels}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={["Keys: Up/Down select, Enter next/submit, Esc back.", loading ? "Working..." : "Esc on first step returns to tree."]}
      body={
        <>
          {step === 0 ? (
            <SelectorList
              items={rows}
              selectedIndex={selectedIndex}
              emptyMessage="No subscriptions available."
              render={(item) => `${item.companySlug || item.companyId} | ${item.status} | plan ${item.planCode || "CUSTOM"}`}
            />
          ) : null}
          {step === 1 ? (
            <>
              <Text>company: {selected?.companySlug || selected?.companyId || "<none>"}</Text>
              <SelectorList
                items={statusOptions}
                selectedIndex={statusIndex}
                emptyMessage="No statuses."
                render={(item) => item}
              />
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Text>company: {selected?.companySlug || selected?.companyId || "<none>"}</Text>
              <Text>targetStatus: {targetStatus}</Text>
              <Text>reason: {reason || "<optional>"}</Text>
              {!requiresTypedConfirmation ? <Text color="yellow">Press Enter to apply immediately.</Text> : null}
            </>
          ) : null}
          {step === 3 ? (
            <>
              <Text>company: {selected?.companySlug || selected?.companyId || "<none>"}</Text>
              <Text>current: {selected?.status || "<none>"}</Text>
              <Text>target: {targetStatus}</Text>
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

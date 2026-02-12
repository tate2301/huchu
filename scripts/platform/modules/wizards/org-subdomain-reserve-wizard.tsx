import React, { useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { OrganizationListItem, PlatformServices, SubdomainSuggestion } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface OrgSubdomainReserveWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

type Step = 0 | 1 | 2;

export function OrgSubdomainReserveWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  setInputLocked,
  onBackToTree,
}: OrgSubdomainReserveWizardProps) {
  const [step, setStep] = useState<Step>(0);
  const [organizations, setOrganizations] = useState<OrganizationListItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [subdomain, setSubdomain] = useState("");
  const [suggestions, setSuggestions] = useState<SubdomainSuggestion[]>([]);
  const [confirmDraft, setConfirmDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
          setSelectedIndex(0);
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

  useEffect(() => {
    let ignore = false;
    async function loadSuggestions() {
      if (!subdomain.trim()) {
        setSuggestions([]);
        return;
      }
      try {
        const rows = await services.org.suggestSubdomains(subdomain.trim(), 5);
        if (!ignore) setSuggestions(rows);
      } catch {
        if (!ignore) setSuggestions([]);
      }
    }
    void loadSuggestions();
    return () => {
      ignore = true;
    };
  }, [services.org, subdomain]);

  const selected = organizations[selectedIndex] ?? null;
  const suggestionTop = suggestions[0];
  const resolvedSubdomain = subdomain.trim() || selected?.slug || "";
  const requiresTypedConfirmation = false;
  const confirmPhrase = useMemo(() => `CONFIRM RESERVE ${resolvedSubdomain || "subdomain"}`, [resolvedSubdomain]);

  async function runReserve() {
    if (!selected) return;
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }
    if (!resolvedSubdomain) {
      setErrorMessage("Subdomain is required.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await services.org.reserveSubdomain({
        companyId: selected.id,
        subdomain: resolvedSubdomain,
        actor,
        reason: "Reserved from guided TUI wizard",
      });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setSuccessMessage(`Reserved ${result.resource.subdomain} for ${selected.slug}`);
      setStatusMessage("Subdomain reservation completed.");
      setConfirmDraft("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Reservation failed.");
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
        setSelectedIndex((current) => Math.min(Math.max(0, organizations.length - 1), current + 1));
        return;
      }
      if (key.return) {
        if (!selected) {
          setErrorMessage("No organization selected.");
          return;
        }
        setSubdomain((current) => current || selected.slug);
        setStep(1);
      }
      return;
    }

    if (step === 1) {
      if (key.return) {
        if (!resolvedSubdomain) {
          setErrorMessage("Subdomain is required.");
          return;
        }
        setStep(2);
        return;
      }
      setSubdomain((current) => applyTextInput(current, input, key));
      return;
    }

    if (step === 2) {
      if (key.return) {
        if (requiresTypedConfirmation && confirmDraft.trim() !== confirmPhrase) {
          setErrorMessage(`Type exact phrase: ${confirmPhrase}`);
          return;
        }
        void runReserve();
        return;
      }
      if (requiresTypedConfirmation) {
        setConfirmDraft((current) => applyTextInput(current, input, key));
      }
    }
  });

  return (
    <WizardFrame
      title="Reserve Subdomain Wizard"
      description="Guide for selecting tenant and reserving unique subdomain."
      step={step}
      steps={["Select Organization", "Set Subdomain", "Review & Confirm"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={["Keys: Up/Down select, Enter next/submit, Esc back.", loading ? "Working..." : "Esc on first step returns to tree."]}
      body={
        <>
          {step === 0 ? (
            <SelectorList
              items={organizations}
              selectedIndex={selectedIndex}
              emptyMessage="No organizations available."
              render={(item) => `${item.name} (${item.slug})`}
            />
          ) : null}

          {step === 1 ? (
            <>
              <Text>organization: {selected ? `${selected.name} (${selected.slug})` : "<none>"}</Text>
              <Text>subdomain: {subdomain || "<required>"}</Text>
              {suggestionTop ? (
                <Text dimColor>
                  Availability: {suggestionTop.available ? "available" : "unavailable"} {suggestionTop.reason || ""}
                </Text>
              ) : null}
              {suggestions.length > 1 ? (
                <Text dimColor>
                  Suggestions:{" "}
                  {suggestions
                    .filter((row) => row.available)
                    .map((row) => row.candidate)
                    .join(", ") || "none"}
                </Text>
              ) : null}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Text>organization: {selected ? `${selected.name} (${selected.slug})` : "<none>"}</Text>
              <Text>subdomain: {resolvedSubdomain || "<none>"}</Text>
              <Text>actor: {actor}</Text>
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

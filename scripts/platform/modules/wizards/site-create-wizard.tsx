import React, { useEffect, useState } from "react";
import { Text, useInput } from "ink";

import type { OrganizationListItem, PlatformServices, SiteMeasurementUnit } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface SiteCreateWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

type Step = 0 | 1 | 2;
type Field = "name" | "code" | "location" | "measurementUnit";

const FIELDS: Field[] = ["name", "code", "location", "measurementUnit"];
const UNITS: SiteMeasurementUnit[] = ["tonnes", "trips", "wheelbarrows"];

function cycleUnit(current: SiteMeasurementUnit, direction: 1 | -1): SiteMeasurementUnit {
  const index = UNITS.indexOf(current);
  const next = (index + direction + UNITS.length) % UNITS.length;
  return UNITS[next] ?? UNITS[0];
}

export function SiteCreateWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  setInputLocked,
  onBackToTree,
}: SiteCreateWizardProps) {
  const [step, setStep] = useState<Step>(0);
  const [companies, setCompanies] = useState<OrganizationListItem[]>([]);
  const [companyIndex, setCompanyIndex] = useState(0);
  const [fieldIndex, setFieldIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    code: "",
    location: "",
    measurementUnit: "tonnes" as SiteMeasurementUnit,
  });

  useInputLock(setInputLocked, true);

  useEffect(() => {
    let ignore = false;
    async function loadCompanies() {
      try {
        const rows = await services.org.list({ limit: 100 });
        const filtered = focusCompanyId
          ? rows.filter((row) => row.id === focusCompanyId || row.slug === focusCompanyId)
          : rows;
        if (!ignore) {
          setCompanies(filtered);
          setCompanyIndex(0);
          if (focusCompanyId && filtered.length === 1) {
            setStep((current) => (current === 0 ? 1 : current));
          }
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load organizations.");
        }
      }
    }
    void loadCompanies();
    return () => {
      ignore = true;
    };
  }, [focusCompanyId, services.org]);

  const selectedCompany = companies[companyIndex] ?? null;
  const activeField = FIELDS[fieldIndex] ?? FIELDS[0];

  async function runCreate() {
    if (!selectedCompany) {
      setErrorMessage("No company selected.");
      return;
    }
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await services.site.create({
        companyId: selectedCompany.id,
        name: draft.name.trim(),
        code: draft.code.trim(),
        location: draft.location.trim() || undefined,
        measurementUnit: draft.measurementUnit,
        actor,
      });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setSuccessMessage(`Created site ${result.resource.site.code} for ${selectedCompany.slug}`);
      setStatusMessage("Site creation completed.");
      setDraft({
        name: "",
        code: "",
        location: "",
        measurementUnit: "tonnes",
      });
      setFieldIndex(0);
      setStep(1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Site creation failed.");
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
        setCompanyIndex((current) => Math.min(Math.max(0, companies.length - 1), current + 1));
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
        setFieldIndex((current) => Math.min(FIELDS.length - 1, current + 1));
        return;
      }

      if ((key.leftArrow || key.rightArrow || input === " ") && activeField === "measurementUnit") {
        const direction: 1 | -1 = key.leftArrow ? -1 : 1;
        setDraft((current) => ({
          ...current,
          measurementUnit: cycleUnit(current.measurementUnit, direction),
        }));
        return;
      }

      if (key.return) {
        if (!draft.name.trim()) {
          setErrorMessage("Site name is required.");
          return;
        }
        if (!draft.code.trim()) {
          setErrorMessage("Site code is required.");
          return;
        }
        setStep(2);
        return;
      }

      if (activeField === "measurementUnit") {
        return;
      }

      setDraft((current) => ({
        ...current,
        [activeField]: applyTextInput(current[activeField], input, key),
      }));
      return;
    }

    if (step === 2 && key.return) {
      void runCreate();
    }
  });

  return (
    <WizardFrame
      title="Create Site Wizard"
      description="Create a site under the selected company with unit and location metadata."
      step={step}
      steps={["Select Company", "Site Details", "Review & Confirm"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={[
        "Keys: Up/Down select field or item, Enter next/submit, Esc back.",
        "On measurement unit use Left/Right/Space to cycle.",
      ]}
      body={(
        <>
          {step === 0 ? (
            <SelectorList
              items={companies}
              selectedIndex={companyIndex}
              emptyMessage="No organizations available."
              render={(item) => `${item.name} (${item.slug})`}
            />
          ) : null}

          {step === 1 ? (
            <>
              <Text>company: {selectedCompany ? `${selectedCompany.name} (${selectedCompany.slug})` : "<none>"}</Text>
              <Text color={fieldIndex === 0 ? "cyan" : undefined}>name: {draft.name || "<required>"}</Text>
              <Text color={fieldIndex === 1 ? "cyan" : undefined}>code: {draft.code || "<required>"}</Text>
              <Text color={fieldIndex === 2 ? "cyan" : undefined}>location: {draft.location || "<optional>"}</Text>
              <Text color={fieldIndex === 3 ? "cyan" : undefined}>measurement unit: {draft.measurementUnit}</Text>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Text>company: {selectedCompany ? `${selectedCompany.name} (${selectedCompany.slug})` : "<none>"}</Text>
              <Text>name: {draft.name || "<none>"}</Text>
              <Text>code: {draft.code || "<none>"}</Text>
              <Text>location: {draft.location || "<none>"}</Text>
              <Text>measurement unit: {draft.measurementUnit}</Text>
              <Text color="yellow">Press Enter to confirm.</Text>
            </>
          ) : null}
        </>
      )}
    />
  );
}

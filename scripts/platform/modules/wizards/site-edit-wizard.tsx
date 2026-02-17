import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { OrganizationListItem, PlatformServices, SiteMeasurementUnit, SiteSummary } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface SiteEditWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

type Step = 0 | 1 | 2 | 3;
type Field = "name" | "code" | "location" | "measurementUnit" | "reason";

const FIELDS: Field[] = ["name", "code", "location", "measurementUnit", "reason"];
const UNITS: SiteMeasurementUnit[] = ["tonnes", "trips", "wheelbarrows"];

function cycleUnit(current: SiteMeasurementUnit, direction: 1 | -1): SiteMeasurementUnit {
  const index = UNITS.indexOf(current);
  const next = (index + direction + UNITS.length) % UNITS.length;
  return UNITS[next] ?? UNITS[0];
}

function filterSites(rows: SiteSummary[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return rows;
  return rows.filter((row) => {
    const haystack = `${row.name} ${row.code} ${row.location ?? ""}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

export function SiteEditWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  setInputLocked,
  onBackToTree,
}: SiteEditWizardProps) {
  const [step, setStep] = useState<Step>(0);
  const [companies, setCompanies] = useState<OrganizationListItem[]>([]);
  const [companyIndex, setCompanyIndex] = useState(0);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [siteIndex, setSiteIndex] = useState(0);
  const [siteSearch, setSiteSearch] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [fieldIndex, setFieldIndex] = useState(0);
  const [draft, setDraft] = useState({
    name: "",
    code: "",
    location: "",
    measurementUnit: "tonnes" as SiteMeasurementUnit,
    reason: "",
  });
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
        if (!ignore) setErrorMessage(error instanceof Error ? error.message : "Failed to load organizations.");
      }
    }
    void loadCompanies();
    return () => {
      ignore = true;
    };
  }, [focusCompanyId, services.org]);

  const selectedCompany = companies[companyIndex] ?? null;
  const visibleSites = useMemo(() => filterSites(sites, siteSearch), [siteSearch, sites]);
  const selectedSite = visibleSites[siteIndex] ?? null;
  const editingSite = useMemo(
    () => (selectedSiteId ? sites.find((site) => site.id === selectedSiteId) ?? null : null),
    [selectedSiteId, sites],
  );
  const activeField = FIELDS[fieldIndex] ?? FIELDS[0];

  useEffect(() => {
    setSiteIndex((current) => Math.min(Math.max(0, visibleSites.length - 1), current));
  }, [visibleSites.length]);

  const loadSites = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const rows = await services.site.list({
        companyId: selectedCompany.id,
        limit: 200,
      });
      setSites(rows);
      setSiteIndex(0);
      setStatusMessage(`Loaded ${rows.length} site(s) for ${selectedCompany.slug}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load sites.");
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, services.site]);

  useEffect(() => {
    if (step < 1) return;
    void loadSites();
  }, [loadSites, step]);

  async function runUpdate() {
    if (!editingSite) {
      setErrorMessage("No site selected.");
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
      const result = await services.site.update({
        siteId: editingSite.id,
        name: draft.name.trim(),
        code: draft.code.trim(),
        location: draft.location.trim() ? draft.location.trim() : null,
        measurementUnit: draft.measurementUnit,
        actor,
        reason: draft.reason.trim() || undefined,
      });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setSuccessMessage(`Updated site ${result.resource.site.code}.`);
      setStatusMessage("Site update completed.");
      setSelectedSiteId(result.resource.site.id);
      await loadSites();
      setStep(1);
      setSiteSearch("");
      setFieldIndex(0);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Site update failed.");
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
        setSiteIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setSiteIndex((current) => Math.min(Math.max(0, visibleSites.length - 1), current + 1));
        return;
      }
      if (key.return) {
        if (!selectedSite) {
          setErrorMessage("No site selected.");
          return;
        }
        setSelectedSiteId(selectedSite.id);
        setDraft({
          name: selectedSite.name,
          code: selectedSite.code,
          location: selectedSite.location ?? "",
          measurementUnit: selectedSite.measurementUnit,
          reason: "",
        });
        setFieldIndex(0);
        setStep(2);
        return;
      }
      setSiteSearch((current) => applyTextInput(current, input, key));
      return;
    }

    if (step === 2) {
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
        setStep(3);
        return;
      }
      if (activeField === "measurementUnit") return;
      setDraft((current) => ({
        ...current,
        [activeField]: applyTextInput(current[activeField], input, key),
      }));
      return;
    }

    if (step === 3 && key.return) {
      void runUpdate();
    }
  });

  return (
    <WizardFrame
      title="Edit Site Wizard"
      description="Update site metadata and measurement settings for the selected company."
      step={step}
      steps={["Select Company", "Select Site", "Edit Fields", "Review & Confirm"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={[
        "Keys: Up/Down select field or row, Enter next/submit, Esc back.",
        "In site selection step, type to search by code/name/location.",
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
              <Text>search: {siteSearch || "<none>"}</Text>
              <SelectorList
                items={visibleSites}
                selectedIndex={siteIndex}
                emptyMessage="No sites available for selected company."
                render={(item) =>
                  `${item.code} | ${item.name} | active ${String(item.isActive)} | unit ${item.measurementUnit}`
                }
              />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Text>site: {editingSite ? `${editingSite.name} (${editingSite.code})` : "<none>"}</Text>
              <Text color={fieldIndex === 0 ? "cyan" : undefined}>name: {draft.name || "<required>"}</Text>
              <Text color={fieldIndex === 1 ? "cyan" : undefined}>code: {draft.code || "<required>"}</Text>
              <Text color={fieldIndex === 2 ? "cyan" : undefined}>location: {draft.location || "<none>"}</Text>
              <Text color={fieldIndex === 3 ? "cyan" : undefined}>measurement unit: {draft.measurementUnit}</Text>
              <Text color={fieldIndex === 4 ? "cyan" : undefined}>reason: {draft.reason || "<optional>"}</Text>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Text>site: {editingSite ? `${editingSite.name} (${editingSite.code})` : "<none>"}</Text>
              <Text>name: {draft.name || "<none>"}</Text>
              <Text>code: {draft.code || "<none>"}</Text>
              <Text>location: {draft.location || "<none>"}</Text>
              <Text>measurement unit: {draft.measurementUnit}</Text>
              <Text>reason: {draft.reason || "<none>"}</Text>
              <Text color="yellow">Press Enter to confirm update.</Text>
            </>
          ) : null}
        </>
      )}
    />
  );
}

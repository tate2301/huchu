import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { OrganizationListItem, PlatformServices, SiteSummary } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface SiteStatusWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  activate: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

type Step = 0 | 1 | 2;

function filterSites(rows: SiteSummary[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return rows;
  return rows.filter((row) => {
    const haystack = `${row.name} ${row.code} ${row.location ?? ""}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

export function SiteStatusWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  activate,
  setInputLocked,
  onBackToTree,
}: SiteStatusWizardProps) {
  const [step, setStep] = useState<Step>(0);
  const [companies, setCompanies] = useState<OrganizationListItem[]>([]);
  const [companyIndex, setCompanyIndex] = useState(0);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [siteIndex, setSiteIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
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
  const targetStatus = activate ? "INACTIVE" : "ACTIVE";

  const loadSites = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const rows = await services.site.list({
        companyId: selectedCompany.id,
        status: targetStatus,
        limit: 200,
      });
      setSites(rows);
      setSiteIndex(0);
      setStatusMessage(
        `Loaded ${rows.length} ${targetStatus.toLowerCase()} site(s) for ${selectedCompany.slug}.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load sites.");
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, services.site, targetStatus]);

  useEffect(() => {
    if (step < 1) return;
    void loadSites();
  }, [loadSites, step]);

  const visibleSites = useMemo(() => filterSites(sites, search), [search, sites]);
  const selectedSite = visibleSites[siteIndex] ?? null;

  useEffect(() => {
    setSiteIndex((current) => Math.min(Math.max(0, visibleSites.length - 1), current));
  }, [visibleSites.length]);

  async function runStatusChange() {
    if (!selectedSite) {
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
      const result = activate
        ? await services.site.activate({ siteId: selectedSite.id, actor, reason: reason.trim() || undefined })
        : await services.site.deactivate({ siteId: selectedSite.id, actor, reason: reason.trim() || undefined });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setSuccessMessage(
        `${activate ? "Activated" : "Deactivated"} site ${result.resource.siteCode} (${result.resource.siteName}).`,
      );
      setStatusMessage("Site status update completed.");
      setReason("");
      await loadSites();
      setStep(1);
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
        setStep(2);
        return;
      }
      setSearch((current) => applyTextInput(current, input, key));
      return;
    }

    if (step === 2) {
      if (key.return) {
        void runStatusChange();
        return;
      }
      setReason((current) => applyTextInput(current, input, key));
    }
  });

  return (
    <WizardFrame
      title={`${activate ? "Activate" : "Deactivate"} Site Wizard`}
      description="Toggle site active status within a company scope."
      step={step}
      steps={["Select Company", "Select Site", "Reason & Apply"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={[
        "Keys: Up/Down select, Enter next/submit, Esc back.",
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
              <Text>showing: {targetStatus.toLowerCase()} sites</Text>
              <Text>search: {search || "<none>"}</Text>
              <SelectorList
                items={visibleSites}
                selectedIndex={siteIndex}
                emptyMessage={`No ${targetStatus.toLowerCase()} sites available.`}
                render={(item) =>
                  `${item.code} | ${item.name} | unit ${item.measurementUnit} | active ${String(item.isActive)}`
                }
              />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Text>site: {selectedSite ? `${selectedSite.name} (${selectedSite.code})` : "<none>"}</Text>
              <Text>target: {activate ? "ACTIVE" : "INACTIVE"}</Text>
              <Text>reason: {reason || "<optional>"}</Text>
            </>
          ) : null}
        </>
      )}
    />
  );
}

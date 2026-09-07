import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { OrganizationListItem, PlatformServices, SiteDetail, SiteSummary } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface SiteListWizardProps {
  services: PlatformServices;
  focusCompanyId: string | null;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

type Step = 0 | 1;
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

interface CompanyOption {
  id: string | null;
  name: string;
  slug: string;
}

const STATUS_FILTERS: StatusFilter[] = ["ALL", "ACTIVE", "INACTIVE"];

function cycleFilter(current: StatusFilter, direction: 1 | -1): StatusFilter {
  const index = STATUS_FILTERS.indexOf(current);
  const next = (index + direction + STATUS_FILTERS.length) % STATUS_FILTERS.length;
  return STATUS_FILTERS[next] ?? STATUS_FILTERS[0];
}

function filterByQuery(rows: SiteSummary[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return rows;
  return rows.filter((row) => {
    const haystack = `${row.name} ${row.code} ${row.location ?? ""} ${row.companyName ?? row.companyId}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

export function SiteListWizard({ services, focusCompanyId, setInputLocked, onBackToTree }: SiteListWizardProps) {
  const [step, setStep] = useState<Step>(0);
  const [companies, setCompanies] = useState<OrganizationListItem[]>([]);
  const [companyIndex, setCompanyIndex] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<SiteSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedDetail, setSelectedDetail] = useState<SiteDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useInputLock(setInputLocked, true);

  useEffect(() => {
    let ignore = false;
    async function loadCompanies() {
      try {
        const orgs = await services.org.list({ limit: 100 });
        const filtered = focusCompanyId
          ? orgs.filter((org) => org.id === focusCompanyId || org.slug === focusCompanyId)
          : orgs;
        if (!ignore) {
          setCompanies(filtered);
          setCompanyIndex(0);
          if (focusCompanyId && filtered.length === 1) {
            setStep(1);
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

  const companyOptions = useMemo<CompanyOption[]>(() => {
    if (focusCompanyId) {
      return companies.map((company) => ({ id: company.id, name: company.name, slug: company.slug }));
    }
    return [{ id: null, name: "All Companies", slug: "*" }, ...companies.map((company) => ({
      id: company.id,
      name: company.name,
      slug: company.slug,
    }))];
  }, [companies, focusCompanyId]);

  const selectedCompany = companyOptions[companyIndex] ?? null;
  const visibleRows = useMemo(() => filterByQuery(rows, search), [rows, search]);
  const selectedSite = visibleRows[selectedIndex] ?? null;
  const selectedSiteId = selectedSite?.id ?? null;

  useEffect(() => {
    setCompanyIndex((current) => Math.min(Math.max(0, companyOptions.length - 1), current));
  }, [companyOptions.length]);

  useEffect(() => {
    setSelectedIndex((current) => Math.min(Math.max(0, visibleRows.length - 1), current));
  }, [visibleRows.length]);

  const runSearch = useCallback(async () => {
    if (step !== 1) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const results = await services.site.list({
        companyId: selectedCompany?.id || undefined,
        status: statusFilter,
        limit: 150,
      });
      setRows(results);
      setStatusMessage(
        `Loaded ${results.length} site(s) for ${selectedCompany ? `${selectedCompany.name} (${selectedCompany.slug})` : "all companies"}.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to list sites.");
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, services.site, statusFilter, step]);

  useEffect(() => {
    if (step !== 1) return;
    void runSearch();
  }, [runSearch, step]);

  useEffect(() => {
    let ignore = false;
    async function loadDetail() {
      if (step !== 1 || !selectedSiteId) {
        setSelectedDetail(null);
        return;
      }
      try {
        const detail = await services.site.detail(selectedSiteId);
        if (!ignore) {
          setSelectedDetail(detail);
        }
      } catch {
        if (!ignore) {
          setSelectedDetail(null);
        }
      }
    }
    void loadDetail();
    return () => {
      ignore = true;
    };
  }, [selectedSiteId, services.site, step]);

  useInput((input, key) => {
    if (loading) return;

    if (key.escape) {
      if (step === 0) {
        onBackToTree?.();
        return;
      }
      setStep(0);
      return;
    }

    if (step === 0) {
      if (key.upArrow) {
        setCompanyIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setCompanyIndex((current) => Math.min(Math.max(0, companyOptions.length - 1), current + 1));
        return;
      }
      if (key.return) {
        if (!selectedCompany) {
          setErrorMessage("No company scope selected.");
          return;
        }
        setStep(1);
        void runSearch();
      }
      return;
    }

    if ((key.leftArrow || key.rightArrow || input === " ") && step === 1) {
      const direction: 1 | -1 = key.leftArrow ? -1 : 1;
      setStatusFilter((current) => cycleFilter(current, direction));
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((current) => Math.min(Math.max(0, visibleRows.length - 1), current + 1));
      return;
    }
    if (key.return) {
      void runSearch();
      return;
    }

    setSearch((current) => applyTextInput(current, input, key));
  });

  return (
    <WizardFrame
      title="List/Search Sites Wizard"
      description="Browse sites by company context, status, and search query."
      step={step}
      steps={["Select Company Scope", "Filters & Results"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      hints={[
        "Keys: Up/Down navigate, Enter refresh/open, Esc back.",
        "In results: type to filter by name/code/location, Left/Right/Space cycles status.",
      ]}
      body={(
        <>
          {step === 0 ? (
            <SelectorList
              items={companyOptions}
              selectedIndex={companyIndex}
              emptyMessage="No organizations available."
              render={(item) => `${item.name} (${item.slug})`}
            />
          ) : null}

          {step === 1 ? (
            <>
              <Text>scope: {selectedCompany ? `${selectedCompany.name} (${selectedCompany.slug})` : "all companies"}</Text>
              <Text>status: {statusFilter}</Text>
              <Text>search: {search || "<none>"}</Text>
              <Text dimColor>results: {visibleRows.length}</Text>
              <SelectorList
                items={visibleRows}
                selectedIndex={selectedIndex}
                emptyMessage="No sites match current filters."
                render={(item) =>
                  `${item.code} | ${item.name} | active ${String(item.isActive)} | unit ${item.measurementUnit}`
                }
              />
              <Text dimColor>Selected detail:</Text>
              {selectedDetail ? (
                <>
                  <Text>
                    {selectedDetail.code} | {selectedDetail.name} | location {selectedDetail.location || "<none>"} | unit{" "}
                    {selectedDetail.measurementUnit}
                  </Text>
                  <Text dimColor>
                    sections {selectedDetail.activeSectionCount}/{selectedDetail.sectionCount} | employees{" "}
                    {selectedDetail.employeeCount} | equipment {selectedDetail.equipmentCount} | inventory{" "}
                    {selectedDetail.inventoryItemCount}
                  </Text>
                </>
              ) : (
                <Text dimColor>No site selected.</Text>
              )}
            </>
          ) : null}
        </>
      )}
    />
  );
}

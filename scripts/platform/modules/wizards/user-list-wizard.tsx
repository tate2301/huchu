import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { OrganizationListItem, PlatformServices, UserAccountStatus, UserManagementRole, UserSummary } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface UserListWizardProps {
  services: PlatformServices;
  focusCompanyId: string | null;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

type Step = 0 | 1;
type Field = "search" | "status" | "role";
type RoleFilter = "ALL" | UserManagementRole;
type StatusFilter = "ALL" | UserAccountStatus;

interface CompanyOption {
  id: string | null;
  name: string;
  slug: string;
}

const ROLE_FILTERS: RoleFilter[] = ["ALL", "MANAGER", "CLERK"];
const STATUS_FILTERS: StatusFilter[] = ["ALL", "ACTIVE", "INACTIVE"];
const FIELDS: Field[] = ["search", "status", "role"];

function nextFromCycle<T>(cycle: readonly T[], current: T, direction: 1 | -1): T {
  const currentIndex = cycle.indexOf(current);
  const nextIndex = (currentIndex + direction + cycle.length) % cycle.length;
  return cycle[nextIndex] ?? cycle[0];
}

export function UserListWizard({ services, focusCompanyId, setInputLocked, onBackToTree }: UserListWizardProps) {
  const [step, setStep] = useState<Step>(0);
  const [companies, setCompanies] = useState<OrganizationListItem[]>([]);
  const [companyIndex, setCompanyIndex] = useState(0);
  const [fieldIndex, setFieldIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [results, setResults] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
            setStep(1);
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

  const companyOptions = useMemo<CompanyOption[]>(() => {
    if (focusCompanyId) {
      return companies.map((company) => ({ id: company.id, name: company.name, slug: company.slug }));
    }
    return [{ id: null, name: "All Companies", slug: "*" }].concat(
      companies.map((company) => ({ id: company.id, name: company.name, slug: company.slug })),
    );
  }, [companies, focusCompanyId]);

  const selectedCompany = companyOptions[companyIndex] ?? null;
  const activeField = FIELDS[fieldIndex] ?? FIELDS[0];

  useEffect(() => {
    setCompanyIndex((current) => Math.min(Math.max(0, companyOptions.length - 1), current));
  }, [companyOptions.length]);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const rows = await services.user.list({
        companyId: selectedCompany?.id || undefined,
        search: search.trim() || undefined,
        status: statusFilter === "ALL" ? undefined : statusFilter,
        role: roleFilter === "ALL" ? undefined : roleFilter,
        limit: 100,
      });
      setResults(rows);
      const scopeLabel = selectedCompany ? `${selectedCompany.name} (${selectedCompany.slug})` : "all companies";
      setStatusMessage(`Loaded ${rows.length} user(s) for ${scopeLabel}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to list users.");
    } finally {
      setLoading(false);
    }
  }, [roleFilter, search, selectedCompany, services.user, statusFilter]);

  useEffect(() => {
    if (step !== 1) return;
    void runSearch();
  }, [runSearch, step]);

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

    if (step === 1) {
      if (key.upArrow) {
        setFieldIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setFieldIndex((current) => Math.min(FIELDS.length - 1, current + 1));
        return;
      }

      if ((key.leftArrow || key.rightArrow || input === " ") && activeField === "status") {
        const direction: 1 | -1 = key.leftArrow ? -1 : 1;
        const next = nextFromCycle(STATUS_FILTERS, statusFilter, direction);
        setStatusFilter(next);
        return;
      }

      if ((key.leftArrow || key.rightArrow || input === " ") && activeField === "role") {
        const direction: 1 | -1 = key.leftArrow ? -1 : 1;
        const next = nextFromCycle(ROLE_FILTERS, roleFilter, direction);
        setRoleFilter(next);
        return;
      }

      if (activeField === "search") {
        setSearch((current) => applyTextInput(current, input, key));
      }

      if (key.return) {
        void runSearch();
      }
    }
  });

  return (
    <WizardFrame
      title="List/Search Users Wizard"
      description="Browse MANAGER and CLERK users by company scope, status, role, and search query."
      step={step}
      steps={["Select Company Scope", "Filters & Results"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      hints={[
        "Keys: Up/Down select field/item, Enter run, Esc back.",
        loading ? "Working..." : "On status/role fields use Left/Right/Space to cycle values.",
      ]}
      body={
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
              <Text>scope: {selectedCompany ? `${selectedCompany.name} (${selectedCompany.slug})` : "<none>"}</Text>
              <Text color={fieldIndex === 0 ? "cyan" : undefined}>search: {search || "<none>"}</Text>
              <Text color={fieldIndex === 1 ? "cyan" : undefined}>status: {statusFilter}</Text>
              <Text color={fieldIndex === 2 ? "cyan" : undefined}>role: {roleFilter}</Text>
              <Text dimColor>results: {results.length}</Text>
              {results.length === 0 ? (
                <Text dimColor>No users match current filters.</Text>
              ) : (
                results.slice(0, 12).map((user) => (
                  <Text key={user.id}>
                    {user.email} | {user.role} | active {String(user.isActive)} | {user.companyName || user.companyId}
                  </Text>
                ))
              )}
            </>
          ) : null}
        </>
      }
    />
  );
}

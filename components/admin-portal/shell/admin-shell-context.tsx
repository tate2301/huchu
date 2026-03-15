"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { fetchCompanies } from "@/components/admin-portal/api";
import type { CompanyWorkspace } from "@/components/admin-portal/types";

const RECENT_WORKSPACES_KEY = "admin-portal:recent-workspaces";
const MAX_RECENT_WORKSPACES = 6;

type AdminShellContextValue = {
  activeCompanyId?: string;
  activeCompany?: CompanyWorkspace;
  companies: CompanyWorkspace[];
  recentCompanies: CompanyWorkspace[];
  actorEmail: string;
  actorLabel: string;
  roleLabel: string;
  activeScope: "platform" | "organization";
  isLoadingCompanies: boolean;
};

const AdminShellContext = createContext<AdminShellContextValue | null>(null);

export function AdminShellProvider({
  activeCompanyId,
  children,
}: {
  activeCompanyId?: string;
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const [companies, setCompanies] = useState<CompanyWorkspace[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadCompanies() {
      setIsLoadingCompanies(true);
      try {
        const rows = await fetchCompanies();
        if (!ignore) {
          setCompanies(rows);
        }
      } catch {
        if (!ignore) {
          setCompanies([]);
        }
      } finally {
        if (!ignore) {
          setIsLoadingCompanies(false);
        }
      }
    }

    void loadCompanies();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(RECENT_WORKSPACES_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setRecentIds(parsed.filter((value): value is string => typeof value === "string"));
      }
    } catch {
      setRecentIds([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !activeCompanyId) return;

    setRecentIds((current) => {
      const next = [activeCompanyId, ...current.filter((value) => value !== activeCompanyId)].slice(0, MAX_RECENT_WORKSPACES);
      window.localStorage.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(next));
      return next;
    });
  }, [activeCompanyId]);

  const activeCompany = useMemo(
    () => companies.find((company) => company.id === activeCompanyId),
    [activeCompanyId, companies],
  );

  const recentCompanies = useMemo(() => {
    if (recentIds.length === 0) return [];
    const companyMap = new Map(companies.map((company) => [company.id, company]));
    return recentIds.map((id) => companyMap.get(id)).filter((company): company is CompanyWorkspace => Boolean(company));
  }, [companies, recentIds]);

  const actorEmail = session?.user?.email?.trim() || "superuser";
  const actorLabel = session?.user?.name?.trim() || actorEmail;
  const roleLabel = (session?.user as { role?: string } | undefined)?.role?.trim() || "SUPERADMIN";

  const value = useMemo<AdminShellContextValue>(
    () => ({
      activeCompanyId,
      activeCompany,
      companies,
      recentCompanies,
      actorEmail,
      actorLabel,
      roleLabel,
      activeScope: activeCompanyId ? "organization" : "platform",
      isLoadingCompanies,
    }),
    [activeCompany, activeCompanyId, actorEmail, actorLabel, companies, isLoadingCompanies, recentCompanies, roleLabel],
  );

  return <AdminShellContext.Provider value={value}>{children}</AdminShellContext.Provider>;
}

export function useAdminShell() {
  const context = useContext(AdminShellContext);
  if (!context) {
    throw new Error("useAdminShell must be used within AdminShellProvider");
  }
  return context;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, CommandIcon, Search, Shield, Sparkles } from "lucide-react";
import { searchAdminPortal } from "@/components/admin-portal/api";
import type { AdminSearchResult } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getQuickActions } from "./admin-config";
import { useAdminShell } from "./admin-shell-context";

function searchResultHref(result: AdminSearchResult) {
  if (result.kind === "organization" && result.companyId) {
    return `/admin/clients/${result.companyId}`;
  }

  if (result.kind === "admin" && result.companyId) {
    return `/admin/company/${result.companyId}/identity`;
  }

  if ((result.kind === "incident" || result.kind === "runbook") && result.companyId) {
    return `/admin/company/${result.companyId}/reliability`;
  }

  return "/admin/dashboard";
}

function resultBadgeLabel(result: AdminSearchResult) {
  if (result.kind === "organization") return "Workspace";
  if (result.kind === "admin") return "User";
  if (result.kind === "incident") return "Incident";
  if (result.kind === "runbook") return "Runbook";
  return "Command";
}

export function AdminCommandBar() {
  const router = useRouter();
  const { activeCompanyId, companies, recentCompanies } = useAdminShell();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminSearchResult[]>([]);
  const quickActions = useMemo(() => getQuickActions(activeCompanyId), [activeCompanyId]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }

      if (!isTypingTarget && event.key === "/") {
        event.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    const timeout = window.setTimeout(() => {
      void searchAdminPortal(trimmed)
        .then(setResults)
        .catch(() => setResults([]));
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [open, query]);

  const companyRows = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return companies.slice(0, 8);
    return companies
      .filter((company) => {
        const haystack = `${company.name} ${company.slug ?? ""} ${company.id}`.toLowerCase();
        return haystack.includes(trimmed);
      })
      .slice(0, 8);
  }, [companies, query]);

  const navigate = (href: string) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(href);
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setQuery("");
          setResults([]);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-between rounded-2xl border-[var(--border)] bg-[var(--surface-base)] px-4 text-[var(--text-muted)] md:w-[28rem]">
          <span className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Search workspaces, users, commands, and quick actions
          </span>
          <span className="hidden items-center gap-1 text-xs md:inline-flex">
            <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono">Ctrl</kbd>
            <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono">K</kbd>
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Control plane command bar</DialogTitle>
        </DialogHeader>
        <Command className="rounded-none">
            <CommandInput
              value={query}
              onValueChange={handleQueryChange}
              placeholder="Search organizations, users, ids, incidents, and quick actions"
            />
          <CommandList className="max-h-[34rem]">
            <CommandEmpty>No matching commands or records.</CommandEmpty>

            <CommandGroup heading="Quick actions">
              {quickActions.map((action) => (
                <CommandItem
                  key={action.id}
                  value={`${action.label} ${action.description}`}
                  onSelect={() => navigate(action.href)}
                >
                  <Sparkles className="h-4 w-4 text-[var(--text-muted)]" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{action.label}</p>
                    <p className="truncate text-xs text-[var(--text-muted)]">{action.description}</p>
                  </div>
                  <Badge variant="secondary" className="rounded-full">
                    {action.scope}
                  </Badge>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Recent workspaces">
              {(recentCompanies.length > 0 ? recentCompanies : companies.slice(0, 5)).map((company) => (
                <CommandItem
                  key={company.id}
                  value={`${company.name} ${company.slug ?? ""} ${company.id}`}
                  onSelect={() => navigate(`/admin/clients/${company.id}`)}
                >
                  <Building2 className="h-4 w-4 text-[var(--text-muted)]" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{company.name}</p>
                    <p className="truncate text-xs text-[var(--text-muted)]">{company.slug ?? company.id}</p>
                  </div>
                  {company.status ? <Badge variant="outline">{company.status}</Badge> : null}
                </CommandItem>
              ))}
            </CommandGroup>

            {companyRows.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Workspace jump">
                  {companyRows.map((company) => (
                    <CommandItem
                      key={`workspace:${company.id}`}
                      value={`${company.name} ${company.slug ?? ""} ${company.id}`}
                      onSelect={() => navigate(`/admin/clients/${company.id}`)}
                    >
                      <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{company.name}</p>
                        <p className="truncate text-xs text-[var(--text-muted)]">{company.slug ?? company.id}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}

            {results.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Global results">
                  {results.map((result) => (
                    <CommandItem
                      key={result.id}
                      value={`${result.label} ${result.detail} ${result.keywords.join(" ")}`}
                      onSelect={() => navigate(searchResultHref(result))}
                    >
                      <Shield className="h-4 w-4 text-[var(--text-muted)]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{result.label}</p>
                          <Badge variant="outline" className="rounded-full">
                            {resultBadgeLabel(result)}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-[var(--text-muted)]">{result.detail}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export function AdminCommandBarHint() {
  return (
    <div className="hidden items-center gap-2 text-xs text-[var(--text-muted)] lg:flex">
      <CommandIcon className="h-3.5 w-3.5" />
      <span>Global command bar</span>
      <Link href="/admin/commercial" className="rounded-full border border-[var(--border)] px-2 py-0.5 hover:bg-[var(--surface-muted)]">
        Commercial Center
      </Link>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CompanyWorkspace } from "@/components/admin-portal/types";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type CommandEntry = {
  id: string;
  label: string;
  hint: string;
  href: string;
  disabled?: boolean;
};

export function AdminCommandBar({
  companies,
  activeCompanyId,
}: {
  companies: CompanyWorkspace[];
  activeCompanyId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const activeCompany = companies.find((company) => company.id === activeCompanyId);

  const entries = useMemo<CommandEntry[]>(() => {
    const platformEntries: CommandEntry[] = [
      { id: "platform-dashboard", label: "Platform Dashboard", hint: "Route", href: "/admin/dashboard" },
      { id: "platform-operations", label: "Platform Operations", hint: "Route", href: "/admin/operations" },
      { id: "platform-features", label: "Platform Features", hint: "Route", href: "/admin/features" },
      { id: "platform-companies", label: "Organizations", hint: "Route", href: "/admin/companies" },
    ];

    const companyEntries: CommandEntry[] = activeCompanyId
      ? [
          { id: "company-dashboard", label: "Company Dashboard", hint: "Context action", href: `/admin/company/${activeCompanyId}/dashboard` },
          { id: "company-operations", label: "Company Operations", hint: "Context action", href: `/admin/company/${activeCompanyId}/operations` },
          { id: "company-features", label: "Company Features", hint: "Context action", href: `/admin/company/${activeCompanyId}/features` },
          { id: "context-platform", label: "Switch to Platform Context", hint: "Context action", href: "/admin/dashboard" },
        ]
      : [
          { id: "context-choose-company", label: "Choose Company Context", hint: "Context action", href: "/admin/companies" },
        ];

    const companySwitchEntries: CommandEntry[] = companies.map((company) => ({
      id: `switch-${company.id}`,
      label: `Switch to ${company.name}`,
      hint: "Company context",
      href: `/admin/company/${company.id}/dashboard`,
    }));

    return [...platformEntries, ...companyEntries, ...companySwitchEntries];
  }, [companies, activeCompanyId]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return entries;
    return entries.filter((entry) => `${entry.label} ${entry.hint}`.toLowerCase().includes(normalized));
  }, [entries, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const run = (entry: CommandEntry) => {
    if (entry.disabled) return;
    setOpen(false);
    setQuery("");
    router.push(entry.href);
  };

  return (
    <>
      <div className="flex items-center justify-between rounded-xl border bg-[var(--surface-base)] px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Command bar</p>
          <p className="truncate text-sm text-[var(--text-muted)]">
            {activeCompany ? `Company context: ${activeCompany.name}` : "Platform context"} • Press Ctrl/Cmd + K
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Open commands
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Admin command bar</DialogTitle>
          </DialogHeader>
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search routes or context actions"
            />
            <CommandList>
              {filtered.length === 0 ? (
                <CommandEmpty>No matching command.</CommandEmpty>
              ) : (
                <CommandGroup heading="Routes & actions">
                  {filtered.map((entry) => (
                    <CommandItem
                      key={entry.id}
                      value={`${entry.label} ${entry.hint}`}
                      disabled={entry.disabled}
                      onMouseDown={(event) => event.preventDefault()}
                      onSelect={() => run(entry)}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span>{entry.label}</span>
                        <span className="text-xs text-[var(--text-muted)]">{entry.hint}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}

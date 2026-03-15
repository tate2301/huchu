"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronsUpDown, Layers3, Sparkles } from "lucide-react";
import { CompanyWorkspace } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAdminShell } from "./admin-shell-context";

type Props = {
  activeCompanyId?: string;
  companies: CompanyWorkspace[];
};

export function WorkspaceSwitcher({ activeCompanyId, companies }: Props) {
  const router = useRouter();
  const { recentCompanies } = useAdminShell();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const activeCompany = companies.find((company) => company.id === activeCompanyId);
  const filteredCompanies = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return companies;
    return companies.filter((company) => {
      const haystack = `${company.name} ${company.slug ?? ""} ${company.id}`.toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [companies, query]);

  const selectWorkspace = (companyId?: string) => {
    setOpen(false);
    setQuery("");
    router.push(companyId ? `/admin/clients/${companyId}` : "/admin/dashboard");
  };

  return (
    <div className="space-y-3 rounded-[22px] border border-[var(--border)] bg-[var(--surface-base)] p-4">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Workspace</p>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-[var(--text-strong)]">{activeCompany?.name ?? "Platform"}</p>
            <p className="text-xs text-[var(--text-muted)]">
              {activeCompany ? activeCompany.slug ?? activeCompany.id : "Global control plane scope"}
            </p>
          </div>
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {activeCompany ? "Organization" : "Platform"}
          </Badge>
        </div>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between rounded-2xl">
            <span className="flex items-center gap-2">
              <Layers3 className="h-4 w-4" />
              Switch workspace
            </span>
            <ChevronsUpDown className="h-4 w-4 text-[var(--text-muted)]" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[24rem] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder="Search clients, slugs, and workspace ids" />
            <CommandList className="max-h-[24rem]">
              <CommandEmpty>No matching workspace.</CommandEmpty>

              <CommandGroup heading="Platform">
                <CommandItem value="platform global control plane" onSelect={() => selectWorkspace()}>
                  <Sparkles className="h-4 w-4 text-[var(--text-muted)]" />
                  <div className="flex-1">
                    <p className="font-medium">Platform</p>
                    <p className="text-xs text-[var(--text-muted)]">Dashboard, catalogs, health, and cross-company actions</p>
                  </div>
                  {!activeCompany ? <Check className="h-4 w-4" /> : null}
                </CommandItem>
              </CommandGroup>

              {recentCompanies.length > 0 ? (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Recent workspaces">
                    {recentCompanies.map((company) => (
                      <CommandItem
                        key={`recent:${company.id}`}
                        value={`${company.name} ${company.slug ?? ""} ${company.id}`}
                        onSelect={() => selectWorkspace(company.id)}
                      >
                        <Building2 className="h-4 w-4 text-[var(--text-muted)]" />
                        <div className="flex-1">
                          <p className="font-medium">{company.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">{company.slug ?? company.id}</p>
                        </div>
                        {company.id === activeCompanyId ? <Check className="h-4 w-4" /> : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              ) : null}

              <CommandSeparator />
              <CommandGroup heading="Organizations">
                {filteredCompanies.slice(0, 12).map((company) => (
                  <CommandItem
                    key={company.id}
                    value={`${company.name} ${company.slug ?? ""} ${company.id}`}
                    onSelect={() => selectWorkspace(company.id)}
                  >
                    <Building2 className="h-4 w-4 text-[var(--text-muted)]" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{company.name}</p>
                        {company.status ? <Badge variant="outline">{company.status}</Badge> : null}
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">{company.slug ?? company.id}</p>
                    </div>
                    {company.id === activeCompanyId ? <Check className="h-4 w-4" /> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

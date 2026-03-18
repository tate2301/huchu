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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-10 w-full justify-between rounded-xl border-[var(--border)] bg-[var(--surface-base)] px-3 shadow-none">
          <span className="flex min-w-0 items-center gap-2 text-left">
            <Layers3 className="h-4 w-4 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{activeCompany?.name ?? "Platform"}</span>
              <span className="block truncate text-xs text-[var(--text-muted)]">{activeCompany ? activeCompany.slug ?? activeCompany.id : "All workspaces"}</span>
            </span>
          </span>
          <span className="flex items-center gap-2">
            <Badge variant="secondary" className="hidden rounded-full px-2.5 py-1 md:inline-flex">
              {activeCompany ? "Workspace" : "Platform"}
            </Badge>
            <ChevronsUpDown className="h-4 w-4 text-[var(--text-muted)]" />
          </span>
        </Button>
      </PopoverTrigger>
        <PopoverContent className="w-[24rem] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder="Search workspaces" />
            <CommandList className="max-h-[24rem]">
              <CommandEmpty>No matching workspace.</CommandEmpty>

              <CommandGroup heading="Platform">
                <CommandItem value="platform global control plane" onSelect={() => selectWorkspace()}>
                  <Sparkles className="h-4 w-4 text-[var(--text-muted)]" />
                  <div className="flex-1"><p className="font-medium">Platform</p></div>
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
                    </div>
                    {company.id === activeCompanyId ? <Check className="h-4 w-4" /> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
    </Popover>
  );
}

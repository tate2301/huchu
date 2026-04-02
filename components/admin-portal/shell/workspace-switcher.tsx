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
        <Button variant="ghost" className="h-12 w-full justify-between rounded-[10px] bg-[var(--surface-muted)] px-3 text-left shadow-none hover:bg-[var(--button-ghost-hover-bg)]">
          <span className="flex min-w-0 items-center gap-2 text-left">
            <Layers3 className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {activeCompany ? "Workspace" : "Platform"}
              </span>
              <span className="block truncate text-[13px] font-medium">{activeCompany?.name ?? "Platform"}</span>
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        </Button>
      </PopoverTrigger>
        <PopoverContent className="w-[22rem] rounded-2xl border-none p-1 shadow-[0_12px_40px_rgba(15,23,42,0.12)]" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder="Search workspaces" className="h-10" />
            <CommandList className="max-h-[24rem]">
              <CommandEmpty>No matching workspace.</CommandEmpty>

              <CommandGroup heading="Platform">
                <CommandItem value="platform global control plane" onSelect={() => selectWorkspace()} className="rounded-xl px-2 py-2">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <div className="flex-1"><p className="text-[13px] font-medium">Platform</p></div>
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
                        className="rounded-xl px-2 py-2"
                      >
                        <Building2 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                        <div className="flex-1">
                          <p className="text-[13px] font-medium">{company.name}</p>
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
                    className="rounded-xl px-2 py-2"
                  >
                    <Building2 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium">{company.name}</p>
                        {company.status ? <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px]">{company.status}</Badge> : null}
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

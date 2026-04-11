"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CompanyWorkspace } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckIcon, ChevronDown, Zap } from "@/lib/icons";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Props = {
  activeCompanyId?: string;
  companies: CompanyWorkspace[];
};

export function WorkspaceSwitcher({ activeCompanyId, companies }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const activeCompany = companies.find(
    (company) => company.id === activeCompanyId,
  );
  const triggerMonogram =
    (activeCompany?.name ?? "Platform").trim().charAt(0).toUpperCase() || "P";
  const getMonogram = (value: string) =>
    value.trim().charAt(0).toUpperCase() || "W";
  const filteredCompanies = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return companies;
    return companies.filter((company) => {
      const haystack =
        `${company.name} ${company.slug ?? ""} ${company.id}`.toLowerCase();
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
        <Button
          variant="outline"
          className="group/switcher h-11 w-full justify-between rounded-[10px] bg-[var(--surface-base)] px-2.5 text-left shadow-none transition-[background-color,color,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] hover:translate-x-[1px] hover:bg-[var(--sidebar-accent)] data-[state=open]:bg-[var(--action-secondary-bg)] lg:h-10"
        >
          <span className="flex min-w-0 items-center gap-2.5 text-left">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-[#1f1c18] text-[10px] font-semibold text-white">
              {triggerMonogram}
            </span>
            <span className="truncate text-[14px] font-medium text-[var(--text-strong)]">
              {activeCompany?.name ?? "Platform"}
            </span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] group-data-[state=open]/switcher:rotate-180" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(23rem,calc(100vw-1rem))] p-1.5" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search workspaces"
            className="h-10"
          />
          <CommandList className="max-h-[24rem]">
            <CommandEmpty>No matching workspace.</CommandEmpty>

            <CommandGroup>
              <CommandItem
                value="platform global control plane"
                onSelect={() => selectWorkspace()}
                className="min-h-11 rounded-[12px] px-2 py-2 transition-[background-color,color,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] hover:translate-x-[1px]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-[#1f1c18] text-[11px] font-semibold text-white">
                  <Zap className="h-3.5 w-3.5" />
                </span>
                <div className="flex-1">
                  <p className="text-[13px] font-medium">Platform</p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Global control plane
                  </p>
                </div>
                {!activeCompany ? <CheckIcon className="h-4 w-4" /> : null}
              </CommandItem>
            </CommandGroup>
            <div className="p-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                Organizations
              </p>
            </div>

            <CommandGroup>
              {filteredCompanies.slice(0, 12).map((company) => (
                <CommandItem
                  key={company.id}
                  value={`${company.name} ${company.slug ?? ""} ${company.id}`}
                  onSelect={() => selectWorkspace(company.id)}
                  className="min-h-11 rounded-[12px] border-none px-2 py-2 transition-[background-color,color,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] hover:translate-x-[1px]"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-[var(--surface-soft)] text-[11px] font-semibold text-[var(--text-strong)]">
                    {getMonogram(company.name)}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-medium">{company.name}</p>
                      {company.status && company.status !== "ACTIVE" ? (
                        <Badge
                          variant="danger"
                          className="rounded-full px-2 py-0 text-[10px]"
                        >
                          {company.status}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {company.slug ?? company.id}
                    </p>
                  </div>
                  {company.id === activeCompanyId ? (
                    <CheckIcon className="h-4 w-4" />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

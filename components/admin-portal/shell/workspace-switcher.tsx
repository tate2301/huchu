"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompanyWorkspace } from "@/components/admin-portal/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  activeCompanyId?: string;
  companies: CompanyWorkspace[];
};

export function WorkspaceSwitcher({ activeCompanyId, companies }: Props) {
  const pathname = usePathname();
  const activeCompany = companies.find((company) => company.id === activeCompanyId);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Workspace</p>
      <div className="flex items-center gap-2">
        <Select
          value={activeCompanyId ?? "platform"}
          onValueChange={(value) => {
            if (typeof window === "undefined") return;
            if (value === "platform") {
              window.location.href = "/admin/dashboard";
              return;
            }
            window.location.href = `/admin/company/${value}/dashboard`;
          }}
        >
          <SelectTrigger className="h-9 flex-1">
            <SelectValue placeholder="Select organization" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="platform">Platform scope</SelectItem>
            {companies.map((company) => (
              <SelectItem key={company.id} value={company.id}>
                {company.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {activeCompany ? (
          <Button asChild variant="outline" size="icon" className="h-9 w-9">
            <Link href={`/admin/company/${activeCompany.id}/features`} aria-label="Configure active organization">
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
        ) : null}
      </div>
      {activeCompany ? (
        <p className="text-xs text-[var(--text-muted)]">Active: <span className="font-mono">{activeCompany.slug ?? activeCompany.id}</span></p>
      ) : pathname.includes("/company/") ? (
        <p className="text-xs text-[var(--text-muted)]">Loading workspace…</p>
      ) : null}
    </div>
  );
}

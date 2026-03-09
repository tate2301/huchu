"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchCompanies } from "@/components/admin-portal/api";
import { CompanyWorkspace } from "@/components/admin-portal/types";

export function CompaniesPage() {
  const [companies, setCompanies] = useState<CompanyWorkspace[]>([]);

  useEffect(() => {
    void fetchCompanies().then(setCompanies).catch(() => setCompanies([]));
  }, []);

  return (
    <section className="space-y-3 rounded-xl border bg-[var(--surface-base)] p-4">
      <h1 className="text-xl font-semibold">Select organization</h1>
      <p className="text-sm text-[var(--text-muted)]">Choose a workspace to unlock company-scoped actions.</p>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Slug</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Open</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id} className="border-t">
                <td className="px-3 py-2">{company.name}</td>
                <td className="px-3 py-2 font-mono">{company.slug ?? "-"}</td>
                <td className="px-3 py-2">{company.status ?? "-"}</td>
                <td className="px-3 py-2">
                  <Button asChild size="sm">
                    <Link href={`/admin/company/${company.id}/dashboard`}>Manage</Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

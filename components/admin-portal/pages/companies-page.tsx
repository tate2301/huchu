"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Search } from "lucide-react";
import { fetchCommercialCenter } from "@/components/admin-portal/api";
import { useAdminShell } from "@/components/admin-portal/shell/admin-shell-context";
import type { CommercialCenterData, CompanyWorkspace } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { ChangeTierWizard, CreateClientWizard } from "@/components/admin-portal/wizards/platform-wizards";
import { TIERS } from "@/lib/platform/feature-catalog";

type CompanyRow = CompanyWorkspace & {
  subscription: CommercialCenterData["subscriptions"][number] | null;
};

const statusOptions = [
  { value: "all", label: "All subscription statuses" },
  { value: "ACTIVE", label: "ACTIVE" },
  { value: "TRIALING", label: "TRIALING" },
  { value: "PAST_DUE", label: "PAST_DUE" },
  { value: "CANCELED", label: "CANCELED" },
  { value: "EXPIRED", label: "EXPIRED" },
  { value: "NONE", label: "No subscription" },
];

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  return new Date(value).toLocaleDateString();
}

export function CompaniesPage({ actorEmail }: { actorEmail: string }) {
  const { companies, isLoadingCompanies } = useAdminShell();
  const [commercial, setCommercial] = useState<CommercialCenterData | null>(null);
  const [isLoadingCommercial, setIsLoadingCommercial] = useState(true);
  const [commercialError, setCommercialError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tierWizardClient, setTierWizardClient] = useState<CompanyWorkspace | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadCommercial() {
      setIsLoadingCommercial(true);
      setCommercialError(null);
      try {
        const payload = await fetchCommercialCenter();
        if (!ignore) {
          setCommercial(payload);
        }
      } catch (error) {
        if (!ignore) {
          setCommercial(null);
          setCommercialError(error instanceof Error ? error.message : "Failed to load live subscription data");
        }
      } finally {
        if (!ignore) {
          setIsLoadingCommercial(false);
        }
      }
    }

    void loadCommercial();
    return () => {
      ignore = true;
    };
  }, []);

  const rows = useMemo<CompanyRow[]>(() => {
    const latestSubscriptions = new Map<string, CommercialCenterData["subscriptions"][number]>();

    for (const subscription of commercial?.subscriptions ?? []) {
      if (!latestSubscriptions.has(subscription.companyId)) {
        latestSubscriptions.set(subscription.companyId, subscription);
      }
    }

    return companies.map((company) => ({
      ...company,
      subscription: latestSubscriptions.get(company.id) ?? null,
    }));
  }, [commercial, companies]);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      const subscriptionStatus = row.subscription?.status ?? "NONE";
      const matchesSearch =
        !term ||
        row.name.toLowerCase().includes(term) ||
        row.slug?.toLowerCase().includes(term) ||
        row.subscription?.planName?.toLowerCase().includes(term) ||
        subscriptionStatus.toLowerCase().includes(term);
      const matchesTier = tierFilter === "all" || row.subscription?.planCode === tierFilter;
      const matchesStatus = statusFilter === "all" || subscriptionStatus === statusFilter;
      return matchesSearch && matchesTier && matchesStatus;
    });
  }, [rows, searchTerm, statusFilter, tierFilter]);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Live client directory with workspace state, current subscription context, and guided actions.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <CreateClientWizard actorEmail={actorEmail} />
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/commercial?view=templates">Apply templates</Link>
        </Button>
      </div>

      <Card className="border-[var(--border)]">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Client list</CardTitle>
            <CardDescription>One table, live workspace data, and no synthetic pricing or add-on summaries.</CardDescription>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href="/admin/reliability?view=health">Reliability monitor</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {commercialError ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {commercialError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2 md:grid-cols-10">
            <div className="md:col-span-5">
              <Label className="sr-only">Search</Label>
              <div className="flex items-center gap-2 rounded-md border px-3">
                <Search className="h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search workspace, slug, or plan"
                  className="border-0 px-0 shadow-none focus-visible:ring-0"
                />
              </div>
            </div>
            <div className="md:col-span-3">
              <Label className="sr-only">Plan</Label>
              <Select value={tierFilter} onValueChange={setTierFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All plans</SelectItem>
                  {TIERS.map((tier) => (
                    <SelectItem key={tier.code} value={tier.code}>{tier.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="sr-only">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((status) => (
                    <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2">Client Name</th>
                  <th className="px-3 py-2">Workspace Status</th>
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2">Subscription Status</th>
                  <th className="px-3 py-2">Last Updated</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingCompanies || isLoadingCommercial ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-[var(--text-muted)]" colSpan={6}>
                      Loading live client directory...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-[var(--text-muted)]" colSpan={6}>No clients match your filters.</td>
                  </tr>
                ) : (
                  filteredRows.map((client) => (
                    <tr key={client.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{client.name}</div>
                        <p className="text-xs text-[var(--text-muted)]">{client.slug ?? client.id}</p>
                      </td>
                      <td className="px-3 py-2">
                        <StatusChip status={client.status ?? "Pending"} />
                      </td>
                      <td className="px-3 py-2">
                        {client.subscription?.planName ? (
                          <Badge variant="outline" className="font-medium">{client.subscription.planName}</Badge>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">No live plan</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <StatusChip status={client.subscription?.status ?? "Pending"} />
                      </td>
                      <td className="px-3 py-2 text-xs text-[var(--text-muted)]">{formatDate(client.subscription?.updatedAt)}</td>
                      <td className="px-3 py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/clients/${client.id}`}>View Client</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/company/${client.id}/identity`}>Open Identity Hub</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/company/${client.id}/commercial`}>Open Commercial Center</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/company/${client.id}/support-access`}>Open Support Access</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setTierWizardClient(client)}>Change Tier (wizard)</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {tierWizardClient ? (
        <ChangeTierWizard
          actorEmail={actorEmail}
          companyId={tierWizardClient.id}
          companyName={tierWizardClient.name}
        />
      ) : null}
    </section>
  );
}

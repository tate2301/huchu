"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Search } from "lucide-react";
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
import { fetchCompanies } from "@/components/admin-portal/api";
import { enrichClients, type EnrichedClient } from "./client-data";
import { FEATURE_BUNDLES, TIERS } from "@/lib/platform/feature-catalog";
import { ChangeTierWizard, CreateClientWizard, ManageAddonsWizard } from "@/components/admin-portal/wizards/platform-wizards";

const statusOptions = ["All statuses", "ACTIVE", "EXPIRING_SOON", "IN_GRACE", "PAST_DUE", "CANCELED"];

function formatCurrency(value: number) {
  return `$${value.toLocaleString()}/month`;
}

export function CompaniesPage({ actorEmail }: { actorEmail: string }) {
  const [clients, setClients] = useState<EnrichedClient[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("All statuses");
  const [addonFilter, setAddonFilter] = useState<string>("all");
  const [tierWizardClient, setTierWizardClient] = useState<EnrichedClient | null>(null);
  const [addonWizardClient, setAddonWizardClient] = useState<EnrichedClient | null>(null);

  useEffect(() => {
    void fetchCompanies()
      .then((data) => setClients(enrichClients(data)))
      .catch(() => setClients([]));
  }, []);

  const filteredClients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return clients.filter((client) => {
      const matchesSearch =
        !term ||
        client.name.toLowerCase().includes(term) ||
        client.slug?.toLowerCase().includes(term) ||
        client.tierName.toLowerCase().includes(term);
      const matchesTier = tierFilter === "all" || client.tierCode === tierFilter;
      const matchesStatus = statusFilter === "All statuses" || client.status === statusFilter;
      const matchesAddon =
        addonFilter === "all" ||
        client.addonCodes.some((code) => code === addonFilter);
      return matchesSearch && matchesTier && matchesStatus && matchesAddon;
    });
  }, [addonFilter, clients, searchTerm, statusFilter, tierFilter]);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Layman-friendly client directory with search, filters, and guided actions.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <CreateClientWizard actorEmail={actorEmail} />
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/templates">Apply templates</Link>
        </Button>
      </div>

      <Card className="border-[var(--border)]">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Client list</CardTitle>
            <CardDescription>One table, predictable controls, progressive disclosure via action menus.</CardDescription>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href="/admin/health">Health monitor</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
            <div className="md:col-span-4">
              <Label className="sr-only">Search</Label>
              <div className="flex items-center gap-2 rounded-md border px-3">
                <Search className="h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by name, tier, status"
                  className="border-0 px-0 shadow-none focus-visible:ring-0"
                />
              </div>
            </div>
            <div className="md:col-span-3">
              <Label className="sr-only">Tier</Label>
              <Select value={tierFilter} onValueChange={setTierFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tiers</SelectItem>
                  {TIERS.map((tier) => (
                    <SelectItem key={tier.code} value={tier.code}>{tier.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Label className="sr-only">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((status) => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="sr-only">Add-on</Label>
              <Select value={addonFilter} onValueChange={setAddonFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Add-on" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All add-ons</SelectItem>
                  {FEATURE_BUNDLES.map((bundle) => (
                    <SelectItem key={bundle.code} value={bundle.code}>{bundle.name}</SelectItem>
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
                  <th className="px-3 py-2">Tier</th>
                  <th className="px-3 py-2">Active Sites</th>
                  <th className="px-3 py-2">Add-ons</th>
                  <th className="px-3 py-2">Subscription Status</th>
                  <th className="px-3 py-2">Monthly Amount</th>
                  <th className="px-3 py-2">Last Updated</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-[var(--text-muted)]" colSpan={8}>No clients match your filters.</td>
                  </tr>
                ) : (
                  filteredClients.map((client) => (
                    <tr key={client.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{client.name}</div>
                        <p className="text-xs text-[var(--text-muted)]">{client.slug ?? client.id}</p>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="font-medium">{client.tierName}</Badge>
                      </td>
                      <td className="px-3 py-2 font-mono">{client.activeSites}</td>
                      <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                        {client.addonCodes.length === 0 ? "None" : client.addonCodes.map((code) => FEATURE_BUNDLES.find((bundle) => bundle.code === code)?.name ?? code).join(", ")}
                      </td>
                      <td className="px-3 py-2">
                        <StatusChip status={client.status} />
                      </td>
                      <td className="px-3 py-2 font-mono">{formatCurrency(client.monthlyAmount)}</td>
                      <td className="px-3 py-2 text-xs text-[var(--text-muted)]">{new Date(client.lastUpdated).toLocaleDateString()}</td>
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
                            <DropdownMenuItem onSelect={() => setTierWizardClient(client)}>Change Tier (wizard)</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setAddonWizardClient(client)}>Manage Add-ons (wizard)</DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/clients/${client.id}#subscription`}>Edit Plan</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/clients/${client.id}#addons`}>View Add-ons</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/clients/${client.id}#features`}>View Features</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem>Support Login</DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600">Suspend Client</DropdownMenuItem>
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

      {addonWizardClient ? (
        <ManageAddonsWizard
          actorEmail={actorEmail}
          companyId={addonWizardClient.id}
          companyName={addonWizardClient.name}
          currentAddonCodes={addonWizardClient.addonCodes}
          siteCount={addonWizardClient.activeSites}
        />
      ) : null}
    </section>
  );
}

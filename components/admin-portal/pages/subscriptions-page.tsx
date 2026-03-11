"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { fetchCompanies } from "@/components/admin-portal/api";
import { enrichClients, getPricingBreakdown, type EnrichedClient } from "./client-data";
import { TIERS } from "@/lib/platform/feature-catalog";

function formatCurrency(value: number) {
  return `$${value.toLocaleString()}`;
}

export function SubscriptionsPage() {
  const [clients, setClients] = useState<EnrichedClient[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    void fetchCompanies()
      .then((data) => setClients(enrichClients(data)))
      .catch(() => setClients([]));
  }, []);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return clients.filter((client) => {
      const matchesSearch = !term || client.name.toLowerCase().includes(term) || client.slug?.toLowerCase().includes(term);
      const matchesTier = tierFilter === "all" || client.tierCode === tierFilter;
      const matchesStatus = statusFilter === "all" || client.status === statusFilter;
      return matchesSearch && matchesTier && matchesStatus;
    });
  }, [clients, searchTerm, statusFilter, tierFilter]);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Subscriptions</h1>
        <p className="text-sm text-[var(--text-muted)]">One table per view, clear pricing breakdown, and guided actions.</p>
      </div>

      <Card className="border-[var(--border)]">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Subscription states</CardTitle>
            <CardDescription>ACTIVE, EXPIRING_SOON, IN_GRACE, PAST_DUE, CANCELED.</CardDescription>
          </div>
          <Button size="sm" asChild>
            <Link href="/admin/templates">Change tier (wizard)</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div>
              <Label className="sr-only">Search</Label>
              <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search clients" className="h-10" />
            </div>
            <div>
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
            <div>
              <Label className="sr-only">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                  <SelectItem value="EXPIRING_SOON">EXPIRING_SOON</SelectItem>
                  <SelectItem value="IN_GRACE">IN_GRACE</SelectItem>
                  <SelectItem value="PAST_DUE">PAST_DUE</SelectItem>
                  <SelectItem value="CANCELED">CANCELED</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Tier</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Monthly Amount</th>
                  <th className="px-3 py-2">Base</th>
                  <th className="px-3 py-2">Overage</th>
                  <th className="px-3 py-2">Add-ons</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-[var(--text-muted)]" colSpan={8}>No subscriptions found.</td>
                  </tr>
                ) : (
                  filtered.map((client) => {
                    const breakdown = getPricingBreakdown(client);
                    return (
                      <tr key={client.id} className="border-t">
                        <td className="px-3 py-2">
                          <div className="font-medium">{client.name}</div>
                          <p className="text-xs text-[var(--text-muted)]">{client.slug ?? client.id}</p>
                        </td>
                        <td className="px-3 py-2"><Badge variant="outline">{client.tierName}</Badge></td>
                        <td className="px-3 py-2"><StatusChip status={client.status} /></td>
                        <td className="px-3 py-2 font-mono">{formatCurrency(breakdown.total)}/mo</td>
                        <td className="px-3 py-2 font-mono text-xs">{formatCurrency(breakdown.tierBase)}</td>
                        <td className="px-3 py-2 font-mono text-xs">{formatCurrency(breakdown.siteOverage)}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {formatCurrency(breakdown.addonBaseTotal + breakdown.addonSiteTotal)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/admin/clients/${client.id}#subscription`}>Change tier</Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

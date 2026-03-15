"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchCommercialCenter } from "@/components/admin-portal/api";
import type { CommercialCenterData } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { TIERS } from "@/lib/platform/feature-catalog";

function formatCurrency(value: number) {
  return `$${value.toLocaleString()}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  return new Date(value).toLocaleDateString();
}

export function SubscriptionsPage() {
  const [commercial, setCommercial] = useState<CommercialCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchCommercialCenter();
        if (!ignore) {
          setCommercial(payload);
        }
      } catch (loadError) {
        if (!ignore) {
          setCommercial(null);
          setError(loadError instanceof Error ? loadError.message : "Failed to load live subscriptions");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, []);

  const planByCode = useMemo(() => new Map((commercial?.plans ?? []).map((plan) => [plan.code, plan])), [commercial?.plans]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return (commercial?.subscriptions ?? []).filter((subscription) => {
      const matchesSearch =
        !term ||
        subscription.companyName?.toLowerCase().includes(term) ||
        subscription.companySlug?.toLowerCase().includes(term) ||
        subscription.companyId.toLowerCase().includes(term);
      const matchesTier = tierFilter === "all" || subscription.planCode === tierFilter;
      const matchesStatus = statusFilter === "all" || subscription.status === statusFilter;
      return matchesSearch && matchesTier && matchesStatus;
    });
  }, [commercial?.subscriptions, searchTerm, statusFilter, tierFilter]);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Subscriptions</h1>
        <p className="text-sm text-[var(--text-muted)]">Live plan, billing state, and renewal timing from the commercial service.</p>
      </div>

      <Card className="border-[var(--border)]">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Subscription states</CardTitle>
            <CardDescription>Active records only. No synthetic overage, add-on, or estimated pricing rows.</CardDescription>
          </div>
          <Button size="sm" asChild>
            <Link href="/admin/templates">Change tier (wizard)</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

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
                  <SelectItem value="TRIALING">TRIALING</SelectItem>
                  <SelectItem value="PAST_DUE">PAST_DUE</SelectItem>
                  <SelectItem value="CANCELED">CANCELED</SelectItem>
                  <SelectItem value="EXPIRED">EXPIRED</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Plan Base</th>
                  <th className="px-3 py-2">Current Period End</th>
                  <th className="px-3 py-2">Last Updated</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-[var(--text-muted)]" colSpan={7}>Loading live subscriptions...</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-[var(--text-muted)]" colSpan={7}>No subscriptions found.</td>
                  </tr>
                ) : (
                  filtered.map((subscription) => {
                    const plan = subscription.planCode ? planByCode.get(subscription.planCode) : undefined;
                    return (
                      <tr key={subscription.id} className="border-t">
                        <td className="px-3 py-2">
                          <div className="font-medium">{subscription.companyName ?? "Unknown workspace"}</div>
                          <p className="text-xs text-[var(--text-muted)]">{subscription.companySlug ?? subscription.companyId}</p>
                        </td>
                        <td className="px-3 py-2"><Badge variant="outline">{subscription.planName ?? "No plan"}</Badge></td>
                        <td className="px-3 py-2"><StatusChip status={subscription.status} /></td>
                        <td className="px-3 py-2 font-mono text-xs">{plan ? `${formatCurrency(plan.monthlyPrice)}/mo` : "Unavailable"}</td>
                        <td className="px-3 py-2 text-xs text-[var(--text-muted)]">{formatDate(subscription.currentPeriodEnd ?? subscription.trialEndsAt)}</td>
                        <td className="px-3 py-2 text-xs text-[var(--text-muted)]">{formatDate(subscription.updatedAt)}</td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/admin/company/${subscription.companyId}/commercial`}>Open workspace</Link>
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

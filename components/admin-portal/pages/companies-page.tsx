"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { fetchCommercialCenter } from "@/components/admin-portal/api";
import { useAdminShell } from "@/components/admin-portal/shell/admin-shell-context";
import type { CommercialCenterData, CompanyWorkspace } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    return rows.filter((row) => {
      const subscriptionStatus = row.subscription?.status ?? "NONE";
      const matchesTier = tierFilter === "all" || row.subscription?.planCode === tierFilter;
      const matchesStatus = statusFilter === "all" || subscriptionStatus === statusFilter;
      return matchesTier && matchesStatus;
    });
  }, [rows, statusFilter, tierFilter]);

  const columns = useMemo<ColumnDef<CompanyRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Workspace",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-[var(--text-strong)]">{row.original.name}</p>
            <p className="font-mono text-xs text-[var(--text-muted)]">{row.original.slug ?? row.original.id}</p>
          </div>
        ),
      },
      {
        id: "workspaceStatus",
        header: "Workspace status",
        cell: ({ row }) => <StatusChip status={row.original.status ?? "Pending"} />,
      },
      {
        id: "plan",
        header: "Plan",
        cell: ({ row }) =>
          row.original.subscription?.planName ? (
            <Badge variant="outline" className="font-medium">
              {row.original.subscription.planName}
            </Badge>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">No live plan</span>
          ),
      },
      {
        id: "subscriptionStatus",
        header: "Subscription status",
        cell: ({ row }) => <StatusChip status={row.original.subscription?.status ?? "Pending"} />,
      },
      {
        id: "updatedAt",
        header: "Last updated",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-[var(--text-muted)]">{formatDate(row.original.subscription?.updatedAt)}</span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Workspace actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href={`/admin/clients/${row.original.id}`}>Open workspace</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/admin/company/${row.original.id}/identity`}>Open identity</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/admin/company/${row.original.id}/support-access`}>Open support</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/admin/company/${row.original.id}/commercial`}>Open commercial</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTierWizardClient(row.original)}>Change tier</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[10px]">
              Platform scope
            </Badge>
            <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[10px]">
              Workspace directory
            </Badge>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Workspaces</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CreateClientWizard actorEmail={actorEmail} />
          <Button variant="outline" asChild>
            <Link href="/admin/reliability?view=health">Open reliability queue</Link>
          </Button>
        </div>
      </div>

      {commercialError ? (
        <Card className="bg-[var(--surface-base)] shadow-none">
          <CardContent className="rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-800">
            {commercialError}
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden bg-[var(--surface-base)] shadow-none">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Workspace registry</CardTitle>
            </div>
            <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[10px]">
              {filteredRows.length} visible
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            data={filteredRows}
            columns={columns}
            searchPlaceholder="Search workspace, slug, plan, status"
            searchSubmitLabel="Search"
            noResultsText={isLoadingCompanies || isLoadingCommercial ? "Loading live workspace directory..." : "No workspaces match the current filters."}
            toolbar={
              <>
                <Select value={tierFilter} onValueChange={setTierFilter}>
                  <SelectTrigger className="h-8 w-[160px] bg-[var(--surface-base)]">
                    <SelectValue placeholder="Plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All plans</SelectItem>
                    {TIERS.map((tier) => (
                      <SelectItem key={tier.code} value={tier.code}>
                        {tier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-[190px] bg-[var(--surface-base)]">
                    <SelectValue placeholder="Subscription status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
          />
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

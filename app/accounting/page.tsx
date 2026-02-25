"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NumberChart } from "@rtcamp/frappe-ui-react";
import { useSession } from "next-auth/react";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { canViewAccountingHref } from "@/lib/accounting/visibility";
import { buildNumberMetricConfig } from "@/lib/charts/frappe-config-builders";
import { fetchAccountingSummary } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ArrowRight, RefreshCcw } from "@/lib/icons";

export default function AccountingOverviewPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );

  const {
    data: summary,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["accounting-summary"],
    queryFn: fetchAccountingSummary,
  });

  const setupMutation = useMutation({
    mutationFn: async () =>
      fetchJson("/api/accounting/setup", {
        method: "POST",
      }),
    onSuccess: () => {
      toast({
        title: "Accounting defaults loaded",
        description: "Chart of accounts, tax codes, and posting rules seeded.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting-summary"] });
    },
    onError: (err) => {
      toast({
        title: "Setup failed",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const primaryActions = useMemo(
    () =>
      [
        { href: "/accounting/journals", label: "New Journal Entry", variant: "default" as const },
        { href: "/accounting/sales", label: "New Sales Invoice", variant: "outline" as const },
        { href: "/accounting/purchases", label: "New Purchase Bill", variant: "outline" as const },
      ].filter((action) => canViewAccountingHref(action.href, enabledFeatures)),
    [enabledFeatures],
  );

  const quickLinks = useMemo(
    () =>
      [
        { href: "/accounting/chart-of-accounts", label: "Chart of Accounts" },
        { href: "/accounting/posting-rules", label: "Posting Rules" },
        { href: "/accounting/trial-balance", label: "Trial Balance" },
        { href: "/accounting/financial-statements", label: "Financial Statements" },
      ].filter((link) => canViewAccountingHref(link.href, enabledFeatures)),
    [enabledFeatures],
  );

  const overviewMetrics = [
    { label: "Accounts in Chart", value: summary?.accounts ?? 0 },
    { label: "Open Accounting Periods", value: summary?.openPeriods ?? 0 },
    { label: "Posted Journals", value: summary?.postedJournals ?? 0 },
    { label: "Draft Journals", value: summary?.draftJournals ?? 0 },
    { label: "Open Sales Invoices", value: summary?.openInvoices ?? 0 },
    { label: "Open Purchase Bills", value: summary?.openBills ?? 0 },
    { label: "Pending Integration Events", value: summary?.pendingIntegrationEvents ?? 0 },
    { label: "Failed Integration Events", value: summary?.failedIntegrationEvents ?? 0 },
  ];

  return (
    <AccountingShell
      activeTab="overview"
      title="Accounting Overview"
      description="Core accounting health, journal activity, and AR/AP status."
      actions={
        primaryActions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {primaryActions.map((action) => (
              <Button key={action.href} asChild size="sm" variant={action.variant}>
                <Link href={action.href}>
                  {action.label}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ))}
          </div>
        ) : undefined
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load accounting summary</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-[140px] w-full" />
          ))
        ) : (
          <>
            {overviewMetrics.map((metric) => (
              <div key={metric.label} className="rounded-md border border-border/60 bg-card/70">
                <NumberChart
                  config={buildNumberMetricConfig({
                    title: metric.label,
                    value: metric.value,
                    negativeIsBetter: metric.label.includes("Failed"),
                  })}
                  subtitle={() => (
                    <div className="font-mono text-[24px] font-semibold leading-8 text-ink-gray-6 tabular-nums">
                      {metric.value.toLocaleString()}
                    </div>
                  )}
                />
              </div>
            ))}
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle>Accounting Setup</CardTitle>
            <CardDescription>
              Seed default chart of accounts, VAT codes, and posting rules for a fast start.
            </CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            <Button
              type="button"
              size="sm"
              onClick={() => setupMutation.mutate()}
              disabled={setupMutation.isPending}
            >
              <RefreshCcw className="mr-2 size-4" />
              Initialize Accounting Defaults
            </Button>
          </div>
        </Card>
        {quickLinks.length > 0 ? (
          <Card>
          <CardHeader className="space-y-2">
            <CardTitle>Quick Links</CardTitle>
            <CardDescription>Jump into your core accounting workflows.</CardDescription>
          </CardHeader>
          <div className="px-6 pb-6 space-y-2 text-sm">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                className="flex items-center justify-between text-primary hover:underline"
                href={link.href}
              >
                {link.label}
                <ArrowRight className="size-4" />
              </Link>
            ))}
          </div>
          </Card>
        ) : null}
      </div>
    </AccountingShell>
  );
}

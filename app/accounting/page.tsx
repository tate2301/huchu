"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { fetchAccountingSummary } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ArrowRight, RefreshCcw } from "@/lib/icons";

export default function AccountingOverviewPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  return (
    <AccountingShell
      activeTab="overview"
      title="Accounting Overview"
      description="Core accounting health, journal activity, and AR/AP status."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/accounting/journals">
              New Journal Entry
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/accounting/sales">
              New Sales Invoice
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/accounting/purchases">
              New Purchase Bill
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
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
          Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardDescription>Accounts in Chart</CardDescription>
                <CardTitle>{summary?.accounts ?? 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Open Accounting Periods</CardDescription>
                <CardTitle>{summary?.openPeriods ?? 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Posted Journals</CardDescription>
                <CardTitle>{summary?.postedJournals ?? 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Draft Journals</CardDescription>
                <CardTitle>{summary?.draftJournals ?? 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Open Sales Invoices</CardDescription>
                <CardTitle>{summary?.openInvoices ?? 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Open Purchase Bills</CardDescription>
                <CardTitle>{summary?.openBills ?? 0}</CardTitle>
              </CardHeader>
            </Card>
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
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle>Quick Links</CardTitle>
            <CardDescription>Jump into your core accounting workflows.</CardDescription>
          </CardHeader>
          <div className="px-6 pb-6 space-y-2 text-sm">
            <Link
              className="flex items-center justify-between text-primary hover:underline"
              href="/accounting/chart-of-accounts"
            >
              Chart of Accounts
              <ArrowRight className="size-4" />
            </Link>
            <Link
              className="flex items-center justify-between text-primary hover:underline"
              href="/accounting/posting-rules"
            >
              Posting Rules
              <ArrowRight className="size-4" />
            </Link>
            <Link
              className="flex items-center justify-between text-primary hover:underline"
              href="/accounting/trial-balance"
            >
              Trial Balance
              <ArrowRight className="size-4" />
            </Link>
            <Link
              className="flex items-center justify-between text-primary hover:underline"
              href="/accounting/financial-statements"
            >
              Financial Statements
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </Card>
      </div>
    </AccountingShell>
  );
}

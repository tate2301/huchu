"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import { PageHeading } from "@/components/layout/page-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchGoldReceipts, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function GoldReceiptsReportPage() {
  const [siteId, setSiteId] = useState("all");

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const activeSiteId = siteId === "all" ? undefined : siteId;
  const { data, isLoading, error } = useQuery({
    queryKey: ["gold-receipts", "reports", activeSiteId ?? "all"],
    queryFn: () => fetchGoldReceipts({ siteId: activeSiteId, limit: 500 }),
  });

  const rows = useMemo(() => data?.data ?? [], [data]);
  const pageError = sitesError || error;

  return (
    <div className="w-full space-y-6">
      <PageHeading title="Gold Receipts" description="Buyer receipt confirmations and settlement details" />

      {pageError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load gold receipts</AlertTitle>
          <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by site</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-md">
            <label className="mb-2 block text-sm font-semibold">Site</label>
            {sitesLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={siteId} onValueChange={setSiteId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select site" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sites</SelectItem>
                  {sites?.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Records</CardTitle>
          <CardDescription>{rows.length} receipt records</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No receipt records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">Receipt Date</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Receipt No.</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Bar ID</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Site</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Amount</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Payment Method</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} className="border-b">
                      <TableCell className="p-3">{format(new Date(row.receiptDate), "MMM d, yyyy")}</TableCell>
                      <TableCell className="p-3 font-semibold">{row.receiptNumber}</TableCell>
                      <TableCell className="p-3">{row.goldDispatch.goldPour.pourBarId}</TableCell>
                      <TableCell className="p-3">{row.goldDispatch.goldPour.site.name}</TableCell>
                      <TableCell className="p-3">{row.paidAmount.toLocaleString()}</TableCell>
                      <TableCell className="p-3">{row.paymentMethod}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}




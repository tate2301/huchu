"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import { PageHeading } from "@/components/layout/page-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchGoldCorrections, fetchGoldDispatches, fetchGoldPours, fetchGoldReceipts, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function GoldChainReportPage() {
  const [siteId, setSiteId] = useState("all");

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const activeSiteId = siteId === "all" ? undefined : siteId;

  const { data: poursData, isLoading: poursLoading, error: poursError } = useQuery({
    queryKey: ["gold-pours", "report-chain", activeSiteId ?? "all"],
    queryFn: () => fetchGoldPours({ siteId: activeSiteId, limit: 500 }),
  });
  const { data: dispatchesData, isLoading: dispatchesLoading, error: dispatchesError } = useQuery({
    queryKey: ["gold-dispatches", "report-chain", activeSiteId ?? "all"],
    queryFn: () => fetchGoldDispatches({ siteId: activeSiteId, limit: 500 }),
  });
  const { data: receiptsData, isLoading: receiptsLoading, error: receiptsError } = useQuery({
    queryKey: ["gold-receipts", "report-chain", activeSiteId ?? "all"],
    queryFn: () => fetchGoldReceipts({ siteId: activeSiteId, limit: 500 }),
  });
  const { data: correctionsData, isLoading: correctionsLoading, error: correctionsError } = useQuery({
    queryKey: ["gold-corrections", "report-chain", activeSiteId ?? "all"],
    queryFn: () => fetchGoldCorrections({ siteId: activeSiteId, limit: 500 }),
  });

  const pours = useMemo(() => poursData?.data ?? [], [poursData]);
  const dispatches = useMemo(() => dispatchesData?.data ?? [], [dispatchesData]);
  const receipts = useMemo(() => receiptsData?.data ?? [], [receiptsData]);
  const corrections = useMemo(() => correctionsData?.data ?? [], [correctionsData]);

  const dispatchByPour = useMemo(() => {
    const map = new Map<string, (typeof dispatches)[number]>();
    dispatches.forEach((row) => map.set(row.goldPourId, row));
    return map;
  }, [dispatches]);

  const receiptByDispatch = useMemo(() => {
    const map = new Map<string, (typeof receipts)[number]>();
    receipts.forEach((row) => map.set(row.goldDispatch.id, row));
    return map;
  }, [receipts]);

  const rows = useMemo(
    () =>
      pours.map((pour) => {
        const dispatch = dispatchByPour.get(pour.id);
        const receipt = dispatch ? receiptByDispatch.get(dispatch.id) : undefined;
        const status = receipt ? "Receipted" : dispatch ? "Dispatched" : "Poured";
        return { pour, dispatch, receipt, status };
      }),
    [dispatchByPour, pours, receiptByDispatch],
  );

  const pageError = sitesError || poursError || dispatchesError || receiptsError || correctionsError;
  const isLoading = poursLoading || dispatchesLoading || receiptsLoading || correctionsLoading;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeading title="Gold Chain" description="Pour to dispatch to receipt traceability" />

      {pageError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load gold records</AlertTitle>
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

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Pours</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{pours.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Dispatches</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{dispatches.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Receipts</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{receipts.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Corrections</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{corrections.length}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Records</CardTitle>
          <CardDescription>{rows.length} chain entries</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No gold records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">Pour Date</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Bar ID</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Site</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Weight</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Dispatch Date</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Receipt Date</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.pour.id} className="border-b">
                      <TableCell className="p-3">{format(new Date(row.pour.pourDate), "MMM d, yyyy")}</TableCell>
                      <TableCell className="p-3 font-semibold">{row.pour.pourBarId}</TableCell>
                      <TableCell className="p-3">{row.pour.site.name}</TableCell>
                      <TableCell className="p-3">{row.pour.grossWeight.toFixed(2)} g</TableCell>
                      <TableCell className="p-3">
                        {row.dispatch ? format(new Date(row.dispatch.dispatchDate), "MMM d, yyyy") : "-"}
                      </TableCell>
                      <TableCell className="p-3">
                        {row.receipt ? format(new Date(row.receipt.receiptDate), "MMM d, yyyy") : "-"}
                      </TableCell>
                      <TableCell className="p-3">
                        <Badge variant={row.status === "Receipted" ? "default" : row.status === "Dispatched" ? "secondary" : "outline"}>
                          {row.status}
                        </Badge>
                      </TableCell>
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




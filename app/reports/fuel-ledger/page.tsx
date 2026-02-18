"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";

import { PageHeading } from "@/components/layout/page-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchInventoryItems, fetchSites, fetchStockMovements } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function FuelLedgerReportPage() {
  const [siteId, setSiteId] = useState("all");
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 6), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const activeSiteId = siteId === "all" ? undefined : siteId;

  const { data: stockData, isLoading: stockLoading, error: stockError } = useQuery({
    queryKey: ["inventory-items", "fuel-report", activeSiteId ?? "all"],
    queryFn: () => fetchInventoryItems({ siteId: activeSiteId, category: "FUEL", limit: 300 }),
  });

  const { data: movementData, isLoading: movementLoading, error: movementError } = useQuery({
    queryKey: ["stock-movements", "fuel-report", activeSiteId ?? "all"],
    queryFn: () => fetchStockMovements({ siteId: activeSiteId, category: "FUEL", limit: 500 }),
  });

  const fuelItems = useMemo(() => stockData?.data ?? [], [stockData]);
  const movements = useMemo(() => movementData?.data ?? [], [movementData]);
  const filteredMovements = useMemo(
    () =>
      movements.filter((row) => {
        const day = format(new Date(row.createdAt), "yyyy-MM-dd");
        return day >= startDate && day <= endDate;
      }),
    [movements, startDate, endDate],
  );

  const totalFuelStock = fuelItems.reduce((sum, row) => sum + row.currentStock, 0);
  const totalFuelMin = fuelItems.reduce((sum, row) => sum + (row.minStock ?? 0), 0);

  const pageError = sitesError || stockError || movementError;

  return (
    <div className="w-full space-y-6">
      <PageHeading title="Fuel Ledger" description="Fuel stock levels and movement history" />

      {pageError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load fuel report</AlertTitle>
          <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by site and date range</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
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
          <div>
            <label className="mb-2 block text-sm font-semibold">Start Date</label>
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">End Date</label>
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Fuel Items</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {stockLoading ? <Skeleton className="h-8 w-16" /> : fuelItems.length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Current Fuel Stock</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {stockLoading ? <Skeleton className="h-8 w-28" /> : totalFuelStock.toFixed(2)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Against Minimum</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {stockLoading ? <Skeleton className="h-8 w-28" /> : (
              <span className={totalFuelStock < totalFuelMin ? "text-destructive" : ""}>
                {totalFuelStock - totalFuelMin >= 0 ? "+" : ""}
                {(totalFuelStock - totalFuelMin).toFixed(2)}
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fuel Movements</CardTitle>
          <CardDescription>{filteredMovements.length} movement records</CardDescription>
        </CardHeader>
        <CardContent>
          {movementLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : filteredMovements.length === 0 ? (
            <div className="text-sm text-muted-foreground">No fuel movements for the selected filters.</div>
          ) : (
            <div className="table-rail">
              <Table className="w-full text-sm">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">Date</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Type</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Item</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Site</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Quantity</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Issued To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovements.map((row) => (
                    <TableRow key={row.id} className="border-b">
                      <TableCell className="p-3">{format(new Date(row.createdAt), "MMM d, yyyy HH:mm")}</TableCell>
                      <TableCell className="p-3">
                        <Badge variant={row.movementType === "ISSUE" ? "destructive" : "secondary"}>
                          {row.movementType}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-3">
                        <div className="font-semibold">{row.item.name}</div>
                        <div className="text-xs text-muted-foreground">{row.item.itemCode}</div>
                      </TableCell>
                      <TableCell className="p-3">{row.item.site.name}</TableCell>
                      <TableCell className="p-3 text-right">
                        {row.quantity} {row.unit}
                      </TableCell>
                      <TableCell className="p-3">{row.issuedTo ?? "-"}</TableCell>
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




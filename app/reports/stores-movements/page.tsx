"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";

import { PageHeading } from "@/components/layout/page-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { fetchSites, fetchStockMovements } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const parseNotes = (raw?: string | null) => {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as {
      supplier?: string;
      invoiceNo?: string;
      notes?: string;
    };
    return parsed.notes ?? parsed.invoiceNo ?? parsed.supplier ?? raw;
  } catch {
    return raw;
  }
};

export default function StoresMovementsReportPage() {
  const [siteId, setSiteId] = useState("all");
  const [movementType, setMovementType] = useState("all");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(
    format(subDays(new Date(), 6), "yyyy-MM-dd"),
  );
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const {
    data: sites,
    isLoading: sitesLoading,
    error: sitesError,
  } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const activeSiteId = siteId === "all" ? undefined : siteId;
  const { data, isLoading, error } = useQuery({
    queryKey: [
      "stock-movements",
      "reports",
      activeSiteId ?? "all",
      movementType,
    ],
    queryFn: () =>
      fetchStockMovements({
        siteId: activeSiteId,
        movementType: movementType === "all" ? undefined : movementType,
        limit: 500,
      }),
  });

  const rows = useMemo(() => data?.data ?? [], [data]);
  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((row) => {
        const day = format(new Date(row.createdAt), "yyyy-MM-dd");
        return day >= startDate && day <= endDate;
      })
      .filter((row) => {
        if (!term) return true;
        const haystack = [
          row.item.name,
          row.item.itemCode,
          row.item.site.name,
          row.issuedTo,
          row.requestedBy,
          row.approvedBy,
          parseNotes(row.notes),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      });
  }, [rows, search, startDate, endDate]);

  const pageError = sitesError || error;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeading
        title="Stock Movements"
        description="Inventory receipts, issues, adjustments, and transfers"
      />

      {pageError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load stock movements</AlertTitle>
          <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Filter by site, type, date, and search text
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-5">
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
            <label className="mb-2 block text-sm font-semibold">Type</label>
            <Select value={movementType} onValueChange={setMovementType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="RECEIPT">Receipt</SelectItem>
                <SelectItem value="ISSUE">Issue</SelectItem>
                <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
                <SelectItem value="TRANSFER">Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">
              Start Date
            </label>
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">End Date</label>
            <Input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
          <div className="md:col-span-5">
            <label className="mb-2 block text-sm font-semibold">Search</label>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Item, site, actor, notes"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Records</CardTitle>
          <CardDescription>
            {filteredRows.length} movement records
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : filteredRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No movement records found for the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">
                      Date
                    </TableHead>
                    <TableHead className="p-3 text-left font-semibold">
                      Type
                    </TableHead>
                    <TableHead className="p-3 text-left font-semibold">
                      Item
                    </TableHead>
                    <TableHead className="p-3 text-left font-semibold">
                      Site
                    </TableHead>
                    <TableHead className="p-3 text-right font-semibold">
                      Quantity
                    </TableHead>
                    <TableHead className="p-3 text-left font-semibold">
                      Actor
                    </TableHead>
                    <TableHead className="p-3 text-left font-semibold">
                      Notes
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.id} className="border-b">
                      <TableCell className="p-3">
                        {format(new Date(row.createdAt), "MMM d, yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="p-3">
                        <Badge
                          variant={
                            row.movementType === "ISSUE"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {row.movementType}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-3">
                        <div className="font-semibold">{row.item.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.item.itemCode}
                        </div>
                      </TableCell>
                      <TableCell className="p-3">
                        {row.item.site.name}
                      </TableCell>
                      <TableCell className="p-3 text-right">
                        {row.quantity} {row.unit}
                      </TableCell>
                      <TableCell className="p-3">
                        {row.approvedBy ??
                          row.requestedBy ??
                          row.issuedBy?.name ??
                          "-"}
                      </TableCell>
                      <TableCell
                        className="max-w-76 truncate p-3"
                        title={parseNotes(row.notes)}
                      >
                        max-w-9 {parseNotes(row.notes) || "-"}
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

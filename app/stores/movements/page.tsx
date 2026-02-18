"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DataListShell } from "@/components/shared/data-list-shell";
import { StoresShell } from "@/components/stores/stores-shell";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchSites, fetchStockMovements, type StockMovement } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ParsedNotes = {
  supplier?: string;
  invoiceNo?: string;
  notes?: string;
};

type StockMovementDetail = StockMovement & {
  item: StockMovement["item"] & { id: string; currentStock: number };
  issuedBy?: { id: string; name: string; email?: string } | null;
};

const parseNotes = (raw?: string | null): ParsedNotes => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as ParsedNotes;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    return { notes: raw };
  }
  return { notes: raw };
};

const movementVariant = (type: string) => {
  if (type === "RECEIPT") return "secondary" as const;
  if (type === "ISSUE") return "destructive" as const;
  return "outline" as const;
};

export default function StoresMovementsPage() {
  const searchParams = useSearchParams();
  const createdId = searchParams.get("createdId");
  const [siteId, setSiteId] = useState(searchParams.get("siteId") ?? "");
  const [movementType, setMovementType] = useState(
    searchParams.get("movementType") ?? "all",
  );
  const [search, setSearch] = useState("");
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(
    null,
  );

  const {
    data: sites,
    isLoading: sitesLoading,
    error: sitesError,
    refetch: refetchSites,
  } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const {
    data: movementsData,
    isLoading: movementsLoading,
    error: movementsError,
    refetch: refetchMovements,
  } = useQuery({
    queryKey: ["stock-movements", "history", siteId, movementType],
    queryFn: () =>
      fetchStockMovements({
        siteId: siteId || undefined,
        movementType: movementType === "all" ? undefined : movementType,
        limit: 500,
      }),
  });

  const {
    data: selectedMovement,
    isLoading: selectedMovementLoading,
    error: selectedMovementError,
  } = useQuery({
    queryKey: ["stock-movement", selectedMovementId],
    queryFn: () =>
      fetchJson<StockMovementDetail>(
        `/api/inventory/movements/${selectedMovementId}`,
      ),
    enabled: !!selectedMovementId,
  });

  const movements = useMemo(() => movementsData?.data ?? [], [movementsData]);
  const filteredMovements = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return movements;
    return movements.filter((movement) => {
      const notes = parseNotes(movement.notes);
      const haystack = [
        movement.item.name,
        movement.item.itemCode,
        movement.item.site.name,
        movement.issuedTo,
        movement.requestedBy,
        movement.approvedBy,
        notes.supplier,
        notes.invoiceNo,
        notes.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [movements, search]);

  const pageError = sitesError || movementsError;
  const detailNotes = parseNotes(selectedMovement?.notes);

  return (
    <StoresShell
      activeTab="movements"
      description="History of inventory receipts, issues, adjustments, and transfers"
    >
      <RecordSavedBanner entityLabel="movement" />

      <DataListShell
        title="Stock Movements"
        description="Full action log for all inventory transactions"
        isLoading={sitesLoading || movementsLoading}
        isError={Boolean(pageError)}
        errorMessage={pageError ? getApiErrorMessage(pageError) : undefined}
        onRetry={() => {
          refetchSites();
          refetchMovements();
        }}
        hasData={filteredMovements.length > 0}
        emptyTitle="No stock movements found"
        emptyDescription="Try changing filters or start by recording a stock receipt."
        emptyAction={
          <Button asChild size="sm">
            <Link href="/stores/receive">Record Receipt</Link>
          </Button>
        }
        filters={
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-field-label">Site</label>
              {sitesLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select
                  value={siteId || "all"}
                  onValueChange={(value) =>
                    setSiteId(value === "all" ? "" : value)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All sites" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sites</SelectItem>
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
              <label className="mb-2 block text-field-label">
                Movement Type
              </label>
              <Select value={movementType} onValueChange={setMovementType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="RECEIPT">Receipt</SelectItem>
                  <SelectItem value="ISSUE">Issue</SelectItem>
                  <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
                  <SelectItem value="TRANSFER">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-field-label">Search</label>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Item, site, requester, notes"
              />
            </div>
          </div>
        }
      >
        <div className="table-rail">
          <Table className="w-full">
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead className="p-3 text-left text-table-cell">
                  Date
                </TableHead>
                <TableHead className="p-3 text-left text-table-cell">
                  Type
                </TableHead>
                <TableHead className="p-3 text-left text-table-cell">
                  Item
                </TableHead>
                <TableHead className="p-3 text-left text-table-cell">
                  Site
                </TableHead>
                <TableHead className="p-3 text-right text-table-cell">
                  Qty
                </TableHead>
                <TableHead className="p-3 text-left text-table-cell">
                  Actor
                </TableHead>
                <TableHead className="p-3 text-left text-table-cell">
                  Notes
                </TableHead>
                <TableHead className="p-3 text-right text-table-cell">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMovements.map((movement) => {
                const notes = parseNotes(movement.notes);
                const rowNotes =
                  notes.notes ?? notes.invoiceNo ?? notes.supplier ?? "-";
                return (
                  <TableRow
                    key={movement.id}
                    className={`border-b hover:bg-muted/60 ${
                      createdId === movement.id
                        ? "bg-[var(--status-success-bg)]"
                        : ""
                    }`}
                  >
                    <TableCell className="p-3 text-sm">
                      {new Date(movement.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="p-3 text-sm">
                      <Badge variant={movementVariant(movement.movementType)}>
                        {movement.movementType}
                      </Badge>
                    </TableCell>
                    <TableCell className="p-3 text-sm">
                      <div className="font-semibold">{movement.item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {movement.item.itemCode}
                      </div>
                    </TableCell>
                    <TableCell className="p-3 text-sm">
                      {movement.item.site.name}
                    </TableCell>
                    <TableCell className="p-3 text-right text-sm font-semibold">
                      {movement.quantity} {movement.unit}
                    </TableCell>
                    <TableCell className="p-3 text-sm">
                      {movement.approvedBy ??
                        movement.requestedBy ??
                        movement.issuedBy?.name ??
                        "-"}
                    </TableCell>
                    <TableCell
                      className="max-w-92 truncate p-3 text-sm"
                      title={rowNotes}
                    >
                      {rowNotes}
                    </TableCell>
                    <TableCell className="p-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedMovementId(movement.id)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DataListShell>

      <Dialog
        open={!!selectedMovementId}
        onOpenChange={(open) => !open && setSelectedMovementId(null)}
      >
        <DialogContent size="md" className="w-full">
          <DialogHeader>
            <DialogTitle>Movement Details</DialogTitle>
            <DialogDescription>
              Full transaction details and source metadata.
            </DialogDescription>
          </DialogHeader>

          {selectedMovementLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : selectedMovementError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load movement details</AlertTitle>
              <AlertDescription>
                {getApiErrorMessage(selectedMovementError)}
              </AlertDescription>
            </Alert>
          ) : selectedMovement ? (
            <div className="space-y-3 text-sm">
              <div>
                <span className="font-semibold">Type:</span>{" "}
                {selectedMovement.movementType}
              </div>
              <div>
                <span className="font-semibold">Item:</span>{" "}
                {selectedMovement.item.name} ({selectedMovement.item.itemCode})
              </div>
              <div>
                <span className="font-semibold">Quantity:</span>{" "}
                {selectedMovement.quantity} {selectedMovement.unit}
              </div>
              <div>
                <span className="font-semibold">Site:</span>{" "}
                {selectedMovement.item.site.name}
              </div>
              <div>
                <span className="font-semibold">Location:</span>{" "}
                {selectedMovement.item.location?.name ?? "-"}
              </div>
              <div>
                <span className="font-semibold">Requested By:</span>{" "}
                {selectedMovement.requestedBy ?? "-"}
              </div>
              <div>
                <span className="font-semibold">Approved By:</span>{" "}
                {selectedMovement.approvedBy ?? "-"}
              </div>
              <div>
                <span className="font-semibold">Issued By User:</span>{" "}
                {selectedMovement.issuedBy?.name ?? "-"}
              </div>
              <div>
                <span className="font-semibold">Supplier:</span>{" "}
                {detailNotes.supplier ?? "-"}
              </div>
              <div>
                <span className="font-semibold">Invoice:</span>{" "}
                {detailNotes.invoiceNo ?? "-"}
              </div>
              <div>
                <span className="font-semibold">Notes:</span>{" "}
                {detailNotes.notes ?? selectedMovement.notes ?? "-"}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </StoresShell>
  );
}

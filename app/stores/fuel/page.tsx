"use client";

import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { StoresShell } from "@/components/stores/stores-shell";
import { FrappeStatCard } from "@/components/charts/frappe-stat-card";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusState } from "@/components/shared/status-state";
import { ExportMenu } from "@/components/ui/export-menu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchInventoryItems, fetchStockMovements } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { type DocumentExportFormat } from "@/lib/documents/export-client";
import { exportElementToDocument } from "@/lib/pdf";
import { Fuel } from "@/lib/icons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ParsedNotes = {
  supplier?: string;
  invoiceNo?: string;
  notes?: string;
};

const parseMovementNotes = (raw?: string | null): ParsedNotes => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as ParsedNotes;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    return { notes: raw };
  }
  return { notes: raw };
};

const movementDelta = (movementType: string, quantity: number) => {
  if (movementType === "RECEIPT") return quantity;
  if (movementType === "ISSUE" || movementType === "TRANSFER") return -quantity;
  if (movementType === "ADJUSTMENT") return quantity;
  return 0;
};

export default function StoresFuelPage() {
  const fuelPdfRef = useRef<HTMLDivElement | null>(null);
  const {
    data: inventoryData,
    isLoading: inventoryLoading,
    error: inventoryError,
  } = useQuery({
    queryKey: ["inventory-items", "fuel"],
    queryFn: () => fetchInventoryItems({ category: "FUEL", limit: 500 }),
  });

  const {
    data: movementsData,
    isLoading: movementsLoading,
    error: movementsError,
  } = useQuery({
    queryKey: ["stock-movements", "fuel"],
    queryFn: () => fetchStockMovements({ category: "FUEL", limit: 200 }),
  });

  const fuelItems = useMemo(() => inventoryData?.data ?? [], [inventoryData]);
  const fuelMovements = useMemo(() => movementsData?.data ?? [], [movementsData]);
  const fuelUnit =
    fuelItems.length > 0
      ? fuelItems.every((item) => item.unit === fuelItems[0].unit)
        ? fuelItems[0].unit
        : "units"
      : "units";
  const fuelStock = fuelItems.reduce((sum, item) => sum + item.currentStock, 0);
  const fuelMin = fuelItems.reduce(
    (sum, item) => sum + (item.minStock ?? 0),
    0,
  );
  const fuelVariance = fuelStock - fuelMin;
  const fuelBelowMin = fuelMin > 0 && fuelStock < fuelMin;

  const ledgerRows = useMemo(() => {
    return fuelMovements.reduce(
      (acc, movement) => {
        const delta = movementDelta(movement.movementType, movement.quantity);
        const closing = acc.running;
        const opening = closing - delta;
        return {
          running: opening,
          rows: acc.rows.concat({
            ...movement,
            delta,
            opening,
            closing,
          }),
        };
      },
      {
        running: fuelStock,
        rows: [] as Array<
          (typeof fuelMovements)[number] & {
            delta: number;
            opening: number;
            closing: number;
          }
        >,
      },
    ).rows;
  }, [fuelMovements, fuelStock]);

  const pageError = inventoryError || movementsError;

  return (
    <StoresShell activeTab="fuel">
      {pageError && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load fuel ledger</AlertTitle>
          <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
        </Alert>
      )}

      {!inventoryLoading && !movementsLoading && fuelItems.length === 0 && ledgerRows.length === 0 ? (
        <StatusState
          variant="empty"
          title="No fuel records yet"
          description="Add fuel inventory items and movements to start the ledger."
        />
      ) : null}

      {!inventoryLoading && fuelItems.length > 0 && !fuelBelowMin ? (
        <Alert variant="success">
          <AlertTitle>Fuel stock healthy</AlertTitle>
          <AlertDescription>Fuel balance is on or above the minimum threshold.</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Fuel className="h-5 w-5 text-orange-600" />
                Fuel Ledger
              </CardTitle>
              <CardDescription>
                Diesel receipts and issues with running balance
              </CardDescription>
            </div>
            <ExportMenu
              variant="outline"
              size="sm"
              onExport={(format: DocumentExportFormat) => {
                if (!fuelPdfRef.current) return;
                return exportElementToDocument(
                  fuelPdfRef.current,
                  `fuel-ledger-${new Date().toISOString().slice(0, 10)}.${format}`,
                  format,
                );
              }}
              disabled={movementsLoading || ledgerRows.length === 0}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
            {inventoryLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <FrappeStatCard
                  label="Current Fuel Stock"
                  value={fuelStock}
                  valueLabel={`${fuelStock.toLocaleString()} ${fuelUnit}`}
                  detail={
                    fuelItems.length === 0
                      ? "No fuel items configured"
                      : fuelBelowMin
                        ? `Below minimum level (${fuelMin.toLocaleString()} ${fuelUnit})`
                        : "Within minimum threshold"
                  }
                  tone={fuelBelowMin ? "warning" : "success"}
                />
                <FrappeStatCard
                  label="Fuel Variance"
                  value={fuelVariance}
                  valueLabel={`${fuelVariance >= 0 ? "+" : ""}${fuelVariance.toLocaleString()} ${fuelUnit}`}
                  detail={`Minimum target ${fuelMin.toLocaleString()} ${fuelUnit}`}
                  tone={fuelVariance < 0 ? "danger" : "success"}
                />
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <Table className="w-full" aria-label="Fuel ledger table">
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead className="text-left p-3 text-sm font-semibold">Date</TableHead>
                  <TableHead className="text-left p-3 text-sm font-semibold">Type</TableHead>
                  <TableHead className="text-left p-3 text-sm font-semibold">
                    Equipment/Supplier
                  </TableHead>
                  <TableHead className="text-right p-3 text-sm font-semibold">Quantity</TableHead>
                  <TableHead className="text-right p-3 text-sm font-semibold">Opening</TableHead>
                  <TableHead className="text-right p-3 text-sm font-semibold">Closing</TableHead>
                  <TableHead className="text-left p-3 text-sm font-semibold">
                    Authorized By
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movementsLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="p-3">
                      <Skeleton className="h-10 w-full" />
                    </TableCell>
                  </TableRow>
                ) : ledgerRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="p-3 text-sm text-muted-foreground"
                    >
                      No fuel movements recorded.
                    </TableCell>
                  </TableRow>
                ) : (
                  ledgerRows.map((entry) => {
                    const notes = parseMovementNotes(entry.notes ?? null);
                    const isReceipt = entry.movementType === "RECEIPT";
                    const equipmentOrSupplier = isReceipt
                      ? notes.supplier || entry.issuedTo || "-"
                      : entry.issuedTo || "-";
                    const authorizedBy = isReceipt
                      ? entry.requestedBy || entry.issuedBy?.name || "-"
                      : entry.approvedBy || entry.requestedBy || entry.issuedBy?.name || "-";
                    return (
                      <TableRow key={entry.id} className="border-b hover:bg-muted/60">
                        <TableCell className="p-3 text-sm">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="p-3 text-sm">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              isReceipt
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {isReceipt ? "Receipt" : "Issue"}
                          </span>
                        </TableCell>
                        <TableCell className="p-3 text-sm">{equipmentOrSupplier}</TableCell>
                        <TableCell
                          className={`p-3 text-sm text-right font-semibold ${
                            isReceipt ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {entry.delta >= 0 ? "+" : "-"}
                          {Math.abs(entry.delta)} {entry.unit}
                        </TableCell>
                        <TableCell className="p-3 text-sm text-right">
                          {entry.opening} {entry.unit}
                        </TableCell>
                        <TableCell className="p-3 text-sm text-right font-semibold">
                          {entry.closing} {entry.unit}
                        </TableCell>
                        <TableCell className="p-3 text-sm">{authorizedBy}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="absolute left-[-9999px] top-0">
        <div ref={fuelPdfRef}>
          <PdfTemplate
            title="Fuel Ledger"
            subtitle="Diesel receipts and issues"
            meta={[
              { label: "Current stock", value: `${fuelStock} ${fuelUnit}` },
              { label: "Minimum stock", value: `${fuelMin} ${fuelUnit}` },
              { label: "Variance", value: `${fuelVariance} ${fuelUnit}` },
              { label: "Total movements", value: String(ledgerRows.length) },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Date</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Equipment/Supplier</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Opening</th>
                  <th className="py-2 text-right">Closing</th>
                  <th className="py-2">Authorized</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((entry) => {
                  const notes = parseMovementNotes(entry.notes ?? null);
                  const isReceipt = entry.movementType === "RECEIPT";
                  const equipmentOrSupplier = isReceipt
                    ? notes.supplier || entry.issuedTo || "-"
                    : entry.issuedTo || "-";
                  const authorizedBy = isReceipt
                    ? entry.requestedBy || entry.issuedBy?.name || "-"
                    : entry.approvedBy || entry.requestedBy || entry.issuedBy?.name || "-";
                  return (
                    <tr key={entry.id} className="border-b border-gray-100">
                      <td className="py-2">
                        {new Date(entry.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2">
                        {isReceipt ? "Receipt" : "Issue"}
                      </td>
                      <td className="py-2">{equipmentOrSupplier}</td>
                      <td className="py-2 text-right">
                        {entry.delta >= 0 ? "+" : "-"}
                        {Math.abs(entry.delta)} {entry.unit}
                      </td>
                      <td className="py-2 text-right">
                        {entry.opening} {entry.unit}
                      </td>
                      <td className="py-2 text-right">
                        {entry.closing} {entry.unit}
                      </td>
                      <td className="py-2">{authorizedBy}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>
    </StoresShell>
  );
}



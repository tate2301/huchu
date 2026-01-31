"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { StoresShell } from "@/components/stores/stores-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { Download, Fuel } from "lucide-react";

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

  const fuelItems = inventoryData?.data ?? [];
  const fuelMovements = movementsData?.data ?? [];
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
    let running = fuelStock;
    return fuelMovements.map((movement) => {
      const delta = movementDelta(movement.movementType, movement.quantity);
      const closing = running;
      const opening = closing - delta;
      running = opening;
      return {
        ...movement,
        delta,
        opening,
        closing,
      };
    });
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
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
            {inventoryLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Current Fuel Stock
                  </p>
                  <p className="text-3xl font-bold text-orange-600">
                    {fuelStock} {fuelUnit}
                  </p>
                  {fuelItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-1">
                      No fuel items configured
                    </p>
                  ) : fuelBelowMin ? (
                    <p className="text-sm text-red-600 mt-1">
                      Below minimum level ({fuelMin} {fuelUnit})
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Variance</p>
                  <p
                    className={`text-xl font-semibold ${
                      fuelVariance < 0 ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    {fuelVariance >= 0 ? "+" : ""}
                    {fuelVariance} {fuelUnit}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 text-sm font-semibold">Date</th>
                  <th className="text-left p-3 text-sm font-semibold">Type</th>
                  <th className="text-left p-3 text-sm font-semibold">
                    Equipment/Supplier
                  </th>
                  <th className="text-right p-3 text-sm font-semibold">Quantity</th>
                  <th className="text-right p-3 text-sm font-semibold">Opening</th>
                  <th className="text-right p-3 text-sm font-semibold">Closing</th>
                  <th className="text-left p-3 text-sm font-semibold">
                    Authorized By
                  </th>
                </tr>
              </thead>
              <tbody>
                {movementsLoading ? (
                  <tr>
                    <td colSpan={7} className="p-3">
                      <Skeleton className="h-10 w-full" />
                    </td>
                  </tr>
                ) : ledgerRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-3 text-sm text-muted-foreground"
                    >
                      No fuel movements recorded.
                    </td>
                  </tr>
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
                      <tr key={entry.id} className="border-b hover:bg-muted/60">
                        <td className="p-3 text-sm">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-sm">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              isReceipt
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {isReceipt ? "Receipt" : "Issue"}
                          </span>
                        </td>
                        <td className="p-3 text-sm">{equipmentOrSupplier}</td>
                        <td
                          className={`p-3 text-sm text-right font-semibold ${
                            isReceipt ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {entry.delta >= 0 ? "+" : "-"}
                          {Math.abs(entry.delta)} {entry.unit}
                        </td>
                        <td className="p-3 text-sm text-right">
                          {entry.opening} {entry.unit}
                        </td>
                        <td className="p-3 text-sm text-right font-semibold">
                          {entry.closing} {entry.unit}
                        </td>
                        <td className="p-3 text-sm">{authorizedBy}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </StoresShell>
  );
}

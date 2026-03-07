"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageIntro } from "@/components/shared/page-intro";
import { StatusState } from "@/components/shared/status-state";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NumericCell } from "@/components/ui/numeric-cell";
import { StatusChip } from "@/components/ui/status-chip";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ReceiptLong } from "@/lib/icons";
import { SaleCalculator } from "@/components/scrap-metal/sale-calculator";

type Sale = {
  id: string;
  saleNumber: string;
  saleDate: string;
  buyerName: string;
  recordedWeight: number;
  soldWeight: number;
  weightDiscrepancy: number;
  pricePerKg: number;
  totalAmount: number;
  currency: string;
  status: string;
  batch: {
    batchNumber: string;
    category: string;
  };
  site: {
    name: string;
    code: string;
  };
};

async function fetchSales(): Promise<Sale[]> {
  const response = await fetchJson<{ data: Sale[] }>("/api/scrap-metal/sales?limit=200");
  return response.data;
}

export default function ScrapMetalSalesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const {
    data: sales = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["scrap-metal-sales"],
    queryFn: fetchSales,
  });

  const approveSaleMutation = useMutation({
    mutationFn: (saleId: string) =>
      fetchJson(`/api/scrap-metal/sales/${saleId}/approve`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-sales"] });
      toast({
        title: "Sale approved",
        description: "The sale has been approved successfully",
        variant: "success",
      });
      setSelectedSale(null);
    },
    onError: (error) => {
      toast({
        title: "Approval failed",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<Sale>[]>(
    () => [
      {
        id: "saleNumber",
        header: "Sale #",
        cell: ({ row }) => (
          <span className="font-mono font-semibold">{row.original.saleNumber}</span>
        ),
        size: 120,
      },
      {
        id: "saleDate",
        header: "Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.saleDate).toLocaleDateString()}
          </NumericCell>
        ),
        size: 100,
      },
      {
        id: "batch",
        header: "Batch",
        cell: ({ row }) => (
          <div>
            <div className="font-mono text-sm">{row.original.batch.batchNumber}</div>
            <div className="text-xs text-muted-foreground">{row.original.batch.category}</div>
          </div>
        ),
        size: 140,
      },
      {
        id: "buyerName",
        header: "Buyer",
        accessorKey: "buyerName",
        size: 180,
      },
      {
        id: "discrepancy",
        header: "Weight Discrepancy",
        cell: ({ row }) => (
          <div>
            <NumericCell className={row.original.weightDiscrepancy > 0 ? "text-destructive" : ""}>
              {row.original.weightDiscrepancy.toFixed(2)} kg
            </NumericCell>
            <div className="text-xs text-muted-foreground">
              {row.original.soldWeight.toFixed(2)} / {row.original.recordedWeight.toFixed(2)} kg
            </div>
          </div>
        ),
        size: 140,
      },
      {
        id: "totalAmount",
        header: "Amount",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.currency} {row.original.totalAmount.toFixed(2)}
          </NumericCell>
        ),
        size: 110,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusChip
            status={
              row.original.status === "APPROVED"
                ? "passing"
                : row.original.status === "PENDING_APPROVAL"
                  ? "in_review"
                  : "pending"
            }
            label={row.original.status.replace(/_/g, " ")}
          />
        ),
        size: 120,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex gap-2">
            {row.original.status === "PENDING_APPROVAL" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedSale(row.original)}
              >
                Review
              </Button>
            )}
          </div>
        ),
        size: 100,
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <PageIntro
        purpose="Record and approve batch sales to buyers—verify sold weight and track discrepancies"
        title="Scrap Metal Sales"
        actions={
          <Button asChild size="sm">
            <Link href="/scrap-metal">Back to Dashboard</Link>
          </Button>
        }
      />

      {error ? (
        <StatusState
          variant="error"
          title="Unable to load sales"
          description={getApiErrorMessage(error)}
          action={
            <Button onClick={() => refetch()} variant="outline" size="sm">
              Try Again
            </Button>
          }
        />
      ) : (
        <DataTable
          data={sales}
          columns={columns}
          searchPlaceholder="Search by sale number or buyer"
          searchSubmitLabel="Search"
          tableClassName="text-sm"
          pagination={{ enabled: true }}
          emptyState={isLoading ? "Loading sales..." : "No sales recorded yet"}
        />
      )}

      {selectedSale && (
        <Dialog open={!!selectedSale} onOpenChange={() => setSelectedSale(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Review Sale - {selectedSale.saleNumber}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Batch</div>
                  <div className="font-semibold">{selectedSale.batch.batchNumber}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Category</div>
                  <div className="font-semibold">{selectedSale.batch.category}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Buyer</div>
                  <div className="font-semibold">{selectedSale.buyerName}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Sale Date</div>
                  <div className="font-semibold">
                    {new Date(selectedSale.saleDate).toLocaleString()}
                  </div>
                </div>
              </div>

              <SaleCalculator
                recordedWeight={selectedSale.recordedWeight}
                onWeightCalculated={(weight) => {
                  // Weight calculated, can be used for verification
                  console.log("Verified weight:", weight);
                }}
              />

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedSale(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => approveSaleMutation.mutate(selectedSale.id)}
                  disabled={approveSaleMutation.isPending}
                >
                  {approveSaleMutation.isPending ? "Approving..." : "Approve Sale"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

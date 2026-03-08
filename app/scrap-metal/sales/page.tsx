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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cancelReason, setCancelReason] = useState("");

  const {
    data: sales = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["scrap-metal-sales"],
    queryFn: fetchSales,
  });

  const filteredSales = useMemo(() => {
    if (statusFilter === "all") return sales;
    return sales.filter((sale) => sale.status === statusFilter);
  }, [sales, statusFilter]);

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


  const completeSaleMutation = useMutation({
    mutationFn: (saleId: string) =>
      fetchJson(`/api/scrap-metal/sales/${saleId}/complete`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-sales"] });
      toast({
        title: "Sale completed",
        description: "The sale has been marked as completed",
        variant: "success",
      });
      setSelectedSale(null);
    },
    onError: (error) => {
      toast({
        title: "Unable to complete sale",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const cancelSaleMutation = useMutation({
    mutationFn: (input: { saleId: string; reason?: string }) =>
      fetchJson(`/api/scrap-metal/sales/${input.saleId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: input.reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-sales"] });
      toast({
        title: "Sale cancelled",
        description: "The sale has been cancelled",
        variant: "success",
      });
      setCancelReason("");
      setSelectedSale(null);
    },
    onError: (error) => {
      toast({
        title: "Unable to cancel sale",
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
              row.original.status === "COMPLETED"
                ? "passing"
                : row.original.status === "APPROVED"
                  ? "in_review"
                  : row.original.status === "PENDING_APPROVAL"
                    ? "pending"
                    : row.original.status === "CANCELLED"
                      ? "inactive"
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
            {["PENDING_APPROVAL", "APPROVED"].includes(row.original.status) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedSale(row.original)}
              >
                {row.original.status === "APPROVED" ? "Close" : "Review"}
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
        <>
          {/* Status Filter Toolbar */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">
                Status:
              </label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground">
              Showing {filteredSales.length} of {sales.length} sales
            </div>
          </div>

          <DataTable
            data={filteredSales}
            columns={columns}
            searchPlaceholder="Search by sale number or buyer"
            searchSubmitLabel="Search"
            tableClassName="text-sm"
            pagination={{ enabled: true }}
            emptyState={isLoading ? "Loading sales..." : statusFilter === "all" ? "No sales recorded yet" : `No sales with status "${statusFilter.replace(/_/g, ' ')}"`}
          />
        </>
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

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Cancellation note (optional)</label>
                <textarea
                  className="min-h-[74px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="State reason if this sale is being cancelled"
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setSelectedSale(null); setCancelReason(""); }}>
                    Close
                  </Button>
                  {selectedSale.status === "PENDING_APPROVAL" ? (
                    <>
                      <Button
                        variant="destructive"
                        onClick={() =>
                          cancelSaleMutation.mutate({ saleId: selectedSale.id, reason: cancelReason })
                        }
                        disabled={cancelSaleMutation.isPending || approveSaleMutation.isPending}
                      >
                        {cancelSaleMutation.isPending ? "Cancelling..." : "Cancel Sale"}
                      </Button>
                      <Button
                        onClick={() => approveSaleMutation.mutate(selectedSale.id)}
                        disabled={approveSaleMutation.isPending || cancelSaleMutation.isPending}
                      >
                        {approveSaleMutation.isPending ? "Approving..." : "Approve Sale"}
                      </Button>
                    </>
                  ) : selectedSale.status === "APPROVED" ? (
                    <>
                      <Button
                        variant="destructive"
                        onClick={() =>
                          cancelSaleMutation.mutate({ saleId: selectedSale.id, reason: cancelReason })
                        }
                        disabled={cancelSaleMutation.isPending || completeSaleMutation.isPending}
                      >
                        {cancelSaleMutation.isPending ? "Cancelling..." : "Cancel Sale"}
                      </Button>
                      <Button
                        onClick={() => completeSaleMutation.mutate(selectedSale.id)}
                        disabled={completeSaleMutation.isPending || cancelSaleMutation.isPending}
                      >
                        {completeSaleMutation.isPending ? "Completing..." : "Mark Completed"}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

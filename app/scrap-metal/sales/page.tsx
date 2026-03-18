"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { SaleCalculator } from "@/components/scrap-metal/sale-calculator";
import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { StatusState } from "@/components/shared/status-state";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Pencil, Plus, Trash2 } from "@/lib/icons";

type Sale = {
  id: string;
  saleNumber: string;
  saleDate: string;
  buyerName: string;
  buyerContact?: string | null;
  recordedWeight: number;
  soldWeight: number;
  weightDiscrepancy: number;
  pricePerKg: number;
  totalAmount: number;
  currency: string;
  status: string;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
  batch: {
    id: string;
    batchNumber: string;
    category: string;
    totalWeight: number;
  };
  material?: {
    id: string;
    code: string;
    name: string;
    category: string;
  } | null;
  site: {
    id: string;
    name: string;
    code: string;
  };
};

type BatchOption = {
  id: string;
  batchNumber: string;
  category: string;
  totalWeight: number;
  status: string;
  material?: { id: string; code: string; name: string; category: string } | null;
  site: {
    id: string;
    name: string;
    code: string;
  };
};

type SaleForm = {
  saleDate: string;
  batchId: string;
  buyerName: string;
  buyerContact: string;
  recordedWeight: string;
  soldWeight: string;
  pricePerKg: string;
  currency: string;
  paymentMethod: string;
  paymentReference: string;
  overrideReason: string;
  notes: string;
};

function getEmptyForm(): SaleForm {
  return {
    saleDate: new Date().toISOString().slice(0, 16),
    batchId: "__none",
    buyerName: "",
    buyerContact: "",
    recordedWeight: "",
    soldWeight: "",
    pricePerKg: "",
    currency: "USD",
    paymentMethod: "",
    paymentReference: "",
    overrideReason: "",
    notes: "",
  };
}

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
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [form, setForm] = useState<SaleForm>(getEmptyForm);

  const salesQuery = useQuery({
    queryKey: ["scrap-metal-sales"],
    queryFn: fetchSales,
  });
  const batchOptionsQuery = useQuery({
    queryKey: ["scrap-ready-batches"],
    queryFn: () => fetchJson<{ data: BatchOption[] }>("/api/scrap-metal/batches?limit=500"),
  });

  const batches = (batchOptionsQuery.data?.data ?? []).filter((batch) =>
    ["COLLECTING", "READY"].includes(batch.status),
  );
  const selectedBatch = batches.find((batch) => batch.id === form.batchId) ?? null;

  const filteredSales = useMemo(() => {
    const records = salesQuery.data ?? [];
    if (statusFilter === "all") return records;
    return records.filter((sale) => sale.status === statusFilter);
  }, [salesQuery.data, statusFilter]);

  const saveMutation = useMutation({
    mutationFn: async (payload: SaleForm) => {
      const hasOverride =
        selectedBatch && Number(payload.soldWeight || 0) * Number(payload.pricePerKg || 0) !== 0 && payload.overrideReason.trim();
      const noteParts = [payload.notes.trim()];
      if (hasOverride) {
        noteParts.push(`Deal note: ${payload.overrideReason.trim()}`);
      }

      const body = {
        saleDate: new Date(payload.saleDate).toISOString(),
        siteId: editing?.site.id ?? selectedBatch?.site.id,
        batchId: payload.batchId,
        materialId: editing?.material?.id ?? selectedBatch?.material?.id,
        buyerName: payload.buyerName,
        buyerContact: payload.buyerContact || undefined,
        recordedWeight: Number(payload.recordedWeight),
        soldWeight: Number(payload.soldWeight),
        pricePerKg: Number(payload.pricePerKg),
        currency: payload.currency,
        paymentMethod: payload.paymentMethod || undefined,
        paymentReference: payload.paymentReference || undefined,
        notes: noteParts.filter(Boolean).join("\n") || undefined,
      };

      if (!body.siteId) {
        throw new Error("Select a batch first.");
      }

      if (editing) {
        return fetchJson(`/api/scrap-metal/sales/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }

      return fetchJson("/api/scrap-metal/sales", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({ title: editing ? "Sale updated" : "Sale recorded", variant: "success" });
      setFormOpen(false);
      setEditing(null);
      setForm(getEmptyForm());
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-sales"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-batches"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-dashboard-v2"] });
    },
    onError: (error) => {
      toast({
        title: editing ? "Unable to update sale" : "Unable to record sale",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/scrap-metal/sales/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Sale removed", variant: "success" });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-sales"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to remove sale",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const approveSaleMutation = useMutation({
    mutationFn: (saleId: string) =>
      fetchJson(`/api/scrap-metal/sales/${saleId}/approve`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-sales"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-batches"] });
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
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-batches"] });
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
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-batches"] });
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
        id: "material",
        header: "Material",
        accessorFn: (row) => `${row.material?.name ?? row.batch.category} ${row.buyerName}`,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.material?.name ?? row.original.batch.category}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.material?.code ?? row.original.batch.category}
            </div>
          </div>
        ),
        size: 160,
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
          <div className="flex justify-end gap-2">
            {["DRAFT", "PENDING_APPROVAL"].includes(row.original.status) ? (
              <>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(row.original);
                    setForm({
                      saleDate: row.original.saleDate.slice(0, 16),
                      batchId: row.original.batch.id,
                      buyerName: row.original.buyerName,
                      buyerContact: row.original.buyerContact ?? "",
                      recordedWeight: String(row.original.recordedWeight),
                      soldWeight: String(row.original.soldWeight),
                      pricePerKg: String(row.original.pricePerKg),
                      currency: row.original.currency,
                      paymentMethod: row.original.paymentMethod ?? "",
                      paymentReference: row.original.paymentReference ?? "",
                      overrideReason: "",
                      notes: row.original.notes ?? "",
                    });
                    setFormOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="destructive"
                  onClick={() => setDeleteTarget(row.original)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            ) : null}
            {["PENDING_APPROVAL", "APPROVED"].includes(row.original.status) ? (
              <Button size="sm" variant="outline" onClick={() => setSelectedSale(row.original)}>
                {row.original.status === "APPROVED" ? "Close" : "Review"}
              </Button>
            ) : null}
          </div>
        ),
        size: 180,
      },
    ],
    [],
  );

  return (
    <ScrapShell
      title="Bulk Sales"
      description="Capture buyer deals, review weight acceptance, and close approved sales."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setForm(getEmptyForm());
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New Sale
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/scrap-metal/yard/batches">Yard Lots</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/stores/movements">Stock Movements</Link>
          </Button>
        </div>
      }
    >
      {salesQuery.error ? (
        <StatusState
          variant="error"
          title="Unable to load sales"
          description={getApiErrorMessage(salesQuery.error)}
          action={
            <Button onClick={() => salesQuery.refetch()} variant="outline" size="sm">
              Try Again
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
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
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground">
              {filteredSales.length} of {(salesQuery.data ?? []).length} sales
            </div>
          </div>

          <DataTable
            data={filteredSales}
            columns={columns}
            searchPlaceholder="Search sale, buyer, material, or batch"
            searchSubmitLabel="Search"
            tableClassName="text-sm"
            pagination={{ enabled: true }}
            emptyState={
              salesQuery.isLoading
                ? "Loading sales..."
                : statusFilter === "all"
                  ? "No sales recorded yet"
                  : `No sales with status "${statusFilter.replace(/_/g, " ")}"`
            }
          />
        </>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Sale" : "New Sale"}</DialogTitle>
            <DialogDescription>Lock the buyer deal, accepted weight, and final sale value.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                type="datetime-local"
                value={form.saleDate}
                onChange={(event) => setForm((current) => ({ ...current, saleDate: event.target.value }))}
                required
              />
              <Select
                value={form.batchId}
                onValueChange={(value) => {
                  const batch = batches.find((entry) => entry.id === value) ?? null;
                  setForm((current) => ({
                    ...current,
                    batchId: value,
                    recordedWeight: batch ? String(batch.totalWeight) : current.recordedWeight,
                    soldWeight: batch ? String(batch.totalWeight) : current.soldWeight,
                  }));
                }}
                disabled={Boolean(editing)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Batch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Batch</SelectItem>
                  {batches.map((batch) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.batchNumber} · {batch.material?.name ?? batch.category} · {batch.totalWeight.toFixed(2)} kg
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                value={form.buyerName}
                onChange={(event) => setForm((current) => ({ ...current, buyerName: event.target.value }))}
                placeholder="Buyer name"
                required
              />
              <Input
                value={form.buyerContact}
                onChange={(event) => setForm((current) => ({ ...current, buyerContact: event.target.value }))}
                placeholder="Buyer contact"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.recordedWeight}
                onChange={(event) => setForm((current) => ({ ...current, recordedWeight: event.target.value }))}
                placeholder="Recorded kg"
                required
              />
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.soldWeight}
                onChange={(event) => setForm((current) => ({ ...current, soldWeight: event.target.value }))}
                placeholder="Accepted kg"
                required
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.pricePerKg}
                onChange={(event) => setForm((current) => ({ ...current, pricePerKg: event.target.value }))}
                placeholder="Price per kg"
                required
              />
              <div className="rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-sm">
                <div className="text-xs text-muted-foreground">Deal value</div>
                <div className="font-mono font-semibold">
                  {form.currency || "USD"}{" "}
                  {((Number(form.soldWeight) || 0) * (Number(form.pricePerKg) || 0)).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                value={form.currency}
                onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                placeholder="Currency"
                required
              />
              <Input
                value={form.overrideReason}
                onChange={(event) => setForm((current) => ({ ...current, overrideReason: event.target.value }))}
                placeholder="Negotiation or weight variance note"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                value={form.paymentMethod}
                onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))}
                placeholder="Payment method"
              />
              <Input
                value={form.paymentReference}
                onChange={(event) => setForm((current) => ({ ...current, paymentReference: event.target.value }))}
                placeholder="Payment reference"
              />
            </div>

            <Textarea
              rows={4}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Notes"
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saveMutation.isPending || !form.buyerName || form.batchId === "__none"}
              >
                {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Record Sale"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {selectedSale ? (
        <Dialog open={Boolean(selectedSale)} onOpenChange={() => setSelectedSale(null)}>
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
                  <div className="text-muted-foreground">Material</div>
                  <div className="font-semibold">{selectedSale.material?.name ?? selectedSale.batch.category}</div>
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

              <SaleCalculator recordedWeight={selectedSale.recordedWeight} onWeightCalculated={() => {}} />

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Cancellation note</label>
                <textarea
                  className="min-h-[74px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Reason for cancellation"
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedSale(null);
                      setCancelReason("");
                    }}
                  >
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
      ) : null}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Remove Sale</DialogTitle>
            <DialogDescription>
              {deleteTarget ? `Remove ${deleteTarget.saleNumber}?` : "Remove this sale?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending || !deleteTarget}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrapShell>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import { SaleCalculator } from "@/components/scrap-metal/sale-calculator";
import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { FieldHelp } from "@/components/shared/field-help";
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
import { useReservedId } from "@/hooks/use-reserved-id";
import { hasRole } from "@/lib/roles";
import type { ScrapTicketPhoto } from "@/lib/scrap-metal/attachments";
import { exportTicketPdf } from "@/lib/scrap-metal/print-adapter";

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
  attachments?: ScrapTicketPhoto[];
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
  attachments: ScrapTicketPhoto[];
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
    attachments: [],
  };
}

async function uploadScrapTicketPhoto(
  file: File,
  context: "scrap-purchase-ticket-photo" | "scrap-sale-ticket-photo",
): Promise<ScrapTicketPhoto> {
  const formData = new FormData();
  formData.append("context", context);
  formData.append("file", file);

  const response = await fetch("/api/uploads", {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data.error === "string" ? data.error : "Upload failed";
    throw new Error(message);
  }

  if (!data || typeof data.url !== "string" || typeof data.contentType !== "string") {
    throw new Error("Upload response missing file metadata");
  }

  return {
    url: data.url,
    pathname: typeof data.pathname === "string" ? data.pathname : undefined,
    contentType: data.contentType,
    size: typeof data.size === "number" ? data.size : file.size,
    context,
    uploadedAt: new Date().toISOString(),
  };
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

async function fetchSales(): Promise<Sale[]> {
  const response = await fetchJson<{ data: Sale[] }>("/api/scrap-metal/sales?limit=200");
  return response.data;
}

export default function ScrapMetalSalesPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cancelReason, setCancelReason] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [form, setForm] = useState<SaleForm>(getEmptyForm);
  const [submitIntent, setSubmitIntent] = useState<"hold" | "submit" | "submit_print" | "request_approval">("submit");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const canManageSales = hasRole(userRole, ["SUPERADMIN", "MANAGER"]);

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
  const batchOptions = useMemo<SearchableOption[]>(
    () =>
      batches.map((batch) => ({
        value: batch.id,
        label: batch.batchNumber,
        description: `${batch.material?.name ?? batch.category} - ${batch.totalWeight.toFixed(2)} kg`,
        meta: batch.site.code,
      })),
    [batches],
  );
  const selectedBatch = batches.find((batch) => batch.id === form.batchId) ?? null;
  const {
    reservedId: saleNumber,
    isReserving: reservingSaleNumber,
    error: reserveSaleNumberError,
  } = useReservedId({
    entity: "SCRAP_METAL_SALE",
    enabled: formOpen && !editing && Boolean(selectedBatch?.site.id),
    siteId: selectedBatch?.site.id,
  });

  const filteredSales = useMemo(() => {
    const records = salesQuery.data ?? [];
    if (statusFilter === "all") return records;
    return records.filter((sale) => sale.status === statusFilter);
  }, [salesQuery.data, statusFilter]);
  const deepLinkEditId = searchParams.get("edit");

  useEffect(() => {
    if (!formOpen || editing) return;
    if (form.batchId !== "__none") return;
    if (batches.length !== 1) return;
    const onlyBatch = batches[0];
    if (!onlyBatch) return;
    setForm((current) => ({
      ...current,
      batchId: onlyBatch.id,
      recordedWeight: String(onlyBatch.totalWeight),
      soldWeight: String(onlyBatch.totalWeight),
    }));
  }, [batches, editing, form.batchId, formOpen]);

  useEffect(() => {
    if (!deepLinkEditId) return;
    if (salesQuery.isLoading) return;

    const sale = (salesQuery.data ?? []).find((row) => row.id === deepLinkEditId);
    if (!sale) {
      toast({
        title: "Ticket not found",
        description: "The selected draft ticket could not be loaded.",
        variant: "destructive",
      });
      router.replace("/scrap-metal/sales");
      return;
    }

    setEditing(sale);
    setForm({
      saleDate: sale.saleDate.slice(0, 16),
      batchId: sale.batch.id,
      buyerName: sale.buyerName,
      buyerContact: sale.buyerContact ?? "",
      recordedWeight: String(sale.recordedWeight),
      soldWeight: String(sale.soldWeight),
      pricePerKg: String(sale.pricePerKg),
      currency: sale.currency,
      paymentMethod: sale.paymentMethod ?? "",
      paymentReference: sale.paymentReference ?? "",
      overrideReason: "",
      notes: sale.notes ?? "",
      attachments: sale.attachments ?? [],
    });
    setSubmitIntent("submit");
    setFormOpen(true);
    router.replace("/scrap-metal/sales");
  }, [deepLinkEditId, router, salesQuery.data, salesQuery.isLoading, toast]);

  const saveMutation = useMutation({
    mutationFn: async (input: { payload: SaleForm; intent: "hold" | "submit" | "submit_print" | "request_approval" }) => {
      const { payload, intent } = input;
      const hasOverride =
        selectedBatch && Number(payload.soldWeight || 0) * Number(payload.pricePerKg || 0) !== 0 && payload.overrideReason.trim();
      const noteParts = [payload.notes.trim()];
      if (hasOverride) {
        noteParts.push(`Deal note: ${payload.overrideReason.trim()}`);
      }

      const body = {
        saleNumber: saleNumber || undefined,
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
        attachments: payload.attachments,
        status: intent === "hold" || intent === "request_approval" ? "DRAFT" : "PENDING_APPROVAL",
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
    onSuccess: (result, variables) => {
      toast({
        title:
          variables.intent === "hold"
            ? "Outbound ticket held"
            : variables.intent === "request_approval"
              ? "Approval request submitted"
              : "Outbound ticket submitted",
        description:
          variables.intent === "request_approval"
            ? "The ticket is saved as draft for manager review."
            : undefined,
        variant: "success",
      });
      setFormOpen(false);
      setEditing(null);
      setSubmitIntent(canManageSales ? "submit" : "request_approval");
      setForm(getEmptyForm());
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-sales"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-held-outbound-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-batches"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-dashboard-v2"] });

      if (variables.intent === "submit_print" && typeof result === "object" && result && "id" in result) {
        exportTicketPdf({ ticketType: "sale", ticketId: String(result.id), download: false });
      }
    },
    onError: (error) => {
      toast({
        title: editing ? "Unable to update outbound ticket" : "Unable to record outbound ticket",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/scrap-metal/sales/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Outbound ticket removed", variant: "success" });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["scrap-metal-sales"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to remove outbound ticket",
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
        header: "Ticket #",
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
        header: "Lot",
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
        header: "Variance (kg)",
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
                      attachments: row.original.attachments ?? [],
                    });
                    setSubmitIntent("submit");
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
            {canManageSales && ["PENDING_APPROVAL", "APPROVED"].includes(row.original.status) ? (
              <Button size="sm" variant="outline" onClick={() => setSelectedSale(row.original)}>
                {row.original.status === "APPROVED" ? "Close" : "Review"}
              </Button>
            ) : null}
          </div>
        ),
        size: 180,
      },
    ],
    [canManageSales],
  );

  return (
    <ScrapShell
      title="Outbound Tickets"
     
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setForm(getEmptyForm());
              setSubmitIntent(canManageSales ? "submit" : "request_approval");
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New Outbound Ticket
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/scrap-metal/batches">Lots</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/scrap-metal/tickets/held">Held Tickets</Link>
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
            <div className="text-right text-sm text-muted-foreground">
              <div>{filteredSales.length} of {(salesQuery.data ?? []).length} outbound tickets</div>
            </div>
          </div>

          <DataTable
            data={filteredSales}
            columns={columns}
            searchPlaceholder="Search ticket, buyer, material, or lot"
            searchSubmitLabel="Search"
            tableClassName="text-sm"
            pagination={{ enabled: true }}
            emptyState={
              salesQuery.isLoading
                ? "Loading outbound tickets..."
                : statusFilter === "all"
                  ? "No outbound tickets recorded yet"
                  : `No outbound tickets with status "${statusFilter.replace(/_/g, " ")}"`
            }
          />
        </>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Outbound Ticket" : "New Outbound Ticket"}</DialogTitle>
            <DialogDescription>Lock the buyer deal, accepted weight, and final sale value.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate({ payload: form, intent: submitIntent });
            }}
          >
            <p className="text-xs text-muted-foreground">
              Small-yard quick flow: fields marked with * are required. Everything else is optional.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Ticket Number</label>
                <Input
                  value={editing?.saleNumber ?? saleNumber}
                  readOnly
                  aria-readonly="true"
                  placeholder={editing ? "Ticket number" : reservingSaleNumber ? "Reserving..." : "Auto-generated"}
                />
                <FieldHelp
                  hint={
                    editing
                      ? "Ticket number stays locked after creation."
                      : reserveSaleNumberError ?? "Ticket number is generated automatically after a lot is selected."
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Ticket Date</label>
                <Input
                  type="datetime-local"
                  value={form.saleDate}
                  onChange={(event) => setForm((current) => ({ ...current, saleDate: event.target.value }))}
                  required
                />
              </div>
            </div>

            <SearchableSelect
              label="Lot *"
              value={form.batchId === "__none" ? undefined : form.batchId}
              options={batchOptions}
              placeholder={batchOptionsQuery.isLoading ? "Loading lots..." : "Select lot"}
              searchPlaceholder="Search lots..."
              onValueChange={(value) => {
                const batch = batches.find((entry) => entry.id === value) ?? null;
                setForm((current) => ({
                  ...current,
                  batchId: value,
                  recordedWeight: batch ? String(batch.totalWeight) : current.recordedWeight,
                  soldWeight: batch ? String(batch.totalWeight) : current.soldWeight,
                }));
              }}
              onAddOption={() => router.push("/scrap-metal/batches")}
              addLabel="Create lot"
              disabled={Boolean(editing)}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Buyer name *</label>
                <Input
                  value={form.buyerName}
                  onChange={(event) => setForm((current) => ({ ...current, buyerName: event.target.value }))}
                  placeholder="Buyer name"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Buyer contact</label>
                <Input
                  value={form.buyerContact}
                  onChange={(event) => setForm((current) => ({ ...current, buyerContact: event.target.value }))}
                  placeholder="Buyer contact"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Recorded kg *</label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.recordedWeight}
                  onChange={(event) => setForm((current) => ({ ...current, recordedWeight: event.target.value }))}
                  placeholder="Recorded kg"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Accepted kg *</label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.soldWeight}
                  onChange={(event) => setForm((current) => ({ ...current, soldWeight: event.target.value }))}
                  placeholder="Accepted kg"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Price per kg *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.pricePerKg}
                  onChange={(event) => setForm((current) => ({ ...current, pricePerKg: event.target.value }))}
                  placeholder="Price per kg"
                  required
                />
              </div>
              <div className="rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-sm">
                <div className="text-xs text-muted-foreground">Deal value</div>
                <div className="font-mono font-semibold">
                  {form.currency || "USD"}{" "}
                  {((Number(form.soldWeight) || 0) * (Number(form.pricePerKg) || 0)).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Currency *</label>
                <Input
                  value={form.currency}
                  onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                  placeholder="Currency"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Deal note</label>
                <Input
                  value={form.overrideReason}
                  onChange={(event) => setForm((current) => ({ ...current, overrideReason: event.target.value }))}
                  placeholder="Negotiation or weight variance note"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Payment method</label>
                <Input
                  value={form.paymentMethod}
                  onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))}
                  placeholder="Payment method"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Payment reference</label>
                <Input
                  value={form.paymentReference}
                  onChange={(event) => setForm((current) => ({ ...current, paymentReference: event.target.value }))}
                  placeholder="Payment reference"
                />
              </div>
            </div>

            <Textarea
              rows={4}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Notes"
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-sm font-semibold">Ticket Photos</label>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="hidden"
                    disabled={isUploadingPhoto}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;

                      try {
                        setIsUploadingPhoto(true);
                        const uploaded = await uploadScrapTicketPhoto(file, "scrap-sale-ticket-photo");
                        setForm((current) => ({
                          ...current,
                          attachments: [...current.attachments, uploaded].slice(0, 12),
                        }));
                        toast({ title: "Ticket photo uploaded", variant: "success" });
                      } catch (error) {
                        toast({
                          title: "Unable to upload ticket photo",
                          description: getApiErrorMessage(error),
                          variant: "destructive",
                        });
                      } finally {
                        setIsUploadingPhoto(false);
                        event.target.value = "";
                      }
                    }}
                  />
                  {isUploadingPhoto ? "Uploading..." : "Add Photo"}
                </label>
              </div>
              {form.attachments.length > 0 ? (
                <div className="space-y-2 rounded-xl border border-[var(--edge-subtle)] p-3">
                  {form.attachments.map((attachment, index) => (
                    <div key={`${attachment.url}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-[var(--primary-600)] underline"
                      >
                        Photo {index + 1}
                      </a>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-muted-foreground">{formatFileSize(attachment.size)}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              attachments: current.attachments.filter((_, itemIndex) => itemIndex !== index),
                            }))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No photos attached yet.</p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="outline"
                onClick={() => setSubmitIntent("hold")}
                disabled={
                  saveMutation.isPending ||
                  (!editing && (!saleNumber || reservingSaleNumber)) ||
                  !form.buyerName ||
                  form.batchId === "__none" ||
                  isUploadingPhoto
                }
              >
                {saveMutation.isPending ? "Saving..." : "Hold Ticket"}
              </Button>
              {canManageSales ? (
                <Button
                  type="submit"
                  onClick={() => setSubmitIntent("submit")}
                  disabled={
                    saveMutation.isPending ||
                    (!editing && (!saleNumber || reservingSaleNumber)) ||
                    !form.buyerName ||
                    form.batchId === "__none" ||
                    isUploadingPhoto
                  }
                >
                  {saveMutation.isPending ? "Saving..." : "Submit Ticket"}
                </Button>
              ) : null}
              {canManageSales ? (
                <Button
                  type="submit"
                  onClick={() => setSubmitIntent("submit_print")}
                  disabled={
                    saveMutation.isPending ||
                    (!editing && (!saleNumber || reservingSaleNumber)) ||
                    !form.buyerName ||
                    form.batchId === "__none" ||
                    isUploadingPhoto
                  }
                >
                  {saveMutation.isPending ? "Saving..." : "Submit & Export PDF"}
                </Button>
              ) : (
                <Button
                  type="submit"
                  onClick={() => setSubmitIntent("request_approval")}
                  disabled={
                    saveMutation.isPending ||
                    (!editing && (!saleNumber || reservingSaleNumber)) ||
                    !form.buyerName ||
                    form.batchId === "__none" ||
                    isUploadingPhoto
                  }
                >
                  {saveMutation.isPending ? "Saving..." : "Request Approval"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {selectedSale ? (
        <Dialog open={Boolean(selectedSale)} onOpenChange={() => setSelectedSale(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Review Outbound Ticket - {selectedSale.saleNumber}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Lot</div>
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
                <p className="text-xs text-muted-foreground">
                  Approve locks pricing and reserves the lot. Complete records final payment closeout.
                </p>
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
            <DialogTitle>Remove Outbound Ticket</DialogTitle>
            <DialogDescription>
              {deleteTarget ? `Remove ${deleteTarget.saleNumber}?` : "Remove this outbound ticket?"}
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

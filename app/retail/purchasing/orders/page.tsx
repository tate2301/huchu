"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import {
  AdminDistributionChart,
  AdminDonutChart,
} from "@/components/charts/admin-headless-charts";
import { RetailShell } from "@/components/retail/retail-shell";
import { ReportChartShell } from "@/components/retail/reports/report-chart-shell";
import { ReportFilterBar } from "@/components/retail/reports/report-filter-bar";
import { ReportBigNumber } from "@/components/retail/reports/report-big-number";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchInventoryItems, fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { CheckCircle2, LocalShipping, Package, Pencil, Plus, ReceiptLong, Trash2 } from "@/lib/icons";
import { useReservedId } from "@/hooks/use-reserved-id";

type PurchaseOrderLine = {
  inventoryItemId: string | null;
  itemName: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
};

type PurchaseOrder = {
  id: string;
  poNo: string;
  siteId: string;
  supplierName: string;
  status: string;
  expectedDate: string | null;
  notes: string | null;
  lines: PurchaseOrderLine[];
  totalValue: number;
  totalQuantity: number;
  receivedQuantity: number;
  site: { id: string; name: string; code: string } | null;
};

type OrderForm = {
  supplierName: string;
  siteId: string;
  expectedDate: string;
  notes: string;
  lines: Array<{
    inventoryItemId: string;
    itemName: string;
    quantity: string;
    unitCost: string;
  }>;
};

function emptyForm(): OrderForm {
  return { supplierName: "", siteId: "", expectedDate: "", notes: "", lines: [] };
}

function emptyLine(item?: SearchableOption): OrderForm["lines"][0] {
  return { inventoryItemId: item?.value ?? "", itemName: item?.label ?? "", quantity: "", unitCost: "" };
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function dateLabel(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

export default function PurchaseOrdersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrder | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null);
  const [form, setForm] = useState<OrderForm>(emptyForm);

  const ordersQuery = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: () => fetchJson<{ data: PurchaseOrder[] }>("/api/v2/retail/purchase-orders"),
  });
  const sitesQuery = useQuery({ queryKey: ["retail-sites"], queryFn: fetchSites });
  const inventoryQuery = useQuery({ queryKey: ["retail-inventory"], queryFn: fetchInventoryItems });

  const orders = ordersQuery.data?.data ?? [];
  const draftOrders = orders.filter((o) => o.status === "DRAFT");
  const pendingOrders = orders.filter((o) => o.status === "SENT");

  const siteOptions: SearchableOption[] = useMemo(
    () => (sitesQuery.data ?? []).map((s: { id: string; name: string }) => ({ value: s.id, label: s.name })),
    [sitesQuery.data],
  );
  const itemOptions: SearchableOption[] = useMemo(
    () => (inventoryQuery.data ?? []).map((i: { id: string; itemName: string }) => ({ value: i.id, label: i.itemName })),
    [inventoryQuery.data],
  );

  const { reservedId: poNo, isReserving: isReservingPo, error: reservePoError } = useReservedId({
    entity: "PURCHASE_ORDER", enabled: dialogOpen && !editing,
  });

  const totalLines = (f: OrderForm) => f.lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  const totalCost = (f: OrderForm) => f.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  const saveMutation = useMutation({
    mutationFn: async (f: OrderForm) => {
      const body = {
        poNo: editing ? undefined : poNo || undefined,
        supplierName: f.supplierName, siteId: f.siteId,
        expectedDate: f.expectedDate ? new Date(f.expectedDate).toISOString() : undefined,
        notes: f.notes.trim() || undefined,
        lines: f.lines.map((l) => ({
          inventoryItemId: l.inventoryItemId, quantity: Number(l.quantity), unitCost: Number(l.unitCost),
        })),
      };
      if (editing) return fetchJson(`/api/v2/retail/purchase-orders/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return fetchJson("/api/v2/retail/purchase-orders", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast({ title: editing ? "Updated" : "Created", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setDialogOpen(false); setEditing(null); setForm(emptyForm());
    },
    onError: (error) => {
      toast({ title: editing ? "Update failed" : "Create failed", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/v2/retail/purchase-orders/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Removed", variant: "success" }); queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }); setDeleteTarget(null); },
    onError: (error) => { toast({ title: "Remove failed", description: getApiErrorMessage(error), variant: "destructive" }); },
  });

  const receiveMutation = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/v2/retail/purchase-orders/${id}/receive`, { method: "POST" }),
    onSuccess: () => { toast({ title: "Received", variant: "success" }); queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }); setReceiveTarget(null); },
    onError: (error) => { toast({ title: "Receive failed", description: getApiErrorMessage(error), variant: "destructive" }); },
  });

  /* chart data */
  const statusRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of orders) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
    return Array.from(counts.entries()).map(([label, value]) => ({
      id: label, label, value,
      tone: label === "SENT" ? ("success" as const) : label === "DRAFT" ? ("warning" as const) : ("default" as const),
    }));
  }, [orders]);

  const supplierRows = useMemo(() => {
    const supplierTotals = new Map<string, number>();
    for (const o of orders) supplierTotals.set(o.supplierName, (supplierTotals.get(o.supplierName) ?? 0) + o.totalValue);
    return Array.from(supplierTotals.entries())
      .sort(([, a], [, b]) => b - a).slice(0, 8)
      .map(([label, value]) => ({ id: label, label, value }));
  }, [orders]);

  const columns = useMemo<ColumnDef<PurchaseOrder>[]>(() => [
    { id: "poNo", header: "PO", cell: ({ row }) => (
      <div><div className="font-mono font-semibold">{row.original.poNo}</div><div className="text-xs text-[var(--text-muted)]">{row.original.supplierName}</div></div>
    )},
    { id: "site", header: "Site", cell: ({ row }) => row.original.site?.name ?? "—" },
    { id: "status", header: "Status", cell: ({ row }) => row.original.status },
    { id: "totalValue", header: "Value", cell: ({ row }) => <NumericCell>{money(row.original.totalValue)}</NumericCell> },
    { id: "lines", header: "Lines", cell: ({ row }) => (
      <div className="text-right text-xs">{row.original.totalQuantity} / {row.original.receivedQuantity} received</div>
    )},
    { id: "expectedDate", header: "Expected", cell: ({ row }) => dateLabel(row.original.expectedDate) },
    { id: "actions", header: "", cell: ({ row }) => (
      <div className="flex justify-end gap-2">
        {row.original.status === "SENT" && (
          <Button size="sm" variant="outline" onClick={() => setReceiveTarget(row.original)}>
            <CheckCircle2 className="h-4 w-4" />
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => { setEditing(row.original); setForm({
          supplierName: row.original.supplierName, siteId: row.original.siteId,
          expectedDate: row.original.expectedDate ? row.original.expectedDate.slice(0, 16) : "",
          notes: row.original.notes ?? "",
          lines: row.original.lines.map((l) => ({ inventoryItemId: l.inventoryItemId ?? "", itemName: l.itemName, quantity: String(l.quantity), unitCost: String(l.unitCost) })),
        }); setDialogOpen(true); }}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDeleteTarget(row.original)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    )},
  ], []);

  return (
    <RetailShell title="Purchase orders" actions={
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => { setEditing(null); setForm(emptyForm()); setDialogOpen(true); }}><Plus className="h-4 w-4" />New</Button>
        <Button asChild size="sm" variant="outline"><Link href="/retail/purchasing/suppliers"><LocalShipping className="h-4 w-4" />Suppliers</Link></Button>
      </div>
    }>
      <ReportFilterBar onExport={() => {}} />

      <div className="grid gap-5 xl:grid-cols-3">
        <ReportChartShell title="Order value" sourceTag={{ label: "PO" }}>
          <ReportBigNumber label="Total" value={money(orders.reduce((s, o) => s + o.totalValue, 0))} />
        </ReportChartShell>
        <ReportChartShell title="Draft" sourceTag={{ label: "PO" }}>
          <ReportBigNumber label="Draft orders" value={draftOrders.length.toString()} dotColor="var(--status-warning-border)" />
        </ReportChartShell>
        <ReportChartShell title="Pending" sourceTag={{ label: "PO" }}>
          <ReportBigNumber label="Awaiting receipt" value={pendingOrders.length.toString()} dotColor="var(--status-success-border)" />
        </ReportChartShell>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <ReportChartShell title="Top suppliers" sourceTag={{ label: "PO" }}>
          <AdminDistributionChart rows={supplierRows} valueLabel="Value" valueFormatter={money} height={280} />
        </ReportChartShell>
        <ReportChartShell title="Status breakdown" sourceTag={{ label: "PO" }}>
          <AdminDonutChart rows={statusRows} valueLabel="Orders" valueFormatter={(v) => v.toString()} height={280} />
        </ReportChartShell>
      </div>

      <DataTable
        data={orders}
        columns={columns}
        features={{ sorting: true, globalFilter: true, pagination: true }}
        pagination={{ enabled: true, server: false }}
        searchPlaceholder="Search orders"
        emptyState={ordersQuery.isLoading ? "Loading..." : "No orders"}
      />

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[96dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit order" : "New order"}</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!form.supplierName || !form.siteId) { toast({ title: "Fill required fields", variant: "destructive" }); return; } saveMutation.mutate(form); }}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">PO number</label>
                <Input value={editing ? editing.poNo : (poNo ?? (isReservingPo ? "Reserving..." : reservePoError ?? ""))} readOnly />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Supplier</label>
                <Input value={form.supplierName} onChange={(e) => setForm((c) => ({ ...c, supplierName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Site</label>
                <SearchableSelect options={siteOptions} value={form.siteId} onSelect={(v) => setForm((c) => ({ ...c, siteId: v }))} searchPlaceholder="Search sites" />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Expected date</label>
                <Input type="date" value={form.expectedDate} onChange={(e) => setForm((c) => ({ ...c, expectedDate: e.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="block text-sm font-semibold">Notes</label>
                <Textarea value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} rows={2} />
              </div>
            </div>

            {/* Lines */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">Lines</span>
                <span className="font-mono text-sm font-semibold">{totalLines(form)} · {money(totalCost(form))}</span>
              </div>
              <div className="space-y-2">
                {form.lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_90px_100px_32px] items-end gap-2">
                    <div>
                      <SearchableSelect
                        options={itemOptions} value={line.inventoryItemId}
                        onSelect={(val, opt) => setForm((c) => { const next = [...c.lines]; next[idx] = { ...next[idx], inventoryItemId: val, itemName: opt?.label ?? "" }; return { ...c, lines: next }; })}
                        searchPlaceholder="Search items" className="w-full"
                      />
                    </div>
                    <Input inputMode="decimal" placeholder="Qty" value={line.quantity}
                      onChange={(e) => setForm((c) => { const next = [...c.lines]; next[idx] = { ...next[idx], quantity: e.target.value }; return { ...c, lines: next }; })} />
                    <Input inputMode="decimal" placeholder="Cost" value={line.unitCost}
                      onChange={(e) => setForm((c) => { const next = [...c.lines]; next[idx] = { ...next[idx], unitCost: e.target.value }; return { ...c, lines: next }; })} />
                    <Button type="button" size="sm" variant="ghost" onClick={() => setForm((c) => ({ ...c, lines: c.lines.filter((_, i) => i !== idx) }))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="ghost" onClick={() => setForm((c) => ({ ...c, lines: [...c.lines, emptyLine()] }))}>Add line</Button>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Remove order</DialogTitle></DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive Dialog */}
      <Dialog open={Boolean(receiveTarget)} onOpenChange={(open) => !open && setReceiveTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Receive order</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="font-mono font-semibold">{receiveTarget?.poNo}</div>
            <div>{receiveTarget?.supplierName}</div>
            <div className="text-[var(--text-muted)]">{receiveTarget?.totalQuantity} items · {money(receiveTarget?.totalValue ?? 0)}</div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReceiveTarget(null)}>Cancel</Button>
            <Button type="button" onClick={() => receiveTarget && receiveMutation.mutate(receiveTarget.id)}>
              <CheckCircle2 className="mr-1 h-4 w-4" /> Confirm receive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RetailShell>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AdminDistributionChart,
  AdminDonutChart,
  AdminTrendChart,
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Pencil, Plus, Trash2, Wallet } from "@/lib/icons";
import { useReservedId } from "@/hooks/use-reserved-id";

type Promotion = {
  id: string; promoCode: string; name: string; type: string; value: number;
  startsAt: string | null; endsAt: string | null; status: string; notes: string | null;
};

type PromotionForm = {
  name: string; type: string; value: string; startsAt: string;
  endsAt: string; status: string; notes: string;
};

function emptyForm(): PromotionForm {
  return { name: "", type: "PERCENT", value: "", startsAt: "", endsAt: "", status: "ACTIVE", notes: "" };
}

function dateLabel(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

export default function RetailPromotionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null);
  const [form, setForm] = useState<PromotionForm>(emptyForm);

  const promotionsQuery = useQuery({
    queryKey: ["retail-promotions"],
    queryFn: () => fetchJson<{ data: Promotion[] }>("/api/v2/retail/promotions"),
  });

  const { reservedId: promoCode, isReserving, error: reserveError } = useReservedId({
    entity: "RETAIL_PROMOTION", enabled: dialogOpen && !editing,
  });

  const promotions = promotionsQuery.data?.data ?? [];
  const activeCount = promotions.filter((p) => p.status === "ACTIVE").length;

  const saveMutation = useMutation({
    mutationFn: async (payload: PromotionForm) => {
      const body = {
        promoCode: editing ? undefined : promoCode || undefined,
        name: payload.name, type: payload.type, value: Number(payload.value),
        startsAt: payload.startsAt ? new Date(payload.startsAt).toISOString() : undefined,
        endsAt: payload.endsAt ? new Date(payload.endsAt).toISOString() : undefined,
        status: payload.status, notes: payload.notes.trim() || undefined,
      };
      if (editing) {
        return fetchJson(`/api/v2/retail/promotions/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      return fetchJson("/api/v2/retail/promotions", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast({ title: editing ? "Updated" : "Created", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["retail-promotions"] });
      queryClient.invalidateQueries({ queryKey: ["retail-dashboard"] });
      setDialogOpen(false); setEditing(null); setForm(emptyForm());
    },
    onError: (error) => {
      toast({ title: editing ? "Update failed" : "Create failed", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/v2/retail/promotions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Removed", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["retail-promotions"] });
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast({ title: "Remove failed", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  /* chart data */
  const typeRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of promotions) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
    return Array.from(counts.entries()).map(([label, value]) => ({ id: label, label, value }));
  }, [promotions]);

  const statusRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of promotions) counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
    return Array.from(counts.entries()).map(([label, value]) => ({
      id: label, label, value,
      tone: label === "ACTIVE" ? ("success" as const) : label === "SCHEDULED" ? ("warning" as const) : ("default" as const),
    }));
  }, [promotions]);

  const valueRows = useMemo(
    () => promotions.slice().sort((a, b) => b.value - a.value).slice(0, 8).map((p) => ({
      id: p.id, label: p.name, value: p.value,
      tone: p.type === "PERCENT" ? ("success" as const) : ("default" as const),
    })),
    [promotions],
  );

  const columns = useMemo<ColumnDef<Promotion>[]>(() => [
    { id: "promoCode", header: "Promo", cell: ({ row }) => (
      <div><div className="font-medium">{row.original.name}</div><div className="font-mono text-xs text-[var(--text-muted)]">{row.original.promoCode}</div></div>
    )},
    { id: "type", header: "Type", cell: ({ row }) => row.original.type },
    { id: "value", header: "Value", cell: ({ row }) => <NumericCell>{row.original.value.toFixed(2)}</NumericCell> },
    { id: "window", header: "Window", cell: ({ row }) => (
      <div className="text-xs">{dateLabel(row.original.startsAt)} – {dateLabel(row.original.endsAt)}</div>
    )},
    { id: "status", header: "Status", cell: ({ row }) => row.original.status },
    { id: "actions", header: "", cell: ({ row }) => (
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => { setEditing(row.original); setForm({
          name: row.original.name, type: row.original.type, value: String(row.original.value),
          startsAt: row.original.startsAt ? row.original.startsAt.slice(0, 16) : "",
          endsAt: row.original.endsAt ? row.original.endsAt.slice(0, 16) : "",
          status: row.original.status, notes: row.original.notes ?? "",
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
    <RetailShell title="Promotions" actions={
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => { setEditing(null); setForm(emptyForm()); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" />New
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/retail/merchandising/pricing"><Wallet className="h-4 w-4" />Pricing</Link>
        </Button>
      </div>
    }>
      <ReportFilterBar onExport={() => {}} />

      <div className="grid gap-5 xl:grid-cols-3">
        <ReportChartShell title="Active" sourceTag={{ label: "Promotions" }}>
          <ReportBigNumber label="Active campaigns" value={activeCount.toString()} dotColor="var(--status-success-border)" />
        </ReportChartShell>
        <ReportChartShell title="Total" sourceTag={{ label: "Promotions" }}>
          <ReportBigNumber label="Total campaigns" value={promotions.length.toString()} dotColor="var(--status-info-border)" />
        </ReportChartShell>
        <ReportChartShell title="Types" sourceTag={{ label: "Promotions" }}>
          <ReportBigNumber label="Type variants" value={String(new Set(promotions.map((p) => p.type)).size)} dotColor="var(--action-primary-bg)" />
        </ReportChartShell>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <ReportChartShell title="Promotion values" sourceTag={{ label: "Promotions" }}>
          <AdminDistributionChart rows={valueRows} valueLabel="Value" valueFormatter={(v) => v.toFixed(2)} height={280} />
        </ReportChartShell>
        <ReportChartShell title="Status" sourceTag={{ label: "Promotions" }}>
          <AdminDonutChart rows={statusRows} valueLabel="Count" valueFormatter={(v) => v.toString()} height={280} />
        </ReportChartShell>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <ReportChartShell title="Type distribution" sourceTag={{ label: "Promotions" }}>
          <AdminDonutChart rows={typeRows} valueLabel="Count" valueFormatter={(v) => v.toString()} height={260} />
        </ReportChartShell>
        <ReportChartShell title="Avg value" sourceTag={{ label: "Promotions" }}>
          <ReportBigNumber
            label="Avg value"
            value={promotions.length ? (promotions.reduce((s, p) => s + p.value, 0) / promotions.length).toFixed(2) : "0"}
            dotColor="var(--action-primary-bg)"
          />
        </ReportChartShell>
      </div>

      <DataTable
        data={promotions}
        columns={columns}
        features={{ sorting: true, globalFilter: true, pagination: true }}
        pagination={{ enabled: true, server: false }}
        searchPlaceholder="Search promotions"
        emptyState={promotionsQuery.isLoading ? "Loading..." : "No promotions"}
      />

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit promotion" : "New promotion"}</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Promo code</label>
                <Input value={editing ? editing.promoCode : promoCode} readOnly disabled={isReserving && !editing} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Name</label>
                <Input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Type</label>
                <Select value={form.type} onValueChange={(v) => setForm((c) => ({ ...c, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENT">Percent</SelectItem>
                    <SelectItem value="AMOUNT">Amount</SelectItem>
                    <SelectItem value="BUY_X_GET_Y">Buy X Get Y</SelectItem>
                    <SelectItem value="BUNDLE">Bundle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Value</label>
                <Input value={form.value} inputMode="decimal" onChange={(e) => setForm((c) => ({ ...c, value: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Starts</label>
                <Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm((c) => ({ ...c, startsAt: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Ends</label>
                <Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm((c) => ({ ...c, endsAt: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Status</label>
                <Select value={form.status} onValueChange={(v) => setForm((c) => ({ ...c, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold">Notes</label>
              <Textarea value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} rows={3} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending || !form.name}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Remove promotion</DialogTitle></DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RetailShell>
  );
}

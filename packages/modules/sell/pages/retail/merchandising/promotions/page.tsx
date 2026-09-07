"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AdminDistributionChart,
  AdminDonutChart,
} from "@corelithzw/ui/charts/admin-headless-charts";
import { Alert, Card, EmptyState, Skeleton, StatCard } from "@corelithzw/react";
import { RetailShell } from "../../../../components/retail-shell";
import { Button } from "@corelithzw/ui/components/button";
import { DataTable } from "@corelithzw/ui/components/data-table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@corelithzw/ui/components/dialog";
import { Input } from "@corelithzw/ui/components/input";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@corelithzw/ui/components/select";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { ChevronDown, Pencil, Plus, Trash2, Wallet } from "@corelithzw/ui/lib/icons";
import { useReservedId } from "@corelithzw/platform/hooks/use-reserved-id";

type Promotion = {
  id: string; promoCode: string; name: string; type: string; value: number;
  startsAt: string | null; endsAt: string | null; status: string; notes: string | null;
};

type PromotionForm = {
  name: string; type: string; value: string; startsAt: string;
  endsAt: string; status: string; notes: string;
};

function emptyForm(): PromotionForm {
  return { name: "", type: "PERCENT", value: "", startsAt: new Date().toISOString().slice(0, 16), endsAt: "", status: "ACTIVE", notes: "" };
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const promotionsQuery = useQuery({
    queryKey: ["retail-promotions"],
    queryFn: () => fetchJson<{ data: Promotion[] }>("/api/v2/retail/promotions"),
  });

  const { reservedId: promoCode, isReserving, error: reserveError } = useReservedId({
    entity: "RETAIL_PROMOTION", enabled: dialogOpen && !editing,
  });

  // Memoised because `?? []` mints a fresh array on every render, which changes
  // the identity of every `useMemo` below that depends on it — they recompute each
  // render, and the React Compiler bails out of memoising them at all.
  const promotions = useMemo(() => promotionsQuery.data?.data ?? [], [promotionsQuery.data]);
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
        <Button size="sm" variant="outline" aria-label={`Edit ${row.original.name}`} onClick={() => { setEditing(row.original); setForm({
          name: row.original.name, type: row.original.type, value: String(row.original.value),
          startsAt: row.original.startsAt ? row.original.startsAt.slice(0, 16) : "",
          endsAt: row.original.endsAt ? row.original.endsAt.slice(0, 16) : "",
          status: row.original.status, notes: row.original.notes ?? "",
        }); setDialogOpen(true); }}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-label={`Remove ${row.original.name}`}
          onClick={() => setDeleteTarget(row.original)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    )},
  ], []);

  const newPromotionButton = (
    <Button
      size="sm"
      onClick={() => {
        setEditing(null);
        setForm(emptyForm());
        setDialogOpen(true);
      }}
    >
      <Plus className="h-4 w-4" />
      New promotion
    </Button>
  );

  const actions = (
    <div className="flex flex-wrap gap-2">
      {newPromotionButton}
      <Button asChild size="sm" variant="outline">
        <Link href="/retail/merchandising/pricing">
          <Wallet className="h-4 w-4" />
          Pricing
        </Link>
      </Button>
    </div>
  );

  if (promotionsQuery.isPending) {
    return (
      <RetailShell title="Promotions" actions={actions}>
        <div aria-busy="true" aria-live="polite" className="space-y-5">
          <span className="sr-only">Fetching promotions…</span>
          <div className="grid gap-5 xl:grid-cols-3">
            <Skeleton height={104} />
            <Skeleton height={104} />
            <Skeleton height={104} />
          </div>
          <Skeleton height={300} />
        </div>
      </RetailShell>
    );
  }

  if (promotionsQuery.isError) {
    return (
      <RetailShell title="Promotions" actions={actions}>
        <Alert tone="danger" title="Promotions would not load">
          {getApiErrorMessage(promotionsQuery.error)}
        </Alert>
      </RetailShell>
    );
  }

  const averageValue = promotions.length
    ? promotions.reduce((s, p) => s + p.value, 0) / promotions.length
    : 0;

  return (
    <RetailShell title="Promotions" actions={actions}>
      {promotions.length === 0 ? (
        <EmptyState
          title="No promotions set up"
          body="A promotion is a discount the till applies at checkout — a percentage off a line, a fixed amount off a basket, or a bundle."
          action={newPromotionButton}
        />
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-3">
            <StatCard
              label="Running now"
              value={activeCount.toString()}
              tone={activeCount > 0 ? "success" : "neutral"}
              footer="Applied by the till at checkout"
            />
            <StatCard
              label="All campaigns"
              value={promotions.length.toString()}
              footer={`${new Set(promotions.map((p) => p.type)).size} type${new Set(promotions.map((p) => p.type)).size === 1 ? "" : "s"} in use`}
            />
            <StatCard
              label="Average value"
              value={averageValue.toFixed(2)}
              footer="Percent or amount, as configured"
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
            <Card title="Promotion values" subtitle="The eight richest offers">
              <AdminDistributionChart
                rows={valueRows}
                valueLabel="Value"
                valueFormatter={(v) => v.toFixed(2)}
                height={280}
                emptyLabel="No promotion values to show."
              />
            </Card>
            <Card title="Status">
              <AdminDonutChart
                rows={statusRows}
                valueLabel="Count"
                valueFormatter={(v) => v.toString()}
                height={280}
                emptyLabel="No statuses to show."
              />
            </Card>
          </div>

          <Card title="Type distribution">
            <AdminDonutChart
              rows={typeRows}
              valueLabel="Count"
              valueFormatter={(v) => v.toString()}
              height={260}
              emptyLabel="No types to show."
            />
          </Card>

          <DataTable
            data={promotions}
            columns={columns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search promotions"
            emptyState="No promotions match that search."
          />
        </>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit promotion" : "New promotion"}</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }}>
            <div className="grid gap-4 md:grid-cols-2">
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
              <div className="space-y-2 md:col-span-2">
                <label className="block text-sm font-semibold">Value</label>
                <Input value={form.value} inputMode="decimal" onChange={(e) => setForm((c) => ({ ...c, value: e.target.value }))} />
                {form.value !== "" && (isNaN(Number(form.value)) || Number(form.value) <= 0) ? (
                  <p className="t-body-sm text-[color:var(--tone-danger-strong)]">
                    Value must be greater than 0
                  </p>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setAdvancedOpen((prev) => !prev)}
              className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
            >
              <ChevronDown className={`h-4 w-4 transition-transform${advancedOpen ? " rotate-180" : ""}`} />
              Advanced options
            </button>

            {advancedOpen ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold">Promo code</label>
                  <Input value={editing ? editing.promoCode : promoCode} readOnly disabled={isReserving && !editing} />
                  {reserveError && !editing ? (
                    <Alert tone="danger" title="Could not reserve a promo code">
                      {getApiErrorMessage(reserveError)}
                    </Alert>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold">Starts</label>
                  <Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm((c) => ({ ...c, startsAt: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold">Ends</label>
                  <Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm((c) => ({ ...c, endsAt: e.target.value }))} placeholder="No end date" />
                </div>
                {editing ? (
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
                ) : null}
                <div className="space-y-2 md:col-span-2">
                  <label className="block text-sm font-semibold">Notes</label>
                  <Textarea value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} rows={3} />
                </div>
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending || !form.name || !form.value || Number(form.value) <= 0}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {deleteTarget?.name ?? "promotion"}</DialogTitle>
          </DialogHeader>
          <p className="t-body t-muted">
            The till stops applying {deleteTarget?.promoCode ?? "this promotion"} at checkout. Sales
            already discounted by it keep their discount.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Remove {deleteTarget?.promoCode ?? ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RetailShell>
  );
}

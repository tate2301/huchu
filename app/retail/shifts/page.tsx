"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AdminDistributionChart,
  AdminDualBarChart,
  AdminDonutChart,
  AdminTrendChart,
} from "@/components/charts/admin-headless-charts";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { BarChart3, Payments, Plus, ReceiptLong } from "@/lib/icons";
import { useReservedId } from "@/hooks/use-reserved-id";

type Shift = {
  id: string;
  shiftNo: string;
  registerName: string;
  registerCode: string;
  siteId: string;
  cashierName: string;
  openingFloat: number;
  expectedCash: number;
  countedCash: number | null;
  variance: number | null;
  status: string;
  openedAt: string;
  closedAt: string | null;
  saleCount: number;
  salesValue: number;
  site: { id: string; name: string; code: string } | null;
};

type ShiftForm = {
  siteId: string;
  registerName: string;
  registerCode: string;
  openingFloat: string;
  notes: string;
};

function emptyForm(siteId = ""): ShiftForm {
  return {
    siteId,
    registerName: "",
    registerCode: "",
    openingFloat: "0",
    notes: "",
  };
}

export default function RetailShiftsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [closeTarget, setCloseTarget] = useState<Shift | null>(null);
  const [closeCash, setCloseCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const sitesQuery = useQuery({ queryKey: ["retail-shift-sites"], queryFn: fetchSites });
  const shiftsQuery = useQuery({
    queryKey: ["retail-shifts"],
    queryFn: () => fetchJson<{ data: Shift[] }>("/api/v2/retail/shifts"),
  });
  const [form, setForm] = useState<ShiftForm>(() => emptyForm(""));

  const {
    reservedId: shiftNo,
    isReserving,
    error: reserveError,
  } = useReservedId({
    entity: "RETAIL_SHIFT",
    enabled: openDialog && Boolean(form.siteId),
    siteId: form.siteId || undefined,
  });

  const siteOptions = useMemo<SearchableOption[]>(
    () => (sitesQuery.data ?? []).map((site) => ({ value: site.id, label: site.name, meta: site.code })),
    [sitesQuery.data],
  );

  const shiftRows = useMemo(
    () =>
      (shiftsQuery.data?.data ?? [])
        .slice()
        .sort((left, right) => new Date(left.openedAt).getTime() - new Date(right.openedAt).getTime())
        .map((shift) => ({
          id: shift.id,
          label: shift.shiftNo,
          primary: shift.salesValue,
          secondary: shift.expectedCash,
          opened: shift.salesValue,
          expected: shift.expectedCash,
          counted: shift.countedCash ?? 0,
          variance: Math.abs(shift.variance ?? 0),
        })),
    [shiftsQuery.data?.data],
  );

  const statusRows = useMemo(
    () => {
      const counts = new Map<string, number>();
      for (const shift of shiftsQuery.data?.data ?? []) {
        counts.set(shift.status, (counts.get(shift.status) ?? 0) + 1);
      }
      return Array.from(counts.entries()).map(([status, value]) => ({
        id: status,
        label: status,
        value,
        tone: status === "OPEN" ? ("success" as const) : ("default" as const),
      }));
    },
    [shiftsQuery.data?.data],
  );

  const trendRows = useMemo(
    () => {
      const buckets = new Map<string, { label: string; opened: number; variance: number; count: number }>();
      for (const shift of shiftsQuery.data?.data ?? []) {
        const openedAt = new Date(shift.openedAt);
        const key = openedAt.toISOString().slice(0, 10);
        const label = openedAt.toLocaleDateString([], { month: "short", day: "numeric" });
        const current = buckets.get(key) ?? { label, opened: 0, variance: 0, count: 0 };
        current.opened += shift.salesValue;
        current.variance += Math.abs(shift.variance ?? 0);
        current.count += 1;
        buckets.set(key, current);
      }
      return Array.from(buckets.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, value]) => ({ id, label: value.label, opened: value.opened, variance: value.variance, count: value.count }));
    },
    [shiftsQuery.data?.data],
  );

  const openMutation = useMutation({
    mutationFn: async (payload: ShiftForm) =>
      fetchJson("/api/v2/retail/shifts", {
        method: "POST",
        body: JSON.stringify({
          shiftNo: shiftNo || undefined,
          siteId: payload.siteId,
          registerName: payload.registerName,
          registerCode: payload.registerCode.trim() || undefined,
          openingFloat: Number(payload.openingFloat || 0),
          notes: payload.notes.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Shift opened", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["retail-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["retail-dashboard"] });
      setOpenDialog(false);
      setForm(emptyForm(sitesQuery.data?.[0]?.id ?? ""));
    },
    onError: (error) => {
      toast({
        title: "Unable to open shift",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (shift: Shift) =>
      fetchJson(`/api/v2/retail/shifts/${shift.id}/close`, {
        method: "POST",
        body: JSON.stringify({
          countedCash: Number(closeCash || 0),
          notes: closeNotes.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Shift closed", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["retail-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["retail-dashboard"] });
      setCloseTarget(null);
      setCloseCash("");
      setCloseNotes("");
    },
    onError: (error) => {
      toast({
        title: "Unable to close shift",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<Shift>[]>(
    () => [
      {
        id: "shiftNo",
        header: "Shift",
        cell: ({ row }) => (
          <div>
            <div className="font-mono font-semibold">{row.original.shiftNo}</div>
            <div className="text-xs text-[var(--text-muted)]">{row.original.site?.name ?? "No site"}</div>
          </div>
        ),
      },
      { id: "registerName", header: "Register", cell: ({ row }) => row.original.registerName },
      { id: "cashierName", header: "Cashier", cell: ({ row }) => row.original.cashierName },
      { id: "status", header: "Status", cell: ({ row }) => row.original.status },
      { id: "salesValue", header: "Sales", cell: ({ row }) => <NumericCell>{row.original.salesValue.toFixed(2)}</NumericCell> },
      { id: "expectedCash", header: "Expected cash", cell: ({ row }) => <NumericCell>{row.original.expectedCash.toFixed(2)}</NumericCell> },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          row.original.status === "OPEN" ? (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setCloseTarget(row.original)}>
                Close
              </Button>
            </div>
          ) : null,
      },
    ],
    [],
  );

  return (
    <RetailShell
      title="Shifts & Cash-up"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              setForm(emptyForm(sitesQuery.data?.[0]?.id ?? ""));
              setOpenDialog(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Open shift
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/portal/pos">
              <Payments className="h-4 w-4" />
              POS
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/sales">
              <ReceiptLong className="h-4 w-4" />
              Sales
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/reports">
              <BarChart3 className="h-4 w-4" />
              Reports
            </Link>
          </Button>
        </div>
      }
    >
      <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="mt-1 text-2xl font-semibold text-[var(--text-strong)]">Sales, expected cash, and variance by shift</h2>
          </div>
          <div className="rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 text-right">
            <p className="font-mono text-3xl font-semibold text-[var(--text-strong)]">
              {shiftsQuery.data?.data.filter((shift) => shift.status === "OPEN").length ?? 0}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
          <AdminTrendChart
            rows={trendRows}
            series={[
              { key: "opened", label: "Sales", kind: "area", tone: "success", fillOpacity: 0.12 },
              { key: "variance", label: "Variance", kind: "line", tone: "warning", dashed: true },
              { key: "count", label: "Shifts", kind: "line", tone: "default", hiddenByDefault: true },
            ]}
            height={300}
            valueFormatter={(value) => value.toFixed(2)}
            yTickFormatter={(value) => value.toFixed(0)}
            emptyLabel="Shift trend is loading"
          />
          <AdminDonutChart
            rows={statusRows}
            valueLabel="Shifts"
            valueFormatter={(value) => value.toString()}
            height={300}
            emptyLabel="Shift status is loading"
          />
        </div>
      </section>

      <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="mt-1 text-xl font-semibold text-[var(--text-strong)]">Sales versus expected cash on the busiest shifts</h3>
          </div>
          <div className="rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 text-right">
            <p className="font-mono text-2xl font-semibold text-[var(--text-strong)]">
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                shiftsQuery.data?.data.find((shift) => shift.status === "OPEN")?.variance ?? 0,
              )}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.75fr)]">
          <AdminDualBarChart
            rows={shiftRows.slice(0, 8)}
            primaryLabel="Sales"
            secondaryLabel="Expected"
            height={280}
            valueFormatter={(value) => value.toFixed(2)}
            emptyLabel="Shift cash data is loading"
          />
          <AdminDistributionChart
            rows={shiftRows.slice(0, 8).map((shift) => ({
              id: shift.id,
              label: shift.label,
              value: shift.variance,
              tone: shift.variance > 0 ? ("warning" as const) : ("success" as const),
            }))}
            valueLabel="Variance"
            valueFormatter={(value) => value.toFixed(2)}
            height={280}
            emptyLabel="Variance distribution is loading"
          />
        </div>
      </section>

      <DataTable
        data={shiftsQuery.data?.data ?? []}
        columns={columns}
        features={{ sorting: true, globalFilter: true, pagination: true }}
        pagination={{ enabled: true, server: false }}
        searchPlaceholder="Search shifts"
        emptyState={shiftsQuery.isLoading ? "Loading shifts..." : "No shifts yet"}

      />

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Open shift</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              openMutation.mutate(form);
            }}
          >
            <div className="space-y-2">
              <label className="block text-sm font-semibold">Shift number</label>
              <Input value={shiftNo} readOnly disabled={isReserving} />
            </div>
            <SearchableSelect
              label="Site"
              value={form.siteId}
              options={siteOptions}
              placeholder="Select site"
              onValueChange={(value) => setForm((current) => ({ ...current, siteId: value }))}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Register name</label>
                <Input value={form.registerName} onChange={(event) => setForm((current) => ({ ...current, registerName: event.target.value }))} placeholder="Front till" />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Register code</label>
                <Input value={form.registerCode} onChange={(event) => setForm((current) => ({ ...current, registerCode: event.target.value }))} placeholder="Auto-created when blank" />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Opening float</label>
                <Input value={form.openingFloat} inputMode="decimal" onChange={(event) => setForm((current) => ({ ...current, openingFloat: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold">Notes</label>
              <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={3} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={openMutation.isPending || !form.siteId || !form.registerName}>Open shift</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(closeTarget)} onOpenChange={(open) => !open && setCloseTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Close shift</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span>Expected cash</span>
                <span className="font-mono">{closeTarget?.expectedCash.toFixed(2)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold">Counted cash</label>
              <Input value={closeCash} inputMode="decimal" onChange={(event) => setCloseCash(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold">Notes</label>
              <Textarea value={closeNotes} onChange={(event) => setCloseNotes(event.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCloseTarget(null)}>Cancel</Button>
            <Button type="button" onClick={() => closeTarget && closeMutation.mutate(closeTarget)} disabled={closeMutation.isPending}>Close shift</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RetailShell>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import { RetailShell } from "@/components/retail/retail-shell";
import { FieldHelp } from "@/components/shared/field-help";
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
      <DataTable
        data={shiftsQuery.data?.data ?? []}
        columns={columns}
        features={{ sorting: true, globalFilter: true, pagination: true }}
        pagination={{ enabled: true, server: false }}
        searchPlaceholder="Search shifts"
        emptyState={shiftsQuery.isLoading ? "Loading shifts..." : "No shifts yet"}
        toolbar={<span className="text-xs text-[var(--text-muted)]">Shift register control</span>}
      />

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Open shift</DialogTitle>
            <DialogDescription>Bind a cashier to a till and start the day cleanly.</DialogDescription>
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
              <FieldHelp error={reserveError ?? undefined} hint={reserveError ? undefined : "Generated automatically."} />
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
            <DialogDescription>{closeTarget?.shiftNo}</DialogDescription>
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

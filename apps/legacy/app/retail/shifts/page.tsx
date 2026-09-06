"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  AdminDistributionChart,
  AdminDualBarChart,
  AdminDonutChart,
  AdminTrendChart,
} from "@/components/charts/admin-headless-charts";
import { Alert, Card, EmptyState, Skeleton, StatCard } from "@corelithzw/react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { SearchableOption } from "@/components/ui/searchable-select";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { BarChart3, ChevronDown, Grid3x3, Payments, Plus, ReceiptLong } from "@/lib/icons";
import { canAccessPosPortal } from "@/lib/retail/pos-host";
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
  registerId: string;
  openingFloat: string;
  notes: string;
};

type ShiftContextSite = {
  id: string;
  name: string;
  code: string;
  registers: Array<{
    id: string;
    name: string;
    code: string;
    siteId: string;
  }>;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function emptyForm(siteId = ""): ShiftForm {
  return {
    siteId,
    registerId: "",
    openingFloat: "0",
    notes: "",
  };
}

export default function RetailShiftsPage() {
  const { data: session } = useSession();
  const canOpenPos = canAccessPosPortal(session?.user?.role);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [closeTarget, setCloseTarget] = useState<Shift | null>(null);
  const [closeCash, setCloseCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const shiftContextQuery = useQuery({
    queryKey: ["retail-shift-context"],
    queryFn: () =>
      fetchJson<{
        data: {
          defaultSiteId: string | null;
          defaultRegisterId: string | null;
          sites: ShiftContextSite[];
        };
      }>("/api/v2/retail/shifts/context"),
  });
  const shiftsQuery = useQuery({
    queryKey: ["retail-shifts"],
    queryFn: () => fetchJson<{ data: Shift[] }>("/api/v2/retail/shifts"),
  });
  const [form, setForm] = useState<ShiftForm>(() => emptyForm(""));
  const shiftContext = shiftContextQuery.data?.data;
  const contextSites = useMemo(() => shiftContext?.sites ?? [], [shiftContext]);
  const defaultSiteId = shiftContext?.defaultSiteId ?? null;
  const defaultRegisterId = shiftContext?.defaultRegisterId ?? null;

  const siteOptions = useMemo<SearchableOption[]>(
    () => contextSites.map((site) => ({ value: site.id, label: site.name, meta: site.code })),
    [contextSites],
  );
  /**
   * The site and register in force are derived during render, not written into
   * `form` by an effect.
   *
   * `form.siteId` and `form.registerId` hold what the user picked; these hold what
   * the dialog is actually operating on, which is the pick when it is still valid
   * and the fallback chain otherwise. The two effects this replaces wrote that
   * chain into state a render late, so the dialog opened with an empty register
   * select and then filled it in.
   *
   * Deriving also fixes a case the effects could not: a `defaultSiteId` that is not
   * in `contextSites` used to be written into the form regardless, leaving a site
   * selected that has no registers and a dialog that cannot be submitted.
   */
  const effectiveSiteId =
    (form.siteId && contextSites.some((site) => site.id === form.siteId) ? form.siteId : "") ||
    (defaultSiteId && contextSites.some((site) => site.id === defaultSiteId)
      ? defaultSiteId
      : "") ||
    contextSites.find((site) => site.registers.length > 0)?.id ||
    contextSites[0]?.id ||
    "";

  const selectedSite = contextSites.find((site) => site.id === effectiveSiteId) ?? null;
  const siteRegisters = useMemo(() => selectedSite?.registers ?? [], [selectedSite]);

  const effectiveRegisterId =
    (form.registerId && siteRegisters.some((register) => register.id === form.registerId)
      ? form.registerId
      : "") ||
    (selectedSite?.id === defaultSiteId &&
    defaultRegisterId &&
    siteRegisters.some((register) => register.id === defaultRegisterId)
      ? defaultRegisterId
      : "") ||
    siteRegisters[0]?.id ||
    "";

  const registerOptions = useMemo<SearchableOption[]>(
    () =>
      siteRegisters.map((register) => ({
        value: register.id,
        label: register.name,
        meta: register.code,
      })),
    [siteRegisters],
  );

  // Below the derivations: it reads `effectiveSiteId`, a `const` computed above.
  const {
    reservedId: shiftNo,
    isReserving,
    error: reserveError,
  } = useReservedId({
    entity: "RETAIL_SHIFT",
    enabled: openDialog && Boolean(effectiveSiteId),
    siteId: effectiveSiteId || undefined,
  });

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
          registerId: payload.registerId,
          openingFloat: Number(payload.openingFloat || 0),
          notes: payload.notes.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Shift opened", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["retail-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["retail-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["retail-shift-context"] });
      setOpenDialog(false);
      setForm(emptyForm(contextSites[0]?.id ?? ""));
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
            <Link
              href={`/retail/shifts/${row.original.id}`}
              className="font-mono font-semibold underline-offset-2 hover:underline"
            >
              {row.original.shiftNo}
            </Link>
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

  const shifts = shiftsQuery.data?.data ?? [];
  const openShifts = shifts.filter((shift) => shift.status === "OPEN");
  const cashVariance = shifts.reduce((total, shift) => total + Math.abs(shift.variance ?? 0), 0);
  const takings = shifts.reduce((total, shift) => total + shift.salesValue, 0);

  const openShiftButton = (
    <Button
      size="sm"
      onClick={() => {
        setForm(emptyForm(""));
        setOpenDialog(true);
      }}
    >
      <Plus className="h-4 w-4" />
      Open shift
    </Button>
  );

  const actions = (
    <div className="flex flex-wrap gap-2">
      {openShiftButton}
      {canOpenPos ? (
        <Button asChild size="sm" variant="outline">
          <Link href="/portal/pos">
            <Payments className="h-4 w-4" />
            POS
          </Link>
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1">
            <Grid3x3 className="h-4 w-4" />
            <span className="hidden sm:inline">More</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href="/retail/sales" className="flex items-center gap-2">
              <ReceiptLong className="h-4 w-4" /> Sales
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/retail/reports" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Reports
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  if (shiftsQuery.isPending) {
    return (
      <RetailShell title="Shifts & Cash-up" actions={actions}>
        <div aria-busy="true" aria-live="polite" className="space-y-4">
          <span className="sr-only">Fetching shifts…</span>
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton height={104} />
            <Skeleton height={104} />
            <Skeleton height={104} />
          </div>
          <Skeleton height={340} />
          <Skeleton height={280} />
        </div>
      </RetailShell>
    );
  }

  if (shiftsQuery.isError) {
    return (
      <RetailShell title="Shifts & Cash-up" actions={actions}>
        <Alert tone="danger" title="Shifts would not load">
          {getApiErrorMessage(shiftsQuery.error)}
        </Alert>
      </RetailShell>
    );
  }

  return (
    <RetailShell title="Shifts & Cash-up" actions={actions}>
      {shifts.length === 0 ? (
        <EmptyState
          title="No shifts opened yet"
          body="Open a shift with a float and the till can start trading. Takings, expected cash and variance appear here at cash-up."
          action={openShiftButton}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Open shifts"
              value={String(openShifts.length)}
              tone={openShifts.length > 0 ? "success" : "neutral"}
              footer="Tills trading now"
            />
            <StatCard
              label="Takings"
              value={money(takings)}
              footer={`Across ${shifts.length} shift${shifts.length === 1 ? "" : "s"}`}
            />
            <StatCard
              label="Cash variance"
              value={money(cashVariance)}
              tone={cashVariance > 0 ? "warn" : "success"}
              footer="Counted against expected, absolute"
            />
          </div>

          <Card title="Sales, expected cash and variance by shift">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
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
                emptyLabel="No shift trend to show."
              />
              <AdminDonutChart
                rows={statusRows}
                valueLabel="Shifts"
                valueFormatter={(value) => value.toString()}
                height={300}
                emptyLabel="No shift statuses to show."
              />
            </div>
          </Card>

          <Card title="Sales against expected cash on the busiest shifts">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.75fr)]">
              <AdminDualBarChart
                rows={shiftRows.slice(0, 8)}
                primaryLabel="Sales"
                secondaryLabel="Expected"
                height={280}
                valueFormatter={(value) => value.toFixed(2)}
                emptyLabel="No shift cash data to show."
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
                emptyLabel="No variance to show."
              />
            </div>
          </Card>

          <DataTable
            data={shifts}
            columns={columns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search shifts"
            emptyState="No shifts match that search."
          />
        </>
      )}

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Open shift</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              // The effective ids, not the raw picks: an untouched form carries an
              // empty `siteId`, and it is the derived fallback that the selects
              // have been showing all along.
              openMutation.mutate({
                ...form,
                siteId: effectiveSiteId,
                registerId: effectiveRegisterId,
              });
            }}
          >
            <div className="space-y-2">
              <label className="block text-sm font-semibold">Shift number</label>
              <Input value={shiftNo} readOnly disabled={isReserving} />
              {reserveError ? (
                <Alert tone="danger" title="Could not reserve a shift number">
                  {getApiErrorMessage(reserveError)}
                </Alert>
              ) : null}
            </div>
            {/*
              A shop with one branch is not asked which branch. The site is still
              resolved and sent — it is simply not a question worth putting to a
              cashier who has exactly one answer.
            */}
            {siteOptions.length > 1 ? (
              <SearchableSelect
                label="Site"
                value={effectiveSiteId}
                options={siteOptions}
                placeholder="Select site"
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, siteId: value, registerId: "" }))
                }
              />
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <SearchableSelect
                  label="Register"
                  value={effectiveRegisterId}
                  options={registerOptions}
                  placeholder={
                    !effectiveSiteId
                      ? "Select site first"
                      : registerOptions.length > 0
                        ? "Select register"
                        : "No registers configured"
                  }
                  searchPlaceholder="Search registers"
                  onValueChange={(value) => setForm((current) => ({ ...current, registerId: value }))}
                  disabled={!effectiveSiteId || registerOptions.length === 0}
                />
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
              <Button type="submit" disabled={openMutation.isPending || !effectiveSiteId || !effectiveRegisterId}>Open shift</Button>
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
            <StatCard
              label="Expected cash"
              value={money(closeTarget?.expectedCash ?? 0)}
              footer={`${closeTarget?.shiftNo ?? ""} · ${closeTarget?.registerName ?? ""}`}
            />
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

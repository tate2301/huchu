"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button as DsButton, Skeleton } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  ColumnText,
  FormField,
  StatusDot,
} from "@/components/management/ui";
import { retailMoney } from "@/components/retail/sale-detail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { formatRetailDateTime, formatSignedMoney } from "@/lib/retail/words";
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

/** A register's measure: wide enough for its figures, not the whole window. */
const WIDTH = 960;

const EMPTY_FORM: ShiftForm = { siteId: "", registerId: "", openingFloat: "0", notes: "" };

function amount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** "Open" for a till still trading; "Short" or "Over" for a drawer that did not balance. */
function ShiftState({ shift }: { shift: Shift }) {
  if (shift.status === "OPEN") return <StatusDot tone="success" label="Open" />;
  if (shift.variance) return <StatusDot tone="warn" label={shift.variance < 0 ? "Short" : "Over"} />;
  return null;
}

const tillLine = (shift: Shift) =>
  [shift.registerName, shift.site?.name].filter(Boolean).join(" · ");

/**
 * Shifts — every drawer the tills have opened, and what it came to.
 *
 * Drawn as the products list is: the name in the app bar with its one verb,
 * search and the count in the toolbar, and a `ColumnList` under it — the shift
 * number, the cashier and the till, then when it ran, its takings and its
 * variance. A till still trading says Open and a drawer that did not balance
 * says Short or Over in its own row. Closing a shift is on its record.
 */
export default function RetailShiftsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [openDialog, setOpenDialog] = useState(false);
  const [openErrors, setOpenErrors] = useState<string[]>([]);
  const [form, setForm] = useState<ShiftForm>(EMPTY_FORM);

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

  const shiftContext = shiftContextQuery.data?.data;
  const contextSites = useMemo(() => shiftContext?.sites ?? [], [shiftContext]);
  const defaultSiteId = shiftContext?.defaultSiteId ?? null;
  const defaultRegisterId = shiftContext?.defaultRegisterId ?? null;

  /*
    The site and till in force are derived during render, not written into
    `form` by an effect: `form` holds what the person picked, these hold what
    the dialog is operating on — the pick while it is still valid, the shop's
    default otherwise. A default site that is not in `contextSites` is skipped
    rather than selected, so the dialog never sits on a site with no tills.
  */
  const effectiveSiteId =
    (form.siteId && contextSites.some((site) => site.id === form.siteId) ? form.siteId : "") ||
    (defaultSiteId && contextSites.some((site) => site.id === defaultSiteId) ? defaultSiteId : "") ||
    contextSites.find((site) => site.registers.length > 0)?.id ||
    contextSites[0]?.id ||
    "";

  const selectedSite = contextSites.find((site) => site.id === effectiveSiteId) ?? null;
  const siteTills = useMemo(() => selectedSite?.registers ?? [], [selectedSite]);

  const effectiveTillId =
    (form.registerId && siteTills.some((till) => till.id === form.registerId) ? form.registerId : "") ||
    (selectedSite?.id === defaultSiteId &&
    defaultRegisterId &&
    siteTills.some((till) => till.id === defaultRegisterId)
      ? defaultRegisterId
      : "") ||
    siteTills[0]?.id ||
    "";

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

  const shifts = useMemo(() => shiftsQuery.data?.data ?? [], [shiftsQuery.data]);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return shifts;
    return shifts.filter((shift) =>
      [shift.shiftNo, shift.registerName, shift.cashierName, shift.site?.name ?? ""].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [shifts, search]);

  const invalidateShifts = () => {
    void queryClient.invalidateQueries({ queryKey: ["retail-shifts"] });
    void queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
    void queryClient.invalidateQueries({ queryKey: ["retail-dashboard"] });
  };

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
      invalidateShifts();
      void queryClient.invalidateQueries({ queryKey: ["retail-shift-context"] });
      setOpenDialog(false);
      setForm(EMPTY_FORM);
    },
    onError: (error) => {
      toast({
        title: "That shift was not opened",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const startOpening = () => {
    setForm(EMPTY_FORM);
    setOpenErrors([]);
    setOpenDialog(true);
  };

  const narrowed = Boolean(search.trim());
  const empty = narrowed ? "No shift matches that search." : "No shifts yet.";

  return (
    <>
      <RecordListShell
        title="Shifts"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by shift, till or cashier"
        count={shiftsQuery.isSuccess ? `${rows.length} of ${shifts.length}` : null}
        createLabel="Open shift"
        onCreate={startOpening}
        error={shiftsQuery.error}
      >
        {shiftsQuery.isPending ? (
          <div className="space-y-1.5" aria-busy="true" style={{ maxWidth: WIDTH }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : (
          <div className="space-y-3">
            <ColumnList
              label="Shifts"
              maxWidth={WIDTH}
              empty={empty}
              columns={[
                { id: "shift", label: "Shift" },
                { id: "state", label: "Status", hideBelow: "sm" },
                { id: "opened", label: "Opened", hideBelow: "md" },
                { id: "closed", label: "Closed", hideBelow: "md" },
                { id: "takings", label: "Takings", align: "end" },
                { id: "variance", label: "Variance", align: "end", hideBelow: "sm" },
              ]}
              rows={rows.map((shift) => ({
                id: shift.id,
                cells: {
                  shift: (
                    <ColumnName
                      code={shift.shiftNo}
                      name={shift.cashierName}
                      meta={tillLine(shift)}
                      href={`/retail/shifts/${shift.id}`}
                    />
                  ),
                  state: <ShiftState shift={shift} />,
                  opened: <ColumnText>{formatRetailDateTime(shift.openedAt)}</ColumnText>,
                  closed: <ColumnText>{formatRetailDateTime(shift.closedAt) || "Still open"}</ColumnText>,
                  takings: <ColumnFigure>{retailMoney(shift.salesValue)}</ColumnFigure>,
                  variance: (
                    <ColumnFigure tone={shift.variance === null ? "muted" : shift.variance ? "warn" : "default"}>
                      {shift.variance === null ? "Not counted" : formatSignedMoney(shift.variance)}
                    </ColumnFigure>
                  ),
                },
              }))}
            />
            {rows.length === 0 && !narrowed ? (
              <DsButton variant="primary" size="sm" onClick={startOpening}>
                Open shift
              </DsButton>
            ) : null}
          </div>
        )}
      </RecordListShell>

      <RecordDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        title="Open shift"
        size="sm"
        errors={[...(reserveError ? [`The shift number was not reserved: ${reserveError}`] : []), ...openErrors]}
        onSubmit={(event) => {
          event.preventDefault();
          const problems: string[] = [];
          if (!effectiveSiteId) problems.push("Choose a site.");
          else if (siteTills.length === 0) problems.push(`${selectedSite?.name ?? "That site"} has no tills yet.`);
          else if (!effectiveTillId) problems.push("Choose a till.");
          const float = amount(form.openingFloat);
          if (form.openingFloat.trim() && (float === null || float < 0))
            problems.push("The opening float is an amount of zero or more.");
          setOpenErrors(problems);
          // The effective ids, not the raw picks: an untouched form carries an
          // empty `siteId`, and the derived default is what the selects show.
          if (problems.length === 0)
            openMutation.mutate({ ...form, siteId: effectiveSiteId, registerId: effectiveTillId });
        }}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setOpenDialog(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={openMutation.isPending || isReserving}>
              Open shift
            </Button>
          </>
        }
      >
        <FormField label="Shift">
          {(id) => <Input id={id} value={shiftNo} readOnly className="font-mono" />}
        </FormField>
        {/* A shop with one site is not asked which site; it is still sent. */}
        {contextSites.length > 1 ? (
          <FormField label="Site">
            {(id) => (
              <Select
                value={effectiveSiteId}
                onValueChange={(value) => setForm((current) => ({ ...current, siteId: value, registerId: "" }))}
              >
                <SelectTrigger id={id}>
                  <SelectValue placeholder="Choose a site" />
                </SelectTrigger>
                <SelectContent>
                  {contextSites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Till">
            {(id) => (
              <Select
                value={effectiveTillId}
                onValueChange={(value) => setForm((current) => ({ ...current, registerId: value }))}
                disabled={siteTills.length === 0}
              >
                <SelectTrigger id={id}>
                  <SelectValue placeholder="Choose a till" />
                </SelectTrigger>
                <SelectContent>
                  {siteTills.map((till) => (
                    <SelectItem key={till.id} value={till.id}>
                      {till.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label="Opening float">
            {(id) => (
              <Input
                id={id}
                value={form.openingFloat}
                inputMode="decimal"
                className="font-mono"
                onChange={(event) => setForm((current) => ({ ...current, openingFloat: event.target.value }))}
              />
            )}
          </FormField>
        </div>
        <FormField label="Notes">
          {(id) => (
            <Textarea
              id={id}
              value={form.notes}
              rows={3}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          )}
        </FormField>
      </RecordDialog>

    </>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { FactList, FormField, StatusDot } from "@/components/management/ui";
import { RecordList } from "@/components/records/record-list";
import { RecordCell, RecordTable, RecordTableName } from "@/components/records/record-table";
import { RowMenu } from "@/components/retail/row-menu";
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
 * search and the count in the toolbar, and the records under it. The tiles and
 * the four charts that sat over the table are gone (D3); a drawer that did not
 * balance says Short or Over in its own row. Closing a shift is the row's verb,
 * behind its menu.
 */
export default function RetailShiftsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [openDialog, setOpenDialog] = useState(false);
  const [openErrors, setOpenErrors] = useState<string[]>([]);
  const [closeTarget, setCloseTarget] = useState<Shift | null>(null);
  const [closeCash, setCloseCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeErrors, setCloseErrors] = useState<string[]>([]);
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
      invalidateShifts();
      setCloseTarget(null);
      setCloseCash("");
      setCloseNotes("");
    },
    onError: (error) => {
      toast({
        title: "That shift was not closed",
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

  const startClosing = (shift: Shift) => {
    setCloseCash("");
    setCloseNotes("");
    setCloseErrors([]);
    setCloseTarget(shift);
  };

  const emptyTitle = search.trim() ? "No shifts match that search" : "No shifts yet";

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
        <RecordTable
          rows={rows}
          isLoading={shiftsQuery.isPending}
          emptyTitle={emptyTitle}
          rowHref={(shift) => `/retail/shifts/${shift.id}`}
          columns={[
            {
              id: "shift",
              label: "Shift",
              cell: (shift) => <RecordTableName title={shift.shiftNo} subtitle={tillLine(shift)} />,
            },
            {
              id: "state",
              label: "Status",
              width: "7rem",
              cell: (shift) => <ShiftState shift={shift} />,
            },
            {
              id: "cashier",
              label: "Cashier",
              cell: (shift) => <RecordCell value={shift.cashierName} />,
            },
            {
              id: "opened",
              label: "Opened",
              width: "11rem",
              cell: (shift) => <RecordCell kind="date" value={formatRetailDateTime(shift.openedAt)} />,
            },
            {
              id: "closed",
              label: "Closed",
              width: "11rem",
              cell: (shift) => <RecordCell kind="date" value={formatRetailDateTime(shift.closedAt)} />,
            },
            {
              id: "takings",
              label: "Takings",
              align: "end",
              width: "8rem",
              cell: (shift) => <RecordCell kind="money" value={retailMoney(shift.salesValue)} />,
            },
            {
              id: "variance",
              label: "Variance",
              align: "end",
              width: "8rem",
              cell: (shift) => (
                <RecordCell
                  kind="money"
                  value={shift.variance === null ? "—" : formatSignedMoney(shift.variance)}
                />
              ),
            },
            {
              id: "menu",
              label: "",
              width: "3rem",
              align: "end",
              cell: (shift) =>
                shift.status === "OPEN" ? (
                  <RowMenu
                    label={`More for ${shift.shiftNo}`}
                    items={[{ label: "Close shift", onSelect: () => startClosing(shift) }]}
                  />
                ) : null,
            },
          ]}
          mobile={
            <RecordList
              rows={rows.map((shift) => ({
                id: shift.id,
                href: `/retail/shifts/${shift.id}`,
                title: shift.shiftNo,
                subtitle: tillLine(shift),
                status: <ShiftState shift={shift} />,
                facts: [
                  { label: "Takings", value: retailMoney(shift.salesValue), kind: "money", primary: true },
                  ...(shift.variance
                    ? [{ label: "Variance", value: formatSignedMoney(shift.variance), kind: "money" as const }]
                    : []),
                ],
              }))}
              isLoading={shiftsQuery.isPending}
              emptyTitle={emptyTitle}
            />
          }
        />
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

      <RecordDialog
        open={Boolean(closeTarget)}
        onOpenChange={(open) => !open && setCloseTarget(null)}
        title={closeTarget ? `Close ${closeTarget.shiftNo}` : "Close shift"}
        size="sm"
        errors={closeErrors}
        onSubmit={(event) => {
          event.preventDefault();
          const counted = amount(closeCash);
          const problems = counted === null || counted < 0 ? ["Give the cash counted in the drawer."] : [];
          setCloseErrors(problems);
          if (problems.length === 0 && closeTarget) closeMutation.mutate(closeTarget);
        }}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setCloseTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={closeMutation.isPending}>
              Close shift
            </Button>
          </>
        }
      >
        {closeTarget ? (
          <FactList
            maxWidth={null}
            items={[
              { label: "Till", value: closeTarget.registerName },
              { label: "Expected cash", value: retailMoney(closeTarget.expectedCash), mono: true },
            ]}
          />
        ) : null}
        <FormField label="Counted cash">
          {(id) => (
            <Input
              id={id}
              value={closeCash}
              inputMode="decimal"
              className="font-mono"
              autoFocus
              onChange={(event) => setCloseCash(event.target.value)}
            />
          )}
        </FormField>
        <FormField label="Notes">
          {(id) => (
            <Textarea id={id} value={closeNotes} rows={3} onChange={(event) => setCloseNotes(event.target.value)} />
          )}
        </FormField>
      </RecordDialog>
    </>
  );
}

"use client";

/**
 * The cost tracker: the day's money, and every line behind it.
 *
 * One subject — lines of money in somebody's hands — asked about two ways.
 * The top of the page is the day: what it has come to, and closing it, which
 * is what sends the day's report to management. Under it is every line,
 * narrowed from the toolbar: a rep's own, or the whole team's for somebody
 * who may see everybody's money.
 *
 * The page shows state and the dialogs change it. A line is added from the
 * app bar — "New entry", on whichever day is on screen — and the day is
 * closed from a dialog that carries its note, because the note is part of
 * the report that goes.
 *
 * The register's filters live in the URL, so "Tendai's spend with no receipt
 * this month" is a link somebody can send.
 */

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Button, Skeleton } from "@corelithzw/react";
import { FactList, SectionHeading, StatusBadge, StatusDot } from "@/components/management/ui";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { RecordListPager } from "@/components/records/record-list";
import { FILTER_ANY, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useDebounced } from "@/hooks/use-debounced";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

import { CostEntryFormDialog } from "./cost-entry-form-dialog";
import { CostEntryTable } from "./cost-entry-table";
import { formatDay, formatMoney, todayKey, type CostEntryRow } from "./money";

/** The day's measure. */
const DAY_WIDTH = 560;

type DayResponse = {
  log: { id: string; logDate: string; notes: string | null; submittedAt: string | null };
  totals: {
    received: string;
    spent: string;
    balance: string;
    entryCount: number;
    missingReceipts: number;
  };
};

export function CostTrackerContent() {
  const queryClient = useQueryClient();
  // The day being written up. It can be moved back, because the day being
  // written up is not always today; never forward, because a log for Friday
  // written on Wednesday is a guess.
  const [day, setDay] = useState(todayKey);
  const [adding, setAdding] = useState(false);

  const dayQuery = useQuery({
    queryKey: ["crm", "daily-log", day],
    queryFn: () => fetchJson<DayResponse>(`/api/v2/crm/daily-logs?date=${day}`),
  });
  const closed = Boolean(dayQuery.data?.log.submittedAt);

  // A line lands on the day and in the register alike.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["crm", "daily-log"] });
    void queryClient.invalidateQueries({ queryKey: ["crm", "cost-entries"] });
  };

  return (
    <div className="space-y-8">
      <TheDay day={day} onDayChange={setDay} dayQuery={dayQuery} onChanged={refresh} />
      {/* A closed day takes no more lines, so the verb is not offered on it. */}
      <Register onAdd={dayQuery.data && !closed ? () => setAdding(true) : undefined} />
      <CostEntryFormDialog
        open={adding}
        onOpenChange={setAdding}
        title={day === todayKey() ? "New entry" : `New entry for ${formatDay(day)}`}
        day={day}
        onSaved={refresh}
      />
    </div>
  );
}

/**
 * The day on screen: what it has come to, and whether it has gone.
 *
 * The figure somebody counts the cash in their pocket against leads, then
 * what it is made of, then what is still wrong with the day and the verb that
 * ends it.
 */
function TheDay({
  day,
  onDayChange,
  dayQuery,
  onChanged,
}: {
  day: string;
  onDayChange: (day: string) => void;
  dayQuery: { data?: DayResponse; error: unknown };
  onChanged: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const log = dayQuery.data?.log;
  const totals = dayQuery.data?.totals;
  const closed = Boolean(log?.submittedAt);
  const today = todayKey();
  // An empty day can still be closed, with a note saying why nothing moved —
  // the dialog asks for the note when it is.
  const sentAt = log?.submittedAt
    ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(log.submittedAt))
    : null;

  return (
    <section aria-labelledby="cost-tracker-day" style={{ maxWidth: DAY_WIDTH }}>
      {/* The day is the section, so the control that picks it sits on the
          section's heading, where a section's own control goes. */}
      <SectionHeading
        maxWidth={DAY_WIDTH}
        className="mt-0"
        action={
          <Input
            id="cost-tracker-date"
            aria-label="Day"
            type="date"
            className="h-8 w-auto font-mono"
            value={day}
            max={today}
            onChange={(event) => {
              if (event.target.value) onDayChange(event.target.value);
            }}
          />
        }
      >
        <span id="cost-tracker-day">{day === today ? "Today" : formatDay(day)}</span>
        {closed ? <StatusBadge tone="neutral">Closed</StatusBadge> : null}
      </SectionHeading>

      {dayQuery.error ? (
        <Alert tone="danger" title="The day would not load" className="mb-4">
          {getApiErrorMessage(dayQuery.error)}
        </Alert>
      ) : null}

      {totals && log ? (
        <>
          <p className="text-sm text-[var(--text-muted)]">In hand</p>
          <p className="mb-2 font-mono text-[28px] font-semibold leading-tight tracking-[-0.01em] tabular-nums text-[var(--text-strong)]">
            {formatMoney(totals.balance)}
          </p>
          <FactList
            align="end"
            maxWidth={DAY_WIDTH}
            labelWidth={140}
            items={[
              { label: "Received", value: formatMoney(totals.received), mono: true },
              { label: "Spent", value: formatMoney(totals.spent), mono: true },
              ...(log.notes ? [{ label: "Note", value: log.notes }] : []),
              ...(closed ? [{ label: "Sent to management", value: sentAt ?? "Yes", mono: Boolean(sentAt) }] : []),
            ]}
          />

          {closed ? null : (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
              {/* Closing is offered on any open day, empty or not: an empty
                  day is closed with a note saying why nothing moved. */}
              <Button variant="secondary" onClick={() => setClosing(true)}>
                Close the day
              </Button>
              {totals.missingReceipts > 0 ? (
                <StatusDot
                  tone="warn"
                  label={
                    totals.missingReceipts === 1
                      ? "1 expense without a receipt"
                      : `${totals.missingReceipts} expenses without a receipt`
                  }
                />
              ) : null}
            </div>
          )}

          <CloseDayDialog
            open={closing}
            onOpenChange={setClosing}
            day={day}
            log={log}
            totals={totals}
            onClosed={onChanged}
          />
        </>
      ) : dayQuery.error ? null : (
        <Skeleton height={160} />
      )}
    </section>
  );
}

/**
 * Closing the day, with the note that goes with it.
 *
 * Closing is what sends the report, and it cannot be taken back, so it asks
 * once and says so. The note travels with the report — "no money moved, the
 * site was shut" — and an empty day cannot close without one.
 */
function CloseDayDialog({
  open,
  onOpenChange,
  day,
  log,
  totals,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: string;
  log: DayResponse["log"];
  totals: DayResponse["totals"];
  onClosed: () => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState(log.notes ?? "");
  const [errors, setErrors] = useState<string[]>([]);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setNote(log.notes ?? "");
      setErrors([]);
    }
  }

  const close = useMutation({
    mutationFn: async () => {
      const trimmed = note.trim();
      if (trimmed !== (log.notes ?? "")) {
        await fetchJson("/api/v2/crm/daily-logs", {
          method: "PATCH",
          body: JSON.stringify({ logDate: day, notes: trimmed }),
        });
      }
      return fetchJson(`/api/v2/crm/daily-logs/${log.id}/submit`, { method: "POST" });
    },
    onSuccess: () => {
      toast({ title: "Day closed", description: "The report has gone to management." });
      onOpenChange(false);
      onClosed();
    },
    onError: (error) => {
      setErrors([getApiErrorMessage(error)]);
      // The note may have been saved before the close failed.
      onClosed();
    },
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={day === todayKey() ? "Close today" : `Close ${formatDay(day)}`}
      description="Closing sends the day's report to management. The day cannot be changed afterwards."
      size="md"
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        if (totals.entryCount === 0 && !note.trim()) {
          setErrors(["Nothing was logged on this day. Say why in the note."]);
          return;
        }
        setErrors([]);
        close.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={close.isPending}>
            {close.isPending ? "Closing…" : "Close and send"}
          </Button>
        </>
      }
    >
      <FactList
        align="end"
        labelWidth={140}
        maxWidth={null}
        items={[
          { label: "In hand", value: formatMoney(totals.balance), mono: true },
          {
            label: "Lines",
            value: String(totals.entryCount),
            mono: true,
          },
          ...(totals.missingReceipts > 0
            ? [
                {
                  label: "Without a receipt",
                  value: String(totals.missingReceipts),
                  mono: true,
                  tone: "warn" as const,
                },
              ]
            : []),
        ]}
      />
      <div className="space-y-1.5">
        <Label htmlFor="close-day-note">Note</Label>
        <Textarea
          id="close-day-note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
    </RecordDialog>
  );
}

type RegisterResponse = {
  data: CostEntryRow[];
  pagination?: { total: number };
  mayViewAll: boolean;
};

const PAGE_SIZE = 50;

/** The query keys the register reads from the URL and hands to the API as they are. */
const FILTER_KEYS = ["q", "from", "to", "person", "project", "requisition", "type", "flag"] as const;

const TYPE_OPTIONS = new Map([
  ["SPENT", "Expense"],
  ["RECEIVED", "Income"],
]);

// The two things a manager scans this register for.
const FLAG_OPTIONS = new Map([
  ["no-receipt", "No receipt photo"],
  ["not-receipted", "Not receipted"],
]);

/**
 * A chip's options, with whatever the URL already names kept in them — a
 * link to a requisition beyond the first hundred must still say the list is
 * narrowed to it, rather than claim it is showing everything.
 */
function withCurrent(options: Map<string, string>, value: string, label: string) {
  if (value === FILTER_ANY || options.has(value)) return options;
  return new Map([...options, [value, label]]);
}

/**
 * Every line, narrowed from the toolbar. Its verb — a new line on the day on
 * screen — sits in the app bar with the page's name.
 */
function Register({ onAdd }: { onAdd?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: session } = useSession();
  const me = session?.user?.id;

  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const debouncedSearch = useDebounced(search.trim(), 300);

  // Every change is a new URL. Narrowing starts the list again at page one,
  // because narrowing changes what page one is.
  const setParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === FILTER_ANY) next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in changes)) next.delete("page");
    const rendered = next.toString();
    router.replace(rendered ? `${pathname}?${rendered}` : pathname, { scroll: false });
  };

  const urlSearch = searchParams.get("q") ?? "";
  useEffect(() => {
    if (debouncedSearch === urlSearch) return;
    const next = new URLSearchParams(searchParams.toString());
    if (debouncedSearch) next.set("q", debouncedSearch);
    else next.delete("q");
    next.delete("page");
    const rendered = next.toString();
    router.replace(rendered ? `${pathname}?${rendered}` : pathname, { scroll: false });
  }, [debouncedSearch, pathname, router, searchParams, urlSearch]);

  const chosen = (key: (typeof FILTER_KEYS)[number]) => searchParams.get(key) ?? FILTER_ANY;
  const person = chosen("person");
  const project = chosen("project");
  const requisition = chosen("requisition");
  const type = chosen("type");
  const flag = chosen("flag");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const apiQuery = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    for (const key of FILTER_KEYS) {
      const current = searchParams.get(key);
      if (current) params.set(key, current);
    }
    return params.toString();
  }, [page, searchParams]);

  const listQuery = useQuery({
    queryKey: ["crm", "cost-entries", apiQuery],
    queryFn: () => fetchJson<RegisterResponse>(`/api/v2/crm/cost-entries?${apiQuery}`),
    placeholderData: (previous) => previous,
  });
  const mayViewAll = listQuery.data?.mayViewAll ?? false;

  const projectsQuery = useQuery({
    queryKey: ["crm", "projects", "cost-tracker-filter"],
    queryFn: () =>
      fetchJson<{ data: Array<{ id: string; name: string }> }>("/api/v2/crm/projects?costs=false&limit=100"),
    staleTime: 5 * 60_000,
  });

  const requisitionsQuery = useQuery({
    queryKey: ["crm", "requisitions", "cost-tracker-filter", mayViewAll],
    queryFn: () =>
      fetchJson<{ data: Array<{ id: string; requisitionNo: string; purpose: string }> }>(
        `/api/v2/crm/requisitions?queue=${mayViewAll ? "ALL" : "MINE"}&limit=100`,
      ),
    enabled: listQuery.isSuccess,
    staleTime: 5 * 60_000,
  });

  const teamQuery = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () =>
      fetchJson<{ data: Array<{ id: string; name: string | null }> }>("/api/v2/crm/team"),
    staleTime: 5 * 60_000,
    enabled: mayViewAll,
  });

  const removeLine = useMutation({
    mutationFn: (entryId: string) =>
      fetchJson(`/api/v2/crm/cost-entries?id=${entryId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["crm", "cost-entries"] });
      void queryClient.invalidateQueries({ queryKey: ["crm", "daily-log"] });
    },
    onError: (error) =>
      toast({
        title: "That line was not removed",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const projectOptions = useMemo(
    () =>
      withCurrent(
        new Map([
          // Fuel and airtime are spent with no project behind them, and
          // finding those is a question in its own right.
          ["none", "Not for a project"],
          ...(projectsQuery.data?.data ?? []).map((option): [string, string] => [option.id, option.name]),
        ]),
        project,
        "This project",
      ),
    [project, projectsQuery.data],
  );

  const requisitionOptions = useMemo(
    () =>
      withCurrent(
        new Map([
          ["none", "Not from a requisition"],
          ...(requisitionsQuery.data?.data ?? []).map((option): [string, string] => [
            option.id,
            `${option.requisitionNo} · ${option.purpose}`,
          ]),
        ]),
        requisition,
        "This requisition",
      ),
    [requisition, requisitionsQuery.data],
  );

  const personOptions = useMemo(() => {
    const others = (teamQuery.data?.data ?? []).filter((member) => member.id !== me);
    return withCurrent(
      new Map([
        ...(me ? [[me, "Me"] as [string, string]] : []),
        ...others.map((member): [string, string] => [member.id, member.name ?? "Unnamed"]),
      ]),
      person,
      "This person",
    );
  }, [me, person, teamQuery.data]);

  const rows = listQuery.data?.data ?? [];
  const total = listQuery.data?.pagination?.total ?? rows.length;
  // Whose line it is only needs saying when the list can hold somebody else's.
  const showPerson = mayViewAll && person !== me;

  const filterCount =
    [person, project, requisition, type, flag].filter((current) => current !== FILTER_ANY).length +
    (from || to ? 1 : 0);
  const filtered = filterCount > 0;

  const empty = urlSearch
    ? "No lines match that search."
    : filtered
      ? "No lines match these filters."
      : "No money logged yet.";

  return (
    <RecordListShell
      title="Cost tracker"
      createLabel={onAdd ? "New entry" : undefined}
      onCreate={onAdd}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search by what it was"
      searchNoun="lines"
      error={listQuery.error}
      count={`${rows.length} of ${total}`}
      filterCount={filterCount}
      filters={
        <>
          <DateRangeFilter
            label="Day"
            value={{ from, to }}
            max={todayKey()}
            onChange={(next) => setParams({ from: next.from, to: next.to })}
          />
          {mayViewAll ? (
            <ViewToolbarFilter
              label="Person"
              value={person}
              anyLabel="Everyone"
              options={personOptions}
              onChange={(next) => setParams({ person: next })}
            />
          ) : null}
          <ViewToolbarFilter
            label="Project"
            value={project}
            anyLabel="Any"
            options={projectOptions}
            onChange={(next) => setParams({ project: next })}
          />
          <ViewToolbarFilter
            label="Requisition"
            value={requisition}
            anyLabel="Any"
            options={requisitionOptions}
            onChange={(next) => setParams({ requisition: next })}
          />
          <ViewToolbarFilter
            label="Type"
            value={type}
            anyLabel="Both"
            options={TYPE_OPTIONS}
            onChange={(next) => setParams({ type: next })}
          />
          <ViewToolbarFilter
            label="Show"
            value={flag}
            anyLabel="All"
            options={FLAG_OPTIONS}
            onChange={(next) => setParams({ flag: next })}
          />
        </>
      }
    >
      <CostEntryTable
        entries={rows}
        isLoading={listQuery.isLoading}
        layout="register"
        label="Cost tracker"
        showPerson={showPerson}
        empty={empty}
        emptyAction={
          filtered || urlSearch ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearch("");
                router.replace(pathname, { scroll: false });
              }}
            >
              Clear the filters
            </Button>
          ) : undefined
        }
        onRemove={(entry) => removeLine.mutate(entry.id)}
        // Only your own line, on a day still open, off a requisition not yet
        // accounted for. The server refuses the rest regardless.
        removable={(entry) =>
          entry.log?.user.id === me &&
          !entry.log?.submittedAt &&
          entry.requisition?.status !== "ACQUITTED"
        }
      />

      <RecordListPager
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={(next) => setParams({ page: String(next) })}
      />
    </RecordListShell>
  );
}

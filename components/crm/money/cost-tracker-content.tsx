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

import { Button } from "@corelithzw/react";
import { FactList, StatusBadge } from "@/components/management/ui";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { RecordListPager } from "@/components/records/record-list";
import { FILTER_ANY, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { COMMON_PRESETS, DateRangePicker, DayRangeChip } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useDebounced } from "@/hooks/use-debounced";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

import { CostEntryFormDialog } from "./cost-entry-form-dialog";
import { CostEntryTable } from "./cost-entry-table";
import { formatDay, formatMoney, todayKey, type CostEntryRow } from "./money";

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
  const [closing, setClosing] = useState(false);

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
    <>
      <Register
        day={day}
        onDayChange={setDay}
        dayQuery={dayQuery}
        onCloseDay={() => setClosing(true)}
        onAdd={dayQuery.data && !closed ? () => setAdding(true) : undefined}
      />
      {dayQuery.data ? (
        <CloseDayDialog
          open={closing}
          onOpenChange={setClosing}
          day={day}
          log={dayQuery.data.log}
          totals={dayQuery.data.totals}
          onClosed={refresh}
        />
      ) : null}
      <CostEntryFormDialog
        open={adding}
        onOpenChange={setAdding}
        title={day === todayKey() ? "New entry" : `New entry for ${formatDay(day)}`}
        day={day}
        onSaved={refresh}
      />
    </>
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
function Register({
  day,
  onDayChange,
  dayQuery,
  onCloseDay,
  onAdd,
}: {
  day: string;
  onDayChange: (day: string) => void;
  dayQuery: { data?: DayResponse; error: unknown };
  onCloseDay: () => void;
  onAdd?: () => void;
}) {
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

  const log = dayQuery.data?.log;
  const totals = dayQuery.data?.totals;
  const closed = Boolean(log?.submittedAt);
  const today = todayKey();
  const sentAt = log?.submittedAt
    ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(
        new Date(log.submittedAt),
      )
    : null;

  const activeTab =
    flag === "no-receipt"
      ? "NO_RECEIPT"
      : flag === "not-receipted"
        ? "NOT_RECEIPTED"
        : type === "SPENT"
          ? "SPENT"
          : type === "RECEIVED"
            ? "RECEIVED"
            : "ALL";

  const handleTabChange = (nextTab: string) => {
    if (nextTab === "ALL") {
      setParams({ type: null, flag: null });
    } else if (nextTab === "SPENT") {
      setParams({ type: "SPENT", flag: null });
    } else if (nextTab === "RECEIVED") {
      setParams({ type: "RECEIVED", flag: null });
    } else if (nextTab === "NO_RECEIPT") {
      setParams({ type: null, flag: "no-receipt" });
    } else if (nextTab === "NOT_RECEIPTED") {
      setParams({ type: null, flag: "not-receipted" });
    }
  };

  const finding =
    totals && log
      ? {
          tone: (totals.missingReceipts > 0 ? "warn" : closed ? "ok" : "info") as
            | "warn"
            | "ok"
            | "info",
          children: (
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-2">
                <b>{day === today ? "Today" : formatDay(day)}</b>
                <Input
                  id="cost-tracker-date"
                  aria-label="Day"
                  type="date"
                  className="h-7 w-auto font-mono text-sm"
                  value={day}
                  max={today}
                  onChange={(event) => {
                    if (event.target.value) onDayChange(event.target.value);
                  }}
                />
                {closed ? <StatusBadge tone="neutral">Closed {sentAt ? `at ${sentAt}` : ""}</StatusBadge> : null}
              </span>
              <span className="font-mono text-sm text-[var(--color-muted)]">
                In hand: <b>{formatMoney(totals.balance)}</b> · Received:{" "}
                <b>{formatMoney(totals.received)}</b> · Spent: <b>{formatMoney(totals.spent)}</b>
              </span>
              {totals.missingReceipts > 0 ? (
                <span className="text-sm font-semibold">
                  · {totals.missingReceipts}{" "}
                  {totals.missingReceipts === 1
                    ? "expense without a receipt"
                    : "expenses without a receipt"}
                </span>
              ) : null}
            </span>
          ),
          action: !closed
            ? {
                label: "Close the day →",
                onClick: onCloseDay,
              }
            : undefined,
        }
      : null;

  return (
    <RecordListShell
      title="Cost tracker"
      finding={finding}
      tabs={[
        { value: "ALL", label: "All lines", count: activeTab === "ALL" ? total : undefined },
        { value: "SPENT", label: "Expenses", count: activeTab === "SPENT" ? total : undefined },
        { value: "RECEIVED", label: "Income", count: activeTab === "RECEIVED" ? total : undefined },
        {
          value: "NO_RECEIPT",
          label: "No receipt photo",
          count: activeTab === "NO_RECEIPT" ? total : undefined,
        },
        {
          value: "NOT_RECEIPTED",
          label: "Not receipted",
          count: activeTab === "NOT_RECEIPTED" ? total : undefined,
        },
      ]}
      activeTab={activeTab}
      onTabChange={handleTabChange}
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
          <DateRangePicker
            openEnded
            presets={COMMON_PRESETS}
            title="Day"
            value={{ from, to }}
            latest={todayKey()}
            onChange={(next) => setParams({ from: next.from, to: next.to })}
            trigger={<DayRangeChip label="Day" range={{ from, to }} />}
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

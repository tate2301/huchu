"use client";

/**
 * The cost tracker: writing up the day's money, and reading it back.
 *
 * One subject — lines of money in somebody's hands — asked about two ways.
 * The top of the page is the day being written up: a form to add a line, what
 * the day has come to so far, and closing it, which is what sends the day's
 * report to management. Under it is every line, narrowed from the toolbar: a
 * rep's own, or the whole team's for somebody who may see everybody's money.
 *
 * Built for somebody standing at a fuel pump on a phone, which decides the
 * form: on the page rather than in a modal, and one press to add a line.
 *
 * The register's filters live in the URL, so "Tendai's spend with no receipt
 * this month" is a link somebody can send.
 */

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Button, Skeleton } from "@corelithzw/react";
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

import { CostEntryForm } from "./cost-entry-form";
import { CostEntryTable } from "./cost-entry-table";
import { formatDay, formatMoney, todayKey, type CostEntryRow } from "./money";

export function CostTrackerContent() {
  return (
    <div className="space-y-8">
      <TheDay />
      <Register />
    </div>
  );
}

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

/**
 * The day being written up.
 *
 * The day can be moved back, because the day being written up is not always
 * today. It cannot be moved forward: a log for Friday written on Wednesday is
 * a guess, and a guess in the cost figures is worse than a gap.
 */
function TheDay() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [day, setDay] = useState(todayKey);

  const dayQuery = useQuery({
    queryKey: ["crm", "daily-log", day],
    queryFn: () => fetchJson<DayResponse>(`/api/v2/crm/daily-logs?date=${day}`),
  });

  // A line lands on the day and in the register alike.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["crm", "daily-log"] });
    void queryClient.invalidateQueries({ queryKey: ["crm", "cost-entries"] });
  };

  const saveNote = useMutation({
    mutationFn: (notes: string) =>
      fetchJson("/api/v2/crm/daily-logs", {
        method: "PATCH",
        body: JSON.stringify({ logDate: day, notes }),
      }),
    onSuccess: refresh,
    onError: (error) =>
      toast({
        title: "The note was not saved",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const close = useMutation({
    mutationFn: (logId: string) =>
      fetchJson(`/api/v2/crm/daily-logs/${logId}/submit`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Day closed", description: "Your report has gone to management." });
      refresh();
    },
    onError: (error) =>
      toast({
        title: "The day was not closed",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const log = dayQuery.data?.log;
  const totals = dayQuery.data?.totals;
  const closed = Boolean(log?.submittedAt);
  const today = todayKey();
  // An empty day can still be closed, with a note saying why nothing moved —
  // the server's rule, so the button is only offered once it would work.
  const closable = Boolean(log && totals && (totals.entryCount > 0 || log.notes));

  return (
    <section aria-labelledby="cost-tracker-day" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="cost-tracker-day" className="text-lg font-semibold text-[var(--text-strong)]">
            {day === today ? "Today" : formatDay(day)}
          </h2>
          {/* What the day has come to so far: the figure somebody counts the
              cash in their pocket against. */}
          {totals ? (
            <p className="text-sm text-[var(--text-muted)]">
              In hand{" "}
              <span className="font-mono font-semibold text-[var(--text-strong)]">
                {formatMoney(totals.balance)}
              </span>
              {" · "}received <span className="font-mono">{formatMoney(totals.received)}</span>
              {" · "}spent <span className="font-mono">{formatMoney(totals.spent)}</span>
            </p>
          ) : (
            <Skeleton height={20} width={280} />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="cost-tracker-date" className="text-sm text-[var(--text-muted)]">
            Day
          </Label>
          <Input
            id="cost-tracker-date"
            type="date"
            className="w-auto font-mono"
            value={day}
            max={today}
            onChange={(event) => {
              if (event.target.value) setDay(event.target.value);
            }}
          />
        </div>
      </div>

      {dayQuery.error ? (
        <Alert tone="danger" title="The day would not load">
          {getApiErrorMessage(dayQuery.error)}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,42rem)_minmax(16rem,22rem)]">
        <div>
          {closed ? (
            <Alert tone="info" title="This day is closed">
              Its report has gone to management, so nothing more can be added to it.
            </Alert>
          ) : (
            // Keyed on the day so a half-typed line does not follow the person
            // to a different day.
            <CostEntryForm key={day} day={day} primary onSaved={refresh} />
          )}
        </div>

        <aside aria-label="Closing the day" className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cost-tracker-note">Anything worth saying about the day</Label>
            <Textarea
              // Remounted per day and per log, so the note shown is the one
              // for the day on screen rather than the last day typed on.
              key={`${day}-${log?.id ?? "loading"}`}
              id="cost-tracker-note"
              rows={3}
              defaultValue={log?.notes ?? ""}
              disabled={closed || !log}
              onBlur={(event) => {
                if (event.target.value !== (log?.notes ?? "")) saveNote.mutate(event.target.value);
              }}
            />
          </div>

          {closed || !totals ? null : (
            <>
              {totals.missingReceipts > 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  {totals.missingReceipts === 1
                    ? "One expense has no receipt photo. Management will see that."
                    : `${totals.missingReceipts} expenses have no receipt photo. Management will see that.`}
                </p>
              ) : null}
              {closable && log ? (
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={close.isPending}
                  onClick={() => close.mutate(log.id)}
                >
                  {close.isPending ? "Closing…" : "Close the day and send my report"}
                </Button>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  To close the day, add a line — or a note saying why no money moved.
                </p>
              )}
            </>
          )}
        </aside>
      </div>
    </section>
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

/** Every line, narrowed from the toolbar. */
function Register() {
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
    ? { title: "No lines match that search", body: "Nothing described that way in this range." }
    : filtered
      ? { title: "No lines match these filters", body: "Widen the dates, or take a filter off." }
      : {
          title: "No money logged yet",
          body: "Add what you receive and spend above, as you go — each with a photo of its receipt.",
        };

  return (
    <RecordListShell
      title="Cost tracker"
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
        showPerson={showPerson}
        emptyTitle={empty.title}
        emptyBody={empty.body}
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

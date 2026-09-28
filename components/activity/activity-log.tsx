"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { format, isToday, isYesterday, startOfYear, subDays } from "date-fns";

import { activityToneFor, HeaderAction } from "@/components/management/ui";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounced } from "@/hooks/use-debounced";
import {
  fetchActivityPage,
  fetchActivityPeople,
  type ActivityLogEntry,
  type ActivityLogFilters,
} from "@/lib/activity/api";
import {
  ACTIVITY_MODULES,
  describeAction,
  humanizeField,
  humanizeModel,
  type ActivityAction,
  type ActivityChange,
} from "@/lib/activity/describe";
import { getApiErrorMessage } from "@/lib/api-client";
import { ChevronRight, Download } from "@/lib/icons";

import styles from "./activity-log.module.css";

/** Radix needs a value for "nothing chosen"; `""` reads as unanswered. */
const ANY = "any";

const PERIODS = [
  { value: "all", label: "Any time" },
  { value: "1", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "year", label: "This year" },
] as const;

type Period = (typeof PERIODS)[number]["value"];

const ACTIONS: { value: ActivityAction; label: string }[] = [
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "deleted", label: "Deleted" },
];

const MODULE_OPTIONS = Object.entries(ACTIVITY_MODULES).sort((a, b) => a[1].localeCompare(b[1]));

function periodStart(period: Period): string | undefined {
  const now = new Date();
  if (period === "all") return undefined;
  if (period === "year") return startOfYear(now).toISOString();
  const start = subDays(now, Number(period) - 1);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

/* ---------------------------------------------------------------------- *
 * Filters, kept in the URL so a filtered log can be linked and survives a
 * reload. One object, one writer.
 * ---------------------------------------------------------------------- */

function useLogFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const person = params.get("person") ?? ANY;
  const moduleKey = params.get("module") ?? ANY;
  const action = params.get("action") ?? ANY;
  const period = (PERIODS.find((option) => option.value === params.get("period"))?.value ??
    "all") as Period;
  const search = params.get("q") ?? "";

  const set = React.useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (!value || value === ANY || (key === "period" && value === "all")) next.delete(key);
      else next.set(key, value);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const clear = React.useCallback(() => router.replace(pathname, { scroll: false }), [
    pathname,
    router,
  ]);

  const active = person !== ANY || moduleKey !== ANY || action !== ANY || period !== "all" || !!search;

  return { person, module: moduleKey, action, period, search, set, clear, active };
}

/** The URL's filters as `GET /api/activity` takes them. */
function useServerFilters(filters: ReturnType<typeof useLogFilters>): ActivityLogFilters {
  // Period bounds are computed once per choice, not once per render — "now"
  // moving under a cached query key would refetch on every render.
  const from = React.useMemo(() => periodStart(filters.period), [filters.period]);
  return {
    actorId: filters.person === ANY ? undefined : filters.person,
    module: filters.module === ANY ? undefined : filters.module,
    action: filters.action === ANY ? undefined : (filters.action as ActivityAction),
    from,
    q: filters.search || undefined,
  };
}

/**
 * The log's one verb, for the title line it sits under: downloads exactly
 * what the filters show, from the server, past the pages already loaded.
 */
export function ActivityExportAction() {
  const query = useServerFilters(useLogFilters());

  const exportHref = () => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value);
    }
    return `/api/activity/export?${params.toString()}`;
  };

  return (
    <HeaderAction icon={Download} onClick={() => window.location.assign(exportHref())}>
      Export
    </HeaderAction>
  );
}

/* ---------------------------------------------------------------------- *
 * The log
 * ---------------------------------------------------------------------- */

/**
 * The workspace's activity log: who changed what, newest first.
 *
 * Every mutating request the API serves is recorded against the person who
 * made it (`lib/activity`), and this reads them back a page at a time. The
 * next page loads as the foot of the list scrolls into view; the button in the
 * foot does the same for anybody not scrolling — a keyboard, a screen reader,
 * a list short enough that the foot is already on screen.
 *
 * Filters go to the server, not over what happens to be loaded: "everything
 * Tendai deleted this year" has to be answered from the whole log.
 *
 * Used by Settings → Activity and by Reports → Audit trails; both are the same
 * log, and neither owns it.
 */
export function ActivityLog() {
  const filters = useLogFilters();
  const [searchDraft, setSearchDraft] = React.useState(filters.search);
  const debouncedSearch = useDebounced(searchDraft.trim(), 300);

  // The URL follows the box, 300ms behind it — and only when the box moved.
  // Comparing against the URL instead would let a stale debounced value write
  // itself back straight after "Clear" emptied both.
  const setFilter = filters.set;
  const lastPushed = React.useRef(debouncedSearch);
  React.useEffect(() => {
    if (lastPushed.current === debouncedSearch) return;
    lastPushed.current = debouncedSearch;
    setFilter("q", debouncedSearch);
  }, [debouncedSearch, setFilter]);

  const query = useServerFilters(filters);

  const peopleQuery = useQuery({
    queryKey: ["activity", "people"],
    queryFn: fetchActivityPeople,
    staleTime: 5 * 60_000,
  });

  const log = useInfiniteQuery({
    queryKey: ["activity", "log", query],
    queryFn: ({ pageParam }) => fetchActivityPage(query, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const entries = React.useMemo(
    () => log.data?.pages.flatMap((page) => page.entries) ?? [],
    [log.data],
  );

  return (
    <>
      <div className={styles.filters}>
        <Input
          type="search"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Search records"
          aria-label="Search activity"
          className={`h-9 ${styles.search}`}
        />
        <FilterSelect
          label="Person"
          value={filters.person}
          onChange={(value) => filters.set("person", value)}
          anyLabel="Anyone"
          options={(peopleQuery.data?.people ?? []).map((person) => ({
            value: person.id,
            label: person.name,
          }))}
        />
        <FilterSelect
          label="Module"
          value={filters.module}
          onChange={(value) => filters.set("module", value)}
          anyLabel="Any module"
          options={MODULE_OPTIONS.map(([value, label]) => ({ value, label }))}
        />
        <FilterSelect
          label="Change"
          value={filters.action}
          onChange={(value) => filters.set("action", value)}
          anyLabel="Any change"
          options={ACTIONS}
        />
        <FilterSelect
          label="Period"
          value={filters.period}
          onChange={(value) => filters.set("period", value)}
          options={PERIODS.map((option) => ({ value: option.value, label: option.label }))}
        />
        {filters.active ? (
          <button
            type="button"
            className={styles.clear}
            onClick={() => {
              setSearchDraft("");
              filters.clear();
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      {log.isLoading ? (
        <LogSkeleton />
      ) : log.isError && entries.length === 0 ? (
        <p className={styles.empty} role="alert">
          {getApiErrorMessage(log.error)}{" "}
          <button type="button" className={styles.clear} onClick={() => void log.refetch()}>
            Try again
          </button>
        </p>
      ) : entries.length === 0 ? (
        <p className={styles.empty}>
          {filters.active ? "Nothing matches these filters." : "No activity recorded yet."}
        </p>
      ) : (
        <>
          <LogRows entries={entries} />
          <LogFoot
            count={entries.length}
            hasMore={log.hasNextPage}
            loading={log.isFetchingNextPage}
            failed={log.isError}
            onMore={() => void log.fetchNextPage()}
          />
        </>
      )}
    </>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  anyLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  anyLabel?: string;
}) {
  return (
    <span className={styles.filter}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9" aria-label={label}>
          <SelectValue placeholder={anyLabel} />
        </SelectTrigger>
        <SelectContent>
          {anyLabel ? <SelectItem value={ANY}>{anyLabel}</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </span>
  );
}

/* ---------------------------------------------------------------------- *
 * Rows, by day
 * ---------------------------------------------------------------------- */

function LogRows({ entries }: { entries: ActivityLogEntry[] }) {
  const days = React.useMemo(() => groupByDay(entries), [entries]);
  const [open, setOpen] = React.useState<ReadonlySet<string>>(() => new Set());

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ol className={styles.list}>
      {days.map((day) => (
        <React.Fragment key={day.key}>
          <li className={styles.day}>
            <span className={styles.dayGutter} aria-hidden="true" />
            <h2 className={styles.dayLabel}>{day.label}</h2>
            <span className={styles.count}>
              {day.entries.length} {day.entries.length === 1 ? "change" : "changes"}
            </span>
          </li>
          {day.entries.map((entry) => (
            <LogRow
              key={entry.id}
              entry={entry}
              open={open.has(entry.id)}
              onToggle={() => toggle(entry.id)}
            />
          ))}
        </React.Fragment>
      ))}
    </ol>
  );
}

function LogRow({
  entry,
  open,
  onToggle,
}: {
  entry: ActivityLogEntry;
  open: boolean;
  onToggle: () => void;
}) {
  const tone = activityToneFor(entry.eventType);
  const expandable = entry.changes.length > 0 || !!entry.reason;
  const panelId = `activity-${entry.id}`;

  const top = (
    <>
      <span className={styles.what}>
        {entry.summary}
        {entry.recordLabel ? (
          <>
            {" "}
            <span className={styles.record}>{entry.recordLabel}</span>
          </>
        ) : null}
      </span>
      <span className={styles.spacer} />
      {expandable ? (
        <ChevronRight className={styles.caret} data-open={open} aria-hidden="true" />
      ) : null}
      <time dateTime={entry.createdAt} className={styles.time}>
        {format(new Date(entry.createdAt), "HH:mm")}
      </time>
    </>
  );

  return (
    <li className={styles.row}>
      <span className={styles.gutter}>
        <span className={styles.avatar} data-tone={tone} aria-hidden="true">
          {initialsOf(entry.actor?.name ?? null)}
        </span>
        <span className={styles.line} />
      </span>

      <span className={styles.body}>
        {expandable ? (
          <button
            type="button"
            className={styles.top}
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
          >
            {top}
          </button>
        ) : (
          <span className={styles.top}>{top}</span>
        )}

        <span className={styles.meta}>
          <span>{entry.actor?.name ?? "System"}</span>
          {entry.moduleLabel ? <span>{entry.moduleLabel}</span> : null}
          <span className={styles.chip} data-tone={tone}>
            {entry.eventType}
          </span>
        </span>

        {expandable && open ? <ChangeDetails id={panelId} entry={entry} /> : null}
      </span>
    </li>
  );
}

/** What the request changed, record by record, with the values it wrote. */
function ChangeDetails({ id, entry }: { id: string; entry: ActivityLogEntry }) {
  return (
    <span id={id} className="block">
      {entry.changes.length > 0 ? (
        <ul className={styles.details}>
          {entry.changes.map((change, index) => (
            <li key={`${change.model}-${change.recordId ?? index}`} className={styles.change}>
              <span className={styles.changeHead}>{describeChangeHead(change)}</span>
              {change.fields && change.fields.length > 0 ? (
                <dl className={styles.fields}>
                  {change.fields.map((field) => (
                    <React.Fragment key={field.name}>
                      <dt className={styles.fieldName}>{humanizeField(field.name)}</dt>
                      <dd
                        className={styles.fieldValue}
                        data-hidden={field.value === undefined ? "true" : undefined}
                      >
                        {field.value ?? "Changed"}
                      </dd>
                    </React.Fragment>
                  ))}
                </dl>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {entry.more > 0 ? (
        <p className={styles.note}>
          And {entry.more} more {entry.more === 1 ? "change" : "changes"} in the same request.
        </p>
      ) : null}
      {entry.reason ? <p className={styles.note}>Reason: {entry.reason}</p> : null}
    </span>
  );
}

function describeChangeHead(change: ActivityChange): string {
  const verb = describeAction(change.action);
  const noun = humanizeModel(change.model).toLowerCase();
  if (change.count) return `${verb} ${change.count} × ${noun}`;
  return change.label ? `${verb} ${noun} · ${change.label}` : `${verb} ${noun}`;
}

/* ---------------------------------------------------------------------- *
 * The foot: loads the next page when it scrolls into view
 * ---------------------------------------------------------------------- */

function LogFoot({
  count,
  hasMore,
  loading,
  failed,
  onMore,
}: {
  count: number;
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  onMore: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const onMoreRef = React.useRef(onMore);
  React.useEffect(() => {
    onMoreRef.current = onMore;
  });

  // A failed page stops the automatic load — retrying on every scroll tick
  // would hammer a server that has just said no. The button retries.
  const auto = hasMore && !loading && !failed;
  React.useEffect(() => {
    const node = ref.current;
    if (!node || !auto) return;
    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting)) onMoreRef.current();
      },
      // Start fetching a screen before the foot arrives, so the wait is hidden.
      { rootMargin: "0px 0px 600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [auto]);

  return (
    <div ref={ref} className={styles.foot} aria-live="polite">
      {hasMore ? (
        <button type="button" className={styles.more} onClick={onMore} disabled={loading}>
          {loading ? "Loading…" : failed ? "Try again" : "Load more"}
        </button>
      ) : null}
      <span className={styles.spacer} />
      <span>{hasMore ? `${count} shown` : `${count} ${count === 1 ? "change" : "changes"}, all shown`}</span>
    </div>
  );
}

function LogSkeleton() {
  return (
    <div className={styles.list} aria-busy="true" aria-label="Loading activity">
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className={styles.skeletonRow}>
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 * Helpers
 * ---------------------------------------------------------------------- */

type LogDay = { key: string; label: string; entries: ActivityLogEntry[] };

/** Entries arrive newest first; the days are built in that order, never re-sorted. */
function groupByDay(entries: ActivityLogEntry[]): LogDay[] {
  const days: LogDay[] = [];
  for (const entry of entries) {
    const date = new Date(entry.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = format(date, "yyyy-MM-dd");
    const last = days[days.length - 1];
    if (last?.key === key) {
      last.entries.push(entry);
      continue;
    }
    days.push({ key, label: dayLabel(date), entries: [entry] });
  }
  return days;
}

function dayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  if (date.getFullYear() === new Date().getFullYear()) return format(date, "d MMMM");
  return format(date, "d MMMM yyyy");
}

function initialsOf(name: string | null): string {
  if (!name) return "·";
  const parts = name
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "·";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

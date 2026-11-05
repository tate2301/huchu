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

import { Alert, Button } from "@corelithzw/react";
import { PageChrome } from "@/components/layout/page-chrome";
import { ListSearch } from "@/components/crm/records/list-search";
import { CrmFinding } from "@/components/crm/crm-finding";
import { FactList, StatusDot } from "@/components/management/ui";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { RecordListPager } from "@/components/records/record-list";
import { FILTER_ANY } from "@/components/records/view-toolbar";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useDebounced } from "@/hooks/use-debounced";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  ci_alert_circle,
  ci_apps,
  ci_download,
  ci_money_in,
  ci_money_out,
  ci_receipt,
} from "@/components/books/icons/glyphs";
import { CiGlyphIcon } from "@/components/books/icons/glyph-icon";
import { downloadCsv } from "@/components/books/bk-list";

import { CostEntryFormDialog } from "./cost-entry-form-dialog";
import { CostEntryTable } from "./cost-entry-table";
import { CATEGORY_LABELS, formatDay, formatMoney, todayKey, type Category, type CostEntryRow } from "./money";

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

  const handleExportCsv = () => {
    const head = [
      "Date",
      "Direction",
      "Category",
      "Description",
      "Amount",
      "Currency",
      "Project",
      "Requisition No",
      "Has Receipt",
    ];
    const data = rows.map((r) => [
      r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "",
      r.direction,
      CATEGORY_LABELS[r.category as Category] ?? r.category,
      r.description,
      r.amount,
      r.currency,
      r.project?.name ?? "",
      r.requisition?.requisitionNo ?? "",
      r.receiptUrl ? "Yes" : "No",
    ]);
    downloadCsv("cost-entries.csv", head, data);
  };

  return (
    <div className="crm-bk-worksheet">
      <PageChrome
        title="Cost tracker"
        primary={
          onAdd
            ? {
                label: "New entry",
                icon: "plus",
                shortcut: "N",
                onClick: onAdd,
              }
            : undefined
        }
      />

      {/* The Day Bar: Date switcher + Cash in Hand / Totals + Day status */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] bg-[var(--color-ground)] px-5 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-[var(--color-ink-1)]">
              {day === today ? "Today" : formatDay(day)}
            </span>
            <input
              id="cost-tracker-date"
              aria-label="Day"
              type="date"
              className="h-8 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] px-2 font-mono text-sm text-[var(--color-ink-1)]"
              value={day}
              max={today}
              onChange={(event) => {
                if (event.target.value) onDayChange(event.target.value);
              }}
            />
          </div>

          {closed ? (
            <StatusDot tone="success" label={`Closed ${sentAt ? `at ${sentAt}` : ""}`} />
          ) : (
            <StatusDot tone="neutral" label="Open" />
          )}

          {totals ? (
            <div className="flex items-center gap-3 font-mono text-sm tabular-nums text-[var(--color-ink-2)]">
              <span>
                In hand: <strong className="text-[var(--color-ink-1)]">{formatMoney(totals.balance)}</strong>
              </span>
              <span className="text-[var(--color-ink-4)]">·</span>
              <span>
                Received: <strong className="text-[var(--color-ink-1)]">{formatMoney(totals.received)}</strong>
              </span>
              <span className="text-[var(--color-ink-4)]">·</span>
              <span>
                Spent: <strong className="text-[var(--color-ink-1)]">{formatMoney(totals.spent)}</strong>
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {!closed ? (
            <Button variant="secondary" size="sm" onClick={onCloseDay}>
              Close the day
            </Button>
          ) : null}
        </div>
      </div>

      {totals && totals.missingReceipts > 0 ? (
        <CrmFinding
          label="Missing receipts"
          tone="warn"
          fact={`${totals.missingReceipts} expense${totals.missingReceipts === 1 ? "" : "s"} without a receipt photo`}
          rest="— attach receipt photos to clear this log."
          action={
            activeTab !== "NO_RECEIPT"
              ? {
                  label: "Show missing receipts →",
                  onClick: () => handleTabChange("NO_RECEIPT"),
                }
              : undefined
          }
        />
      ) : null}

      <div className="crm-bk-tabs-bar" role="tablist" aria-label="Cost entries">
        <div className="crm-bk-tabs">
          {[
            { value: "ALL", label: "All lines", glyph: ci_apps },
            { value: "SPENT", label: "Expenses", glyph: ci_money_out },
            { value: "RECEIVED", label: "Income", glyph: ci_money_in },
            { value: "NO_RECEIPT", label: "No receipt photo", glyph: ci_alert_circle },
            { value: "NOT_RECEIPTED", label: "Not receipted", glyph: ci_receipt },
          ].map(({ value, label, glyph }) => {
            const active = activeTab === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                data-active={active || undefined}
                onClick={() => handleTabChange(value)}
                className="crm-bk-tab"
              >
                <CiGlyphIcon glyph={glyph} size={16} className="shrink-0" />
                <span>{label}</span>
                {active ? <span className="n">{total}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="crm-bk-tools">
        <ListSearch
          value={search}
          onChange={setSearch}
          narrow
          placeholder="Search by description…"
        />

        {mayViewAll ? (
          <select
            value={person}
            onChange={(e) => setParams({ person: e.target.value })}
            className="h-8 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-ink-1)]"
            aria-label="Filter by person"
          >
            <option value={FILTER_ANY}>Everyone</option>
            {Array.from(personOptions.entries()).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        ) : null}

        <select
          value={project}
          onChange={(e) => setParams({ project: e.target.value })}
          className="h-8 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-ink-1)]"
          aria-label="Filter by project"
        >
          <option value={FILTER_ANY}>All projects</option>
          {Array.from(projectOptions.entries()).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={requisition}
          onChange={(e) => setParams({ requisition: e.target.value })}
          className="h-8 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-ink-1)]"
          aria-label="Filter by requisition"
        >
          <option value={FILTER_ANY}>All requisitions</option>
          {Array.from(requisitionOptions.entries()).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-sm tabular-nums text-[var(--color-ink-3)]">
            {rows.length} of {total} lines
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            className="h-7 text-sm font-medium"
          >
            <CiGlyphIcon glyph={ci_download} size={14} className="mr-1.5 shrink-0" />
            Export
          </Button>
        </div>
      </div>

      {listQuery.error ? (
        <div className="px-6 py-3">
          <Alert tone="danger" title="Couldn't load cost entries">
            {getApiErrorMessage(listQuery.error)}
          </Alert>
        </div>
      ) : null}

      <CostEntryTable
        entries={rows}
        isLoading={listQuery.isLoading}
        layout="register"
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
              Clear filters
            </Button>
          ) : undefined
        }
        onRemove={(entry) => removeLine.mutate(entry.id)}
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
    </div>
  );
}

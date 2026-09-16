"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, MobileList } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { RecordCell } from "@/components/records/record-table";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import { activeFilterCount, FilterSelect } from "@/components/schools/common/filter-select";
import { PopulationTabs } from "@/components/schools/records/population-tabs";
import { CreateButton } from "@/components/schools/common/record-actions";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { DataTable } from "@/components/ui/data-table";
import { Certificate, Printer } from "@/lib/icons";
import {
  EXAM_LEVEL_LABELS,
  SERIES_STATUS_LABELS,
  fetchSeries,
  fetchSeriesIndex,
  type ExamLevel,
  type SeriesRow,
} from "@/lib/schools/exams-v2";
import { formatSchoolDate, formatSchoolMoney } from "@/lib/schools/format";
import { NewSeriesDialog } from "@/components/schools/exams/new-series-dialog";

/**
 * Exam series — the index.
 *
 * Rudo Makoni at 07:40 on the last Monday in August, seven days before ZIMSEC
 * entries close. She is not browsing. She opens this page to find out whether
 * anything will stop the November entry going in, and she wants that answered
 * above the fold, before she has chosen a series.
 *
 * So the deadline leads: the first band chip, then the page's one alert, then a
 * table of the dates that follow it — dates, days and consequences rather than
 * a paragraph each. A missed ZIMSEC deadline costs a pupil a year; there is no
 * appeal and no late door after the late door.
 *
 * Cambridge sits in the same table as ZIMSEC — not a tab, not a second screen —
 * because the school runs both and the deadline that matters is whichever is
 * nearest.
 */

type Segment = "all" | "open" | "results";

/**
 * `Days away`, drawn as a track with a figure on it.
 *
 * A 60-day horizon, because a deadline three months out is not a thing anybody
 * acts on and a bar that showed it as nearly empty would make seven days look
 * the same as seventy. Red at a week or less, amber at three, brand beyond.
 */
function DaysAway({ days }: { days: number | null }) {
  if (days == null) return <span className="text-sm text-[color:var(--text-faint)]">—</span>;
  const pct = Math.min(100, Math.max(4, Math.round((days / 60) * 100)));
  const tone =
    days <= 7
      ? "bg-[color:var(--tone-danger)]"
      : days <= 21
        ? "bg-[color:var(--tone-warn)]"
        : "bg-[color:var(--brand)]";
  const ink =
    days <= 7
      ? "text-[color:var(--tone-danger)]"
      : days <= 21
        ? "text-[color:var(--tone-warn)]"
        : "text-[color:var(--brand)]";
  return (
    <span className="flex items-center gap-2">
      <span
        className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--surface-muted)]"
        aria-hidden="true"
      >
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={`w-[62px] shrink-0 text-right font-mono text-[11.5px] font-bold ${ink}`}>
        {days < 0 ? "passed" : `${days} days`}
      </span>
    </span>
  );
}

export function ExamSeriesContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [segment, setSegment] = useState<Segment>("all");
  const [boardFilter, setBoardFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const indexQuery = useQuery({
    queryKey: ["schools", "exams", "series", segment, boardFilter, levelFilter, search],
    queryFn: () =>
      fetchSeriesIndex({
        status: segment,
        boardId: boardFilter || undefined,
        level: (levelFilter as ExamLevel) || undefined,
        search: search.trim() || undefined,
      }),
  });

  const rows = useMemo(() => indexQuery.data?.rows ?? [], [indexQuery.data]);
  // Not a chip any more, but still the spine of the page: the alert and the
  // deadline table below both hang off whichever series closes soonest.
  const nearest = indexQuery.data?.chips?.nearestDeadline ?? null;

  // The series the alert and the deadline table are about: the one whose entries
  // close soonest.
  const leadSeriesQuery = useQuery({
    queryKey: ["schools", "exams", "series", nearest?.seriesId],
    queryFn: () => fetchSeries(nearest!.seriesId),
    enabled: Boolean(nearest?.seriesId),
  });
  const lead = leadSeriesQuery.data;

  const boards = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) seen.set(row.board.id, row.board.name);
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [rows]);

  const columns = useMemo<ColumnDef<SeriesRow>[]>(
    () => [
      {
        id: "series",
        header: "Series",
        cell: ({ row }) => {
          const open = row.original.status === "ENTRIES_OPEN" || row.original.status === "PLANNED";
          return (
            <span className="flex items-center gap-2">
              <Certificate
                className={`size-4 ${open ? "text-[color:var(--brand-strong)]" : "text-[color:var(--text-faint)]"}`}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-semibold">
                  {row.original.board.name} {row.original.name}
                </span>
                <span className="block truncate font-mono text-[10.5px] text-[color:var(--text-muted)]">
                  {row.original.centre ? `Centre ${row.original.centre.number}` : "No centre number"}
                </span>
              </span>
            </span>
          );
        },
      },
      {
        id: "level",
        header: "Level",
        cell: ({ row }) => <RecordCell value={EXAM_LEVEL_LABELS[row.original.level]} />,
      },
      {
        id: "entriesClose",
        header: "Entries close",
        cell: ({ row }) => {
          const days = row.original.entriesCloseAt
            ? Math.ceil(
                (new Date(row.original.entriesCloseAt).getTime() - Date.now()) /
                  (24 * 60 * 60 * 1000),
              )
            : null;
          const urgent = days != null && days >= 0 && days <= 7;
          return (
            <span
              className={`font-mono text-xs ${urgent ? "font-bold text-[color:var(--status-error-text)]" : "text-[color:var(--text-muted)]"}`}
            >
              {formatSchoolDate(row.original.entriesCloseAt)}
            </span>
          );
        },
      },
      {
        id: "candidates",
        header: "Candidates",
        cell: ({ row }) => (
          <span className="block text-right font-mono text-xs">{row.original.candidates}</span>
        ),
      },
      {
        id: "entries",
        header: "Entries",
        cell: ({ row }) => (
          <span className="block text-right font-mono text-xs">{row.original.entries}</span>
        ),
      },
      {
        id: "invoiced",
        header: "Invoiced",
        cell: ({ row }) => (
          <span className="block text-right font-mono text-xs">
            {formatSchoolMoney(row.original.invoiced)}
          </span>
        ),
      },
      {
        id: "collected",
        header: "Collected",
        // The only conditional colour in the table, and it is what tells a
        // bursar which series still owes the board money.
        cell: ({ row }) => (
          <span
            className={`block text-right font-mono text-xs ${
              row.original.settled
                ? "text-[color:var(--tone-success)]"
                : "text-[color:var(--tone-warn)]"
            }`}
          >
            {formatSchoolMoney(row.original.collected)}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.original.status;
          return (
            <Badge
              tone={
                status === "ENTRIES_OPEN"
                  ? "brand"
                  : status === "ENTRIES_CLOSED"
                    ? "warn"
                    : status === "RESULTS_IN"
                      ? "success"
                      : "neutral"
              }
            >
              {SERIES_STATUS_LABELS[status] ?? status}
            </Badge>
          );
        },
      },
      {
        id: "verbs",
        header: () => <span className="sr-only">Row actions</span>,
        // Which verb a row carries follows its standing: a series still taking
        // entries opens its candidate roll, one with grades opens its results.
        cell: ({ row }) => {
          const open = row.original.status === "ENTRIES_OPEN" || row.original.status === "PLANNED";
          return (
            <div className="flex justify-end">
              <Button
                asChild
                size="sm"
                variant={open ? "primary" : "secondary"}
              >
                <Link
                  href={
                    open
                      ? `/schools/exams/${row.original.id}/candidates`
                      : `/schools/exams/${row.original.id}/results`
                  }
                >
                  {open ? "Open" : "Results"}
                </Link>
              </Button>
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <SchoolsPage>
      <PageChrome title="Exam series">
        <CreateButton
          resource="schools.exams"
          label="New series"
          onSelect={() => setNewOpen(true)}
        />
        {/* Rehoused off the band. It prints the deadline table below, which is
            the thing on this page somebody carries out of the room. */}
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <Printer className="size-4" />
          Print the deadline sheet
        </Button>
      </PageChrome>

      {saveError ? <SaveError what="That series" error={saveError} /> : null}

      {/* The page's one alert, and the whole argument of the screen: two facts
          joined by an em dash — the clock and the count — and one verb. */}
      {nearest && lead && lead.tallies.cannotBeRegistered > 0 ? (
        <Alert
          tone="danger"
          title={`${nearest.days} ${nearest.days === 1 ? "day" : "days"} to the ${nearest.boardName} ${lead.series.name} deadline — ${lead.tallies.cannotBeRegistered} of ${lead.tallies.candidates} ${EXAM_LEVEL_LABELS[lead.series.level]} candidates cannot be registered`}
          actions={
            <Button asChild size="sm">
              <Link href={`/schools/exams/${nearest.seriesId}/candidates`}>
                Open the candidate roll
              </Link>
            </Button>
          }
        />
      ) : null}

      {lead ? (
        <section className="space-y-2">
          <h2 className="flex items-baseline justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
            <span className="text-sm font-semibold text-[color:var(--text-strong)]">
              {lead.series.board.name} {lead.series.name}, {EXAM_LEVEL_LABELS[lead.series.level]}
            </span>
            <span className="text-xs text-[color:var(--text-muted)]">
              {lead.series.entriesCloseAt
                ? `entries close ${formatSchoolDate(lead.series.entriesCloseAt)}${
                    lead.tallies.daysLeft != null ? ` · ${lead.tallies.daysLeft} days` : ""
                  }`
                : "no deadline set"}
            </span>
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[color:var(--text-muted)]">
                <th className="py-1 font-normal">Deadline</th>
                <th className="w-[190px] py-1 font-normal">Date</th>
                <th className="w-[220px] py-1 font-normal">Days away</th>
                <th className="w-[230px] py-1 font-normal">What follows</th>
              </tr>
            </thead>
            <tbody>
              {lead.deadlines.map((row) => (
                <tr key={row.deadline} className="border-t border-[color:var(--border-subtle)]">
                  <td className="py-1.5">{row.deadline}</td>
                  <td className="py-1.5 font-mono text-xs">{formatSchoolDate(row.date)}</td>
                  <td className="py-1.5">
                    <DaysAway days={row.days} />
                  </td>
                  <td className="py-1.5 text-xs text-[color:var(--text-muted)]">{row.follows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="flex items-baseline justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
          <span className="text-sm font-semibold text-[color:var(--text-strong)]">Series</span>
          <span className="text-xs text-[color:var(--text-muted)]">
            {indexQuery.data
              ? `${indexQuery.data.counts.all} series · ${indexQuery.data.counts.open} open for entries`
              : ""}
          </span>
        </h2>

        {indexQuery.error ? (
          <LoadError
            what="the exam series"
            error={indexQuery.error}
            onRetry={() => void indexQuery.refetch()}
          />
        ) : (
          <>
            <TableControls
              sticky
              tabs={
                <PopulationTabs<Segment>
                  value={segment}
                  onChange={setSegment}
                  tabs={[
                    { id: "all", label: "All series", count: indexQuery.data?.counts.all },
                    { id: "open", label: "Open", count: indexQuery.data?.counts.open },
                    {
                      id: "results",
                      label: "Results in",
                      count: indexQuery.data?.counts.resultsIn,
                    },
                  ]}
                />
              }
              search={
                <TableSearch value={search} onChange={setSearch} placeholder="Search series" />
              }
              filterCount={activeFilterCount(boardFilter, levelFilter)}
              filters={
                <>
                  <FilterSelect
                    label="Board"
                    allLabel="Every board"
                    value={boardFilter}
                    options={boards}
                    onChange={setBoardFilter}
                  />
                  <FilterSelect
                    label="Level"
                    allLabel="Every level"
                    value={levelFilter}
                    options={(Object.keys(EXAM_LEVEL_LABELS) as ExamLevel[]).map((level) => ({
                      value: level,
                      label: EXAM_LEVEL_LABELS[level],
                    }))}
                    onChange={setLevelFilter}
                  />
                </>
              }
            />

            <DataTable
              data={rows}
              columns={columns}
              features={{ sorting: false, globalFilter: false, pagination: false }}
              mobileListRenderer={({ rows: mobileRows }) => (
                <MobileList>
                  {mobileRows.map(({ row }) => (
                    <MobileList.Row
                      key={row.id}
                      title={`${row.board.name} ${row.name}`}
                      subtitle={[
                        EXAM_LEVEL_LABELS[row.level],
                        `${row.candidates} candidates`,
                        SERIES_STATUS_LABELS[row.status] ?? row.status,
                      ].join(" · ")}
                      onClick={() => router.push(`/schools/exams/${row.id}/candidates`)}
                    />
                  ))}
                </MobileList>
              )}
              emptyState={
                indexQuery.isPending ? (
                  <TableRowsSkeleton
                    rows={6}
                    headers={[
                      "Series",
                      "Level",
                      "Entries close",
                      "Candidates",
                      "Entries",
                      "Invoiced",
                      "Collected",
                      "Status",
                      "",
                    ]}
                    columns={[
                      { twoLine: true },
                      { width: 120 },
                      { width: 120 },
                      { width: 88, align: "right" },
                      { width: 70, align: "right" },
                      { width: 95, align: "right" },
                      { width: 100, align: "right" },
                      { width: 128, badge: true },
                      { width: 68 },
                    ]}
                  />
                ) : boardFilter || levelFilter || search.trim() || segment !== "all" ? (
                  <NothingMatched
                    what="series"
                    filters={[
                      boards.find((board) => board.value === boardFilter)?.label,
                      levelFilter ? EXAM_LEVEL_LABELS[levelFilter as ExamLevel] : null,
                      segment === "open" ? "Open" : segment === "results" ? "Results in" : null,
                    ].filter((entry): entry is string => Boolean(entry))}
                    search={search}
                    onClear={() => {
                      setBoardFilter("");
                      setLevelFilter("");
                      setSearch("");
                      setSegment("all");
                    }}
                  />
                ) : (
                  <NothingYet
                    title="No exam series has been set up"
                    body="A series is a board, a level, a centre number and a date entries close. The deadline is what the rest of this hangs off."
                    action={<Button onClick={() => setNewOpen(true)}>New series</Button>}
                  />
                )
              }
            />
          </>
        )}
      </section>

      <NewSeriesDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onError={setSaveError}
        onSaved={() => {
          setNewOpen(false);
          setSaveError(null);
          void queryClient.invalidateQueries({ queryKey: ["schools", "exams"] });
        }}
      />
    </SchoolsPage>
  );
}

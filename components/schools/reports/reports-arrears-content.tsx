"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery, useIsMutating } from "@tanstack/react-query";
import { Alert, Button, Card, StatCard } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { AgeingStrip } from "@/components/schools/common/ageing-strip";
import { PageBand } from "@/components/schools/common/page-band";
import { EntityLink } from "@/components/records/entity-link";
import { PersonCell } from "@/components/schools/common/identity-cell";
import { RecordActions } from "@/components/schools/common/record-actions";
import { SendNoticeDialog } from "@/components/schools/common/send-notice-dialog";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import {
  ALL_CLASSES,
  ClassFilter,
  classFilterParams,
  type ClassFilterValue,
} from "@/components/schools/common/class-filter";
import {
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
  StatsSkeleton,
  TableRowsSkeleton,
} from "@/components/records/states";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { AGEING_BUCKETS, ageingAmount, type AgeingTone } from "@/lib/schools/ageing";
import { formatSchoolMoney } from "@/lib/schools/format";

/**
 * Arrears ageing — who is behind, and by how long.
 *
 * This is the arrears view off `/schools/reports` given a route of its own,
 * because it is not a report anybody reads next to the other three. A bursar
 * opens Collections once a fortnight to see how the term is going; they open
 * this one on the morning they have decided to do something about it, and then
 * they stay on it for an hour. Sharing a page with three sibling reports meant
 * the filters they had set were one segment change away from being lost.
 *
 * The verb is the whole point of the screen. Before it existed, the aging
 * table named every family in arrears and offered no way to reach one of them,
 * while the school already lands a notice in every parent's portal in one
 * send. `Remind` on the row and `Remind the N` in the app bar are that same
 * send — the second one addressed to exactly the set the filters left on
 * screen, which is why the count in the button is live rather than a label.
 */

type ArrearsRow = {
  studentId: string;
  studentNo: string;
  studentName: string;
  classId: string;
  className: string;
  totalOutstanding: number;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days120Plus: number;
};

type ArrearsResponse = {
  data: ArrearsRow[];
  summary: {
    studentsWithArrears: number;
    totalOutstanding: number;
    aging: {
      current: number;
      days30: number;
      days60: number;
      days90: number;
      days120Plus: number;
    };
  };
};

type CollectionsResponse = {
  data: Array<{ period: string; termId: string; termName: string; collectionRate: number }>;
  summary: { totalInvoiced: number; overallCollectionRate: number };
};

type EnrollmentResponse = {
  data: Array<{ period: string; totalEnrolled: number }>;
  summary: { averageEnrollment: number };
};

type OccupancyResponse = {
  summary: { totalBeds: number; totalOccupied: number; overallOccupancyRate: number };
};

/** The other three cuts of the same reporting pack, kept a click away. */
/*
 * Each segment addresses its own cut. Three of these used to point at
 * `/schools/reports` bare, which held its view in state — so "Enrolment" and
 * "Hostel occupancy" were doors that opened into Collections.
 */
const REPORT_VIEWS = [
  { id: "collections", label: "Collections", href: "/schools/reports" },
  { id: "arrears", label: "Arrears ageing", href: "/schools/finance/arrears" },
  { id: "enrollment", label: "Enrolment", href: "/schools/reports?view=enrollment" },
  { id: "occupancy", label: "Hostel occupancy", href: "/schools/reports?view=occupancy" },
];

const AGE_OPTIONS = [
  { value: "days30", label: "30 days or worse" },
  { value: "days60", label: "60 days or worse" },
  { value: "days90", label: "90 days or worse" },
  { value: "days120Plus", label: "Only the 90+ column" },
];

const OWING_OPTIONS = [
  { value: "100", label: "100 and above" },
  { value: "500", label: "500 and above" },
  { value: "1000", label: "1,000 and above" },
  { value: "2000", label: "2,000 and above" },
];

const BOARDING_OPTIONS = [
  { value: "BOARDING", label: "Boarders only" },
  { value: "DAY", label: "Day pupils only" },
];

/**
 * A rate with nothing behind it is unknown rather than zero: "0%" against
 * nothing billed reads as a school that collected nothing.
 */
function percent(value: number, outOf: number): string {
  if (!(outOf > 0) || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

/**
 * A collection rate reads as a state, not a number: 96 is fine, 69 is not.
 * A rate with nothing billed behind it is no state at all, so the tile stays
 * neutral rather than painting a school that has not billed yet in danger red.
 */
function rateTone(rate: number, outOf: number) {
  if (!(outOf > 0)) return undefined;
  if (rate >= 90) return "success" as const;
  if (rate >= 70) return "warn" as const;
  return "danger" as const;
}

/**
 * Money in an ageing column, warming as it ages.
 *
 * The tone is the band's own, so the shape of a family's debt is legible
 * before the figures are read. Everything is `num` — mono, tabular — so the
 * columns line up digit for digit down the table.
 */
function AgedMoney({ amount, tone }: { amount: number; tone: AgeingTone }) {
  // An em dash, not "$ 0.00". This is a table of figures, where "we have
  // nothing in this band" is the whole meaning — and five columns of nought
  // across forty rows is two hundred amounts the eye has to read past to find
  // the ones that are not.
  if (amount <= 0) {
    return (
      <NumericCell className="text-[color:var(--text-faint)]">—</NumericCell>
    );
  }
  const ink =
    tone === "good"
      ? "text-[color:var(--text-muted)]"
      : tone === "neutral"
        ? "text-[color:var(--text-body)]"
        : tone === "warn"
          ? "font-semibold text-[color:var(--tone-warn)]"
          : "font-bold text-[color:var(--tone-danger)]";
  return <NumericCell className={ink}>{formatSchoolMoney(amount)}</NumericCell>;
}

export function ReportsArrearsContent() {
  const router = useRouter();
  const access = useSchoolAccess();

  // The year group and the stream are one control, not two. The canvas draws
  // them as a pair — "Stream / Every stream" beside "Year group / Every year
  // group" — but a stream only means anything inside its class, and chaining
  // two selects to reach "Form 2 Green" is one decision more than the question
  // has. `ClassFilter` offers the streams inline beneath their class.
  const [classFilter, setClassFilter] = useState<ClassFilterValue>(ALL_CLASSES);
  const [oldestAtLeast, setOldestAtLeast] = useState("");
  const [minOutstanding, setMinOutstanding] = useState("");
  const [boarding, setBoarding] = useState("");
  const [search, setSearch] = useState("");

  const [reminding, setReminding] = useState<ArrearsRow[] | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const arrearsParams = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(classFilterParams(classFilter))) {
      params.set(key, value);
    }
    if (oldestAtLeast) params.set("oldestAtLeast", oldestAtLeast);
    if (minOutstanding) params.set("minOutstanding", minOutstanding);
    if (boarding) params.set("boarding", boarding);
    return params;
  }, [classFilter, oldestAtLeast, minOutstanding, boarding]);

  const arrearsQuery = useQuery({
    queryKey: ["schools", "reports", "arrears", arrearsParams.toString()],
    queryFn: () =>
      fetchJson<ArrearsResponse>(
        `/api/v2/schools/reports/arrears?${arrearsParams.toString()}`,
      ),
  });

  // The three sibling reports, for the header tiles only. They are cheap and
  // unfiltered on purpose: the tiles say what the school looks like, not what
  // the filters left behind, and a collection rate that moved when somebody
  // picked a year group would be answering a different question from the one
  // its label asks.
  const collectionsQuery = useQuery({
    queryKey: ["schools", "reports", "collections", "headline"],
    queryFn: () => fetchJson<CollectionsResponse>("/api/v2/schools/reports/collections"),
  });
  const enrollmentQuery = useQuery({
    queryKey: ["schools", "reports", "enrollment"],
    queryFn: () => fetchJson<EnrollmentResponse>("/api/v2/schools/reports/enrollment"),
  });
  const occupancyQuery = useQuery({
    queryKey: ["schools", "reports", "occupancy"],
    queryFn: () => fetchJson<OccupancyResponse>("/api/v2/schools/reports/occupancy"),
  });

  const arrears = useMemo(() => arrearsQuery.data?.data ?? [], [arrearsQuery.data]);
  const summary = arrearsQuery.data?.summary;
  const collections = useMemo(
    () => collectionsQuery.data?.data ?? [],
    [collectionsQuery.data],
  );
  const enrollment = useMemo(
    () => enrollmentQuery.data?.data ?? [],
    [enrollmentQuery.data],
  );

  /** The most recent term, which is what "to date" is about. */
  const termInView = useMemo(() => {
    if (collections.length === 0) return null;
    return [...collections].sort((a, b) => b.period.localeCompare(a.period))[0] ?? null;
  }, [collections]);

  /** The roll as it stands — "188 of 842" has to be against today's school. */
  const rollNow = useMemo(() => {
    if (enrollment.length === 0) return null;
    return [...enrollment].sort((a, b) => b.period.localeCompare(a.period))[0]!
      .totalEnrolled;
  }, [enrollment]);

  /**
   * The search box narrows in the browser rather than at the API, because the
   * arrears report is a computed roll-up that the route hands back whole —
   * asking the server for it again to strike out six rows would recompute
   * every family's aging to answer a typing question.
   */
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return arrears;
    return arrears.filter(
      (row) =>
        row.studentName.toLowerCase().includes(needle) ||
        row.studentNo.toLowerCase().includes(needle) ||
        row.className.toLowerCase().includes(needle),
    );
  }, [arrears, search]);

  /** Where the 90+ sits: the oldest column, by year group. */
  const oldest = useMemo(() => {
    // Keyed by the class's id rather than its name, so each line keeps the
    // record it is about and can link to it. Two year groups with the same
    // name would otherwise be added together and neither could be opened.
    const byClass = new Map<string, { name: string; classId: string; amount: number }>();
    for (const row of arrears) {
      if (row.days120Plus <= 0) continue;
      const key = row.classId || "none";
      const seen = byClass.get(key);
      if (seen) seen.amount += row.days120Plus;
      else
        byClass.set(key, {
          name: row.className || "No year group",
          classId: row.classId,
          amount: row.days120Plus,
        });
    }
    const ordered = [...byClass.values()].sort((a, b) => b.amount - a.amount);
    const top = ordered.slice(0, 4);
    const rest = ordered.slice(4).reduce((total, row) => total + row.amount, 0);
    return {
      // Four year groups and a remainder: past that the panel is a second copy
      // of the table with worse columns.
      rows:
        rest > 0
          ? [...top, { name: "Everything else", classId: "", amount: rest }]
          : top,
      families: arrears.filter((row) => row.days120Plus > 0).length,
    };
  }, [arrears]);

  const narrowing = [
    classFilter.classId || classFilter.streamId ? "the chosen year group" : null,
    AGE_OPTIONS.find((option) => option.value === oldestAtLeast)?.label,
    OWING_OPTIONS.find((option) => option.value === minOutstanding)?.label,
    BOARDING_OPTIONS.find((option) => option.value === boarding)?.label,
    search.trim() || null,
  ].filter((label): label is string => Boolean(label));

  const clearFilters = () => {
    setClassFilter(ALL_CLASSES);
    setOldestAtLeast("");
    setMinOutstanding("");
    setBoarding("");
    setSearch("");
  };

  /**
   * Export, fetched rather than opened.
   *
   * `window.open` on an API URL means a refused or broken export is a blank
   * tab: no error, no filename, nothing to report to anybody. Fetching it puts
   * the failure on the screen the button is on, and hands the browser a real
   * blob with the server's own filename when it works.
   */
  const runExport = async (format: "csv" | "pdf") => {
    setExportError(null);
    setExporting(format);
    try {
      const params = new URLSearchParams(arrearsParams);
      params.set("reportType", "arrears");
      params.set("format", format);

      const response = await fetch(
        `/api/v2/schools/reports/export?${params.toString()}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        const contentType = response.headers.get("content-type") ?? "";
        const payload = contentType.includes("application/json")
          ? ((await response.json()) as { error?: string })
          : null;
        throw new Error(payload?.error ?? `The export failed (${response.status}).`);
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const named = /filename="([^"]+)"/.exec(disposition)?.[1];
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = named ?? `arrears-report.${format}`;
      anchor.click();
      // Revoked on the next tick, not immediately: Safari has not started
      // reading the blob by the time `click()` returns.
      setTimeout(() => URL.revokeObjectURL(href), 0);
    } catch (error) {
      setExportError(getApiErrorMessage(error, "The export failed."));
    } finally {
      setExporting(null);
    }
  };

  const columns = useMemo<ColumnDef<ArrearsRow>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <PersonCell
            kind="student"
            href={`/schools/students/${row.original.studentId}`}
            name={row.original.studentName}
            reference={row.original.studentNo}
            context={row.original.className}
          />
        ),
      },
      {
        id: "totalOutstanding",
        header: "Total outstanding",
        cell: ({ row }) => (
          <NumericCell className="font-semibold">
            {formatSchoolMoney(row.original.totalOutstanding)}
          </NumericCell>
        ),
      },
      ...AGEING_BUCKETS.map(
        (bucket): ColumnDef<ArrearsRow> => ({
          id: bucket.key,
          header: bucket.label,
          cell: ({ row }) => (
            <AgedMoney
              amount={ageingAmount(row.original, bucket.key)}
              tone={bucket.tone}
            />
          ),
        }),
      ),
      {
        id: "verbs",
        // An affordance, not a field — but the head still needs the cell, or
        // every column below it shifts by one.
        header: () => <span className="sr-only">Row actions</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            {/* Writing to a family is `notify-families`, which the route
                enforces and which the bursar and the class teacher hold. This
                screen asked for `create` instead, so the one person whose job
                arrears are watched the button stay dark on the page built for
                her, while the same send worked from the finance overview. */}
            <RecordActions
              layout="menu"
              resource="schools.reports"
              label={`Actions for ${row.original.studentName}`}
              verbs={[
                {
                  label: "Remind",
                  action: "notify-families",
                  onSelect: () => {
                    setSent(null);
                    setReminding([row.original]);
                  },
                },
              ]}
            />
          </div>
        ),
      },
    ],
    [],
  );

  const canRemind = access.can("schools.reports", "notify-families");

  /**
   * The reminder send lives inside `SendNoticeDialog`. It owns its own error
   * banner, but not the table underneath it — which is where the row-level
   * Remind buttons are, and they are still clickable while the send runs.
   */
  const sending = useIsMutating() > 0 && reminding !== null;

  return (
    <>
      {/*
        The page's one primary action, in the app bar. It is the bulk verb and
        its count is the filtered set, not the school — press it after
        narrowing to Form 4 and it writes to Form 4.
      */}
      <PageChrome title="Arrears">
        <Button
          variant="primary"
          disabled={!canRemind || visible.length === 0}
          title={
            !canRemind
              ? "Writing to families is the office's to do."
              : visible.length === 0
                ? "Nobody is in arrears in this view."
                : undefined
          }
          onClick={() => {
            setSent(null);
            setReminding(visible);
          }}
        >
          Remind the {visible.length}
        </Button>
      </PageChrome>

      <div className="space-y-4">
        <PageBand
          chips={[
            {
              label: "Outstanding",
              value: arrearsQuery.isPending
                ? "—"
                : formatSchoolMoney(summary?.totalOutstanding ?? 0),
              tone: "danger",
            },
            {
              label: "90+ days",
              value: arrearsQuery.isPending
                ? "—"
                : formatSchoolMoney(summary?.aging.days120Plus ?? 0),
              tone: "warn",
            },
            {
              label: "Families",
              value: arrearsQuery.isPending ? "—" : arrears.length,
            },
          ]}
          actions={
            <>
              <Button
                variant="secondary"
                size="sm"
                loading={exporting === "csv"}
                onClick={() => void runExport("csv")}
              >
                Export CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={exporting === "pdf"}
                onClick={() => void runExport("pdf")}
              >
                Export PDF
              </Button>
            </>
          }
        />

        {exportError ? (
          // An export is a write as far as the person pressing it is concerned
          // — they asked for a file and did not get one — so it takes the same
          // banner every other failed write on the module takes.
          <SaveError what="The export" error={exportError} />
        ) : null}
        {sent ? <Alert tone="success" title={sent} onDismiss={() => setSent(null)} /> : null}

        {/*
          One tile per sibling report, each carrying that report's headline
          number and the footer that gives it a denominator. They are the
          reason the segments above the table are worth pressing.

          There were four. The fourth was "Students with arrears", which is the
          Families chip in the band eighty pixels higher, in a different
          typeface — and a figure stated twice on one screen is a figure the
          reader has to check against itself. The band keeps it, because the
          band is the half that stays in view.

          Each is read off a live endpoint and none of them is filtered: the
          tiles say what the school looks like, not what the filters left
          behind, and a collection rate that moved when somebody picked a year
          group would be answering a different question from the one its label
          asks.
        */}
        {arrearsQuery.isPending || collectionsQuery.isPending ? (
          <StatsSkeleton count={3} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Collection rate"
              tone={rateTone(
                collectionsQuery.data?.summary.overallCollectionRate ?? 0,
                collectionsQuery.data?.summary.totalInvoiced ?? 0,
              )}
              value={percent(
                collectionsQuery.data?.summary.overallCollectionRate ?? 0,
                collectionsQuery.data?.summary.totalInvoiced ?? 0,
              )}
              footer={termInView ? `${termInView.termName} to date` : "No term in view"}
            />
            <StatCard
              label="Average enrolment"
              value={enrollmentQuery.data?.summary.averageEnrollment ?? 0}
              footer={
                rollNow === null
                  ? `across ${enrollment.length} term${enrollment.length === 1 ? "" : "s"}`
                  : `${rollNow} on the roll now`
              }
            />
            <StatCard
              label="Hostel occupancy"
              tone="brand"
              value={percent(
                occupancyQuery.data?.summary.overallOccupancyRate ?? 0,
                occupancyQuery.data?.summary.totalBeds ?? 0,
              )}
              footer={
                occupancyQuery.data?.summary
                  ? `${occupancyQuery.data.summary.totalOccupied} of ${occupancyQuery.data.summary.totalBeds} beds`
                  : "No hostels"
              }
            />
          </div>
        )}

        {/*
          The four tiles read four different endpoints. When one of them fails
          the other three still have answers, so the fault is named where it
          sits rather than taking the page — a bursar who came here for the
          arrears should not lose the arrears because the hostel count is down.
        */}
        {collectionsQuery.isError ? (
          <LoadError
            what="the collection rate"
            error={collectionsQuery.error}
            onRetry={() => void collectionsQuery.refetch()}
          />
        ) : null}
        {enrollmentQuery.isError ? (
          <LoadError
            what="the enrolment figures"
            error={enrollmentQuery.error}
            onRetry={() => void enrollmentQuery.refetch()}
          />
        ) : null}
        {occupancyQuery.isError ? (
          <LoadError
            what="the hostel occupancy"
            error={occupancyQuery.error}
            onRetry={() => void occupancyQuery.refetch()}
          />
        ) : null}

        {arrearsQuery.error ? (
          <LoadError
            what="the arrears report"
            error={arrearsQuery.error}
            onRetry={() => void arrearsQuery.refetch()}
          />
        ) : null}

        {/*
          Segments, search and filters in one row, directly above the table
          they govern. The other three report views are a click away rather
          than a segment here: they are different questions with different
          filters, and switching to Enrolment used to throw away everything
          set on this one.
        */}
        <TableControls
          tabs={
            <div className="flex items-center gap-1 overflow-x-auto rounded-[var(--radius-md)] bg-[color:var(--surface-muted)] p-1">
              {REPORT_VIEWS.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => {
                    if (view.id !== "arrears") router.push(view.href);
                  }}
                  className={
                    view.id === "arrears"
                      ? "shrink-0 rounded-[var(--radius-sm)] bg-[color:var(--surface)] px-3 py-1 text-sm font-semibold shadow-[var(--shadow-xs)]"
                      : "shrink-0 rounded-[var(--radius-sm)] px-3 py-1 text-sm text-muted-foreground"
                  }
                >
                  {view.label}
                </button>
              ))}
            </div>
          }
          search={
            <TableSearch
              value={search}
              onChange={setSearch}
              placeholder="Search students"
            />
          }
          filters={
            <>
              <ClassFilter
                label="Year group"
                allLabel="Every year group"
                value={classFilter}
                onChange={setClassFilter}
              />
              <FilterSelect
                label="Oldest debt"
                allLabel="Any age"
                value={oldestAtLeast}
                options={AGE_OPTIONS}
                onChange={setOldestAtLeast}
              />
              <FilterSelect
                label="Owing at least"
                allLabel="Any amount"
                value={minOutstanding}
                options={OWING_OPTIONS}
                onChange={setMinOutstanding}
              />
              <FilterSelect
                label="Boarding"
                allLabel="Boarders and day"
                value={boarding}
                options={BOARDING_OPTIONS}
                onChange={setBoarding}
              />
            </>
          }
          count={
            arrearsQuery.isPending ? null : `${visible.length} of ${arrears.length}`
          }
        />

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4">
            {arrears.length > 0 ? (
              <Card title="How old the debt is">
                <AgeingStrip amounts={summary?.aging} />
              </Card>
            ) : null}

            {arrearsQuery.isPending ? (
              <TableRowsSkeleton
                headers={[
                  "Student",
                  "Total outstanding",
                  ...AGEING_BUCKETS.map((bucket) => bucket.label),
                ]}
                columns={[
                  { avatar: true, twoLine: true },
                  // Every aging column is money, and money is right-aligned in
                  // the real row. A skeleton that left-aligns them makes the
                  // whole table jump right when the figures land.
                  { width: 110, align: "right" },
                  { width: 90, align: "right" },
                  { width: 90, align: "right" },
                  { width: 90, align: "right" },
                  { width: 90, align: "right" },
                  { width: 90, align: "right" },
                ]}
              />
            ) : arrearsQuery.error ? null : (
              // Writing to a set of families is a write, and the dialog that
              // does it sits over this table. While it is in flight the rows
              // stop taking clicks — every one of them carries a Remind, and a
              // second press mid-send writes to the family twice.
              <SavingOverlay saving={sending} label="Sending the reminders…">
                <DataTable
                  data={visible}
                  columns={columns}
                  pagination={{ enabled: true }}
                  emptyState={
                    narrowing.length > 0 ? (
                      <NothingMatched
                        what="families"
                        filters={narrowing}
                        onClear={clearFilters}
                      />
                    ) : rollNow === 0 ? (
                      // No arrears because there is no school yet. Different
                      // sentence from "everybody has paid", and the verb that
                      // fills it is admitting pupils, not chasing them.
                      <NothingYet
                        title="Nobody is on the roll yet"
                        body="Arrears are worked out from issued bills. Admit pupils and bill them, and this fills itself."
                      />
                    ) : (
                      <NothingLeftToDo
                        title="Nobody is in arrears"
                        body="Every issued bill has been settled. There is nothing to chase."
                      />
                    )
                  }
                />
              </SavingOverlay>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <Card title="Where the 90+ sits" subtitle="The oldest column, by year group">
              {oldest.rows.length === 0 ? (
                <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                  Nothing in this view has run past ninety days.
                </p>
              ) : (
                <>
                  <dl className="space-y-1.5">
                    {oldest.rows.map((row) => (
                      <div
                        key={row.classId || row.name}
                        className="flex items-baseline justify-between gap-2"
                      >
                        {/* "Which form is carrying the 90+" is a question
                            whose next step is that form's *fees* — the
                            invoices, who has paid and who has not. It pointed
                            at the class record in Master Data, which answers
                            how many places it has and who teaches it: the
                            right record, the wrong question, and a bursar
                            three clicks from the list they came to ring.

                            The remainder line and a pupil with no class have
                            no class behind them, so they stay plain rather
                            than advertising a destination they do not have.
                            The truncation is on the cell because the link is
                            an inline child and will not clamp itself. */}
                        <dt className="block truncate text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                          {row.classId ? (
                            <EntityLink href={`/schools/finance/class/${row.classId}`}>
                              {row.name}
                            </EntityLink>
                          ) : (
                            row.name
                          )}
                        </dt>
                        <dd className="font-[family-name:var(--font-mono)] text-[length:var(--type-body-sm)] font-bold tabular-nums text-[color:var(--text-strong)]">
                          {formatSchoolMoney(row.amount)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                    {oldest.families}{" "}
                    {oldest.families === 1 ? "family carries" : "families carry"} the
                    whole 90+ column. That is the list worth ringing.
                  </p>
                </>
              )}
            </Card>
          </div>
        </div>
      </div>

      {reminding ? (
        <SendNoticeDialog
          open
          onOpenChange={(next) => {
            if (!next) setReminding(null);
          }}
          title={
            reminding.length === 1
              ? `Remind ${reminding[0]!.studentName}'s family`
              : `Remind the ${reminding.length}`
          }
          audience={{
            studentIds: reminding.map((row) => row.studentId),
            describe:
              reminding.length === 1
                ? `${reminding[0]!.studentName}'s guardians`
                : `the families of the ${reminding.length} in arrears in this view`,
          }}
          severity="WARNING"
          defaultSubject="School fees outstanding"
          defaultBody={
            reminding.length === 1
              ? `Our records show fees of ${formatSchoolMoney(reminding[0]!.totalOutstanding)} still outstanding on ${reminding[0]!.studentName}'s account. Please settle the balance, or come and see the bursar to arrange terms.`
              : "Our records show school fees still outstanding on your child's account. Please settle the balance, or come and see the bursar to arrange terms. Your statement is on the portal."
          }
          sendLabel={
            reminding.length === 1 ? "Send the reminder" : `Remind the ${reminding.length}`
          }
          onSent={(result) => {
            setSent(
              `Sent to ${result.recipients} ${result.recipients === 1 ? "family" : "families"}${
                result.withoutAccount > 0
                  ? ` · ${result.withoutAccount} have no portal account yet, so ring them`
                  : ""
              }.`,
            );
          }}
        />
      ) : null}
    </>
  );
}

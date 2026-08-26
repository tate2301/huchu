"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, StatCard } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { TradingViewChartCard } from "@/components/charts/tradingview-chart-card";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { PageBand } from "@/components/schools/common/page-band";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { RecordActions } from "@/components/schools/common/record-actions";
import { SendNoticeDialog } from "@/components/schools/common/send-notice-dialog";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { TableControls, TableSearch } from "@/components/schools/common/table-controls";
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
  StatsSkeleton,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

/**
 * Arrears Aging Report — who is behind, and by how long.
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
  summary: { overallCollectionRate: number };
};

type EnrollmentResponse = {
  data: Array<{ period: string; totalEnrolled: number }>;
  summary: { averageEnrollment: number };
};

type OccupancyResponse = {
  summary: { totalBeds: number; totalOccupied: number; overallOccupancyRate: number };
};

/** The other three cuts of the same reporting pack, kept a click away. */
const REPORT_VIEWS = [
  { id: "collections", label: "Collections", href: "/schools/reports" },
  { id: "arrears", label: "Arrears Aging", href: "/schools/finance/arrears" },
  { id: "enrollment", label: "Enrollment", href: "/schools/reports" },
  { id: "occupancy", label: "Hostel Occupancy", href: "/schools/reports" },
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

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function whole(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function percent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** A collection rate reads as a state, not a number: 96 is fine, 69 is not. */
function rateTone(rate: number) {
  if (rate >= 90) return "success" as const;
  if (rate >= 70) return "warn" as const;
  return "danger" as const;
}

/**
 * Money in an aging column, warming as it ages.
 *
 * Current is quiet, the middle buckets take the warning tone and 90+ takes the
 * danger one, so the shape of a family's debt is legible before the figures
 * are read. Everything is `num` — mono, tabular — so the columns line up
 * digit for digit down the table.
 */
function AgedMoney({
  amount,
  bucket,
}: {
  amount: number;
  bucket: "current" | "days30" | "days60" | "days90" | "days120Plus";
}) {
  if (amount <= 0) {
    return <NumericCell className="text-[color:var(--text-subtle)]">{money(0)}</NumericCell>;
  }
  const tone =
    bucket === "current"
      ? "text-[color:var(--text-muted)]"
      : bucket === "days30"
        ? "text-[color:var(--text-body)]"
        : bucket === "days60"
          ? "text-[color:var(--tone-warn)]"
          : bucket === "days90"
            ? "font-semibold text-[color:var(--tone-warn)]"
            : "font-bold text-[color:var(--tone-danger)]";
  return <NumericCell className={tone}>{money(amount)}</NumericCell>;
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
    const byClass = new Map<string, number>();
    for (const row of arrears) {
      if (row.days120Plus <= 0) continue;
      const name = row.className || "No year group";
      byClass.set(name, (byClass.get(name) ?? 0) + row.days120Plus);
    }
    const ordered = [...byClass.entries()].sort(([, a], [, b]) => b - a);
    const top = ordered.slice(0, 4);
    const rest = ordered.slice(4).reduce((total, [, amount]) => total + amount, 0);
    return {
      // Four year groups and a remainder: past that the panel is a second copy
      // of the table with worse columns.
      rows: rest > 0 ? [...top, ["Everything else", rest] as const] : top,
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
          <div className="flex min-w-0 items-center gap-2">
            <PersonAvatar name={row.original.studentName} />
            <div className="min-w-0">
              <Link
                href={`/schools/students/${row.original.studentId}`}
                className="font-medium hover:underline"
              >
                {row.original.studentName}
              </Link>
              <div className="font-[family-name:var(--font-mono)] text-xs tabular-nums text-muted-foreground">
                {row.original.studentNo} · {row.original.className}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "totalOutstanding",
        header: "Total Outstanding",
        cell: ({ row }) => (
          <NumericCell className="font-semibold">
            {money(row.original.totalOutstanding)}
          </NumericCell>
        ),
      },
      {
        id: "current",
        header: "Current",
        cell: ({ row }) => <AgedMoney amount={row.original.current} bucket="current" />,
      },
      {
        id: "days30",
        header: "1-30 Days",
        cell: ({ row }) => <AgedMoney amount={row.original.days30} bucket="days30" />,
      },
      {
        id: "days60",
        header: "31-60 Days",
        cell: ({ row }) => <AgedMoney amount={row.original.days60} bucket="days60" />,
      },
      {
        id: "days90",
        header: "61-90 Days",
        cell: ({ row }) => <AgedMoney amount={row.original.days90} bucket="days90" />,
      },
      {
        id: "days120Plus",
        header: "90+ Days",
        cell: ({ row }) => (
          <AgedMoney amount={row.original.days120Plus} bucket="days120Plus" />
        ),
      },
      {
        id: "verbs",
        header: "",
        cell: ({ row }) => (
          <RecordActions
            // Writing to a family is the notices grant, which the route
            // enforces on `schools.reports` create. A bursar sees the button
            // disabled and learns whose job it is, rather than after composing
            // the letter.
            resource="schools.reports"
            verbs={[
              {
                label: "Remind",
                action: "create",
                onSelect: () => {
                  setSent(null);
                  setReminding([row.original]);
                },
              },
            ]}
          />
        ),
      },
    ],
    [],
  );

  const canRemind = access.can("schools.reports", "create");

  return (
    <>
      {/*
        The page's one primary action, in the app bar. It is the bulk verb and
        its count is the filtered set, not the school — press it after
        narrowing to Form 4 and it writes to Form 4.
      */}
      <PageChrome title="School Reports">
        <Button
          variant="primary"
          disabled={!canRemind || visible.length === 0}
          title={
            !canRemind
              ? "Writing to families is the head's to do."
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
              value: arrearsQuery.isPending ? "—" : whole(summary?.totalOutstanding ?? 0),
              tone: "danger",
            },
            {
              label: "90+ days",
              value: arrearsQuery.isPending
                ? "—"
                : whole(summary?.aging.days120Plus ?? 0),
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
          <Alert
            tone="danger"
            title="The export did not download"
            onDismiss={() => setExportError(null)}
          >
            {exportError}
          </Alert>
        ) : null}
        {sent ? <Alert tone="success" title={sent} onDismiss={() => setSent(null)} /> : null}

        {/*
          The four report tiles, in the canvas's order and with its footers:
          "Term 2 to date", "of 842 on the roll", "across 3 terms" and
          "318 of 370 beds". Every one of them is read off a live endpoint —
          the term is whichever one is running, the roll is this term's
          enrolment, the beds are the hostels as they stand — so the tiles are
          the school's own numbers rather than a caption about the report.
        */}
        {arrearsQuery.isPending || collectionsQuery.isPending ? (
          <StatsSkeleton count={4} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Collection rate"
              tone={rateTone(collectionsQuery.data?.summary.overallCollectionRate ?? 0)}
              value={percent(collectionsQuery.data?.summary.overallCollectionRate ?? 0)}
              footer={termInView ? `${termInView.termName} to date` : "No term in view"}
            />
            <StatCard
              label="Students with arrears"
              tone={arrears.length > 0 ? "danger" : "success"}
              value={arrears.length}
              footer={rollNow === null ? "of the roll" : `of ${rollNow} on the roll`}
            />
            <StatCard
              label="Avg enrollment"
              value={enrollmentQuery.data?.summary.averageEnrollment ?? 0}
              footer={`across ${enrollment.length} term${enrollment.length === 1 ? "" : "s"}`}
            />
            <StatCard
              label="Hostel occupancy"
              tone="brand"
              value={percent(occupancyQuery.data?.summary.overallOccupancyRate ?? 0)}
              footer={
                occupancyQuery.data?.summary
                  ? `${occupancyQuery.data.summary.totalOccupied} of ${occupancyQuery.data.summary.totalBeds} beds`
                  : "No hostels"
              }
            />
          </div>
        )}

        <h2 className="text-section-title">Arrears Aging Report</h2>

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
          filters, and switching to Enrollment used to throw away everything
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
        />

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4">
            {arrears.length > 0 ? (
              <TradingViewChartCard
                title="Aging Distribution"
                data={[
                  { label: "Current", value: summary?.aging.current ?? 0 },
                  { label: "1-30 Days", value: summary?.aging.days30 ?? 0 },
                  { label: "31-60 Days", value: summary?.aging.days60 ?? 0 },
                  { label: "61-90 Days", value: summary?.aging.days90 ?? 0 },
                  { label: "90+ Days", value: summary?.aging.days120Plus ?? 0 },
                ]}
                xKey="label"
                series={[
                  {
                    key: "value",
                    label: "Amount",
                    type: "bar",
                    color: "var(--chart-need-changes)",
                  },
                ]}
                valueFormatter={(value) => Number(value).toLocaleString()}
              />
            ) : null}

            {arrearsQuery.isPending ? (
              <TableRowsSkeleton
                columns={[
                  { avatar: true, twoLine: true },
                  { width: 110 },
                  { width: 90 },
                  { width: 90 },
                  { width: 90 },
                  { width: 90 },
                  { width: 90 },
                ]}
              />
            ) : (
              <DataTable
                data={visible}
                columns={columns}
                pagination={{ enabled: true }}
                emptyState={
                  arrearsQuery.error ? (
                    "Nothing to show while the report cannot be loaded."
                  ) : narrowing.length > 0 ? (
                    <NothingMatched
                      what="families"
                      filters={narrowing}
                      onClear={clearFilters}
                    />
                  ) : (
                    <NothingLeftToDo
                      title="Nobody is in arrears"
                      body="Every issued bill has been settled. There is nothing to chase."
                    />
                  )
                }
              />
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
                    {oldest.rows.map(([name, amount]) => (
                      <div
                        key={name}
                        className="flex items-baseline justify-between gap-2"
                      >
                        <dt className="truncate text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                          {name}
                        </dt>
                        <dd className="font-[family-name:var(--font-mono)] text-[length:var(--type-body-sm)] font-bold tabular-nums text-[color:var(--text-strong)]">
                          {money(amount)}
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

            <Card title="The missing verb">
              <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                This screen names {arrears.length} families in arrears and offers no way
                to reach any of them. The school already has a notices system that lands
                in every parent’s portal in one send. <strong>Remind</strong> on the row
                and <strong>Remind the 188</strong> in the band are the same send,
                addressed to the filtered set.
              </p>
            </Card>

            <Card title="Why these buckets">
              <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                Current, 1–30, 31–60, 61–90 and 90+ are the accounting AR report’s own
                columns. A bursar comparing the two screens should not have to learn a
                second layout for the same idea.
              </p>
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
              ? `Our records show fees of ${money(reminding[0]!.totalOutstanding)} still outstanding on ${reminding[0]!.studentName}'s account. Please settle the balance, or come and see the bursar to arrange terms.`
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

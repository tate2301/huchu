"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery, useIsMutating } from "@tanstack/react-query";
import { Alert, Badge, Button, Card, StatCard } from "@corelithzw/react";

import { TradingViewChartCard } from "@/components/charts/tradingview-chart-card";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { AgeingStrip } from "@/components/schools/common/ageing-strip";
import { PageBand, type BandChip } from "@/components/schools/common/page-band";
import { PersonCell, RecordNameCell } from "@/components/schools/common/identity-cell";
import { RecordActions } from "@/components/schools/common/record-actions";
import { SendNoticeDialog } from "@/components/schools/common/send-notice-dialog";
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
import { fetchSchoolsAcademicYears, fetchSchoolsClasses, fetchSchoolsTerms } from "@/lib/schools/admin-v2";
import { fetchSchoolFeeStructures } from "@/lib/schools/fees-v2";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * One frozen empty array for every "the query has not answered yet" case on
 * this page. A fresh `[]` is a fresh identity, and this screen hangs five
 * useMemos off these lists.
 */
const EMPTY: never[] = [];

/**
 * The four reports the office reads, with a way to narrow each of them.
 *
 * The canvas's critique of this route, in its own words:
 *
 *   "There is no date-range, term or year-group filter of any kind on this
 *   route today — the four reports render everything the API returns. The
 *   filter row above is drawn with the module's own `FilterBar`
 *   . Both export buttons `window.open`
 *   an API URL, so a failed export is a blank tab."
 *
 * Both halves of that are now closed, and the code below is what closed them,
 * so the paragraph is kept as the record of why the screen looks like this
 * rather than as a live caveat. Collections and Arrears take the `FilterBar`
 * the canvas drew; the only way to answer "how is Form 4 doing on Term 2 fees"
 * used to be reading a five-term table and doing it in your head. And
 * `runExport` fetches the file rather than opening it, so a refused export
 * lands on the screen the button is on instead of in a blank tab. What is
 * *still* true is that the filter row reaches Collections and Arrears only:
 * Enrolment and Hostel occupancy render whatever their endpoints return,
 * because neither takes a parameter.
 *
 * The arrears view carried the sharper version of the same problem. It names
 * every family in arrears — that is the whole point of it — and offered no way
 * to reach one of them, while the school already reaches every parent's portal
 * in one send. `Remind` on the row and `Remind the N` in the band are the same
 * send, addressed to exactly the set the filters left on screen.
 */

type ReportView = "collections" | "arrears" | "enrollment" | "occupancy";

type CollectionsRow = {
  period: string;
  termId: string;
  termName: string;
  invoiced: number;
  collected: number;
  collectionRate: number;
  receiptsCount: number;
};

type YearGroupRow = {
  classId: string;
  className: string;
  invoiced: number;
  collected: number;
  collectionRate: number;
};

type CollectionsResponse = {
  data: CollectionsRow[];
  summary: {
    totalInvoiced: number;
    totalCollected: number;
    totalReceipts: number;
    overallCollectionRate: number;
    periodsCount: number;
  };
  byYearGroup: YearGroupRow[];
};

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

type EnrollmentRow = {
  period: string;
  termId: string;
  termName: string;
  totalEnrolled: number;
  boardingCount: number;
  dayCount: number;
  maleCount: number;
  femaleCount: number;
};

type EnrollmentResponse = {
  data: EnrollmentRow[];
  summary: {
    totalTerms: number;
    averageEnrollment: number;
    totalBoardingStudents: number;
    boardingRate: number;
  };
};

type OccupancyRow = {
  hostelId: string;
  hostelCode: string;
  hostelName: string;
  totalBeds: number;
  occupiedBeds: number;
  occupancyRate: number;
  activeAllocations: number;
  roomCount: number;
  genderPolicy: string;
};

type OccupancyResponse = {
  data: OccupancyRow[];
  summary: {
    totalHostels: number;
    totalBeds: number;
    totalOccupied: number;
    totalAvailable: number;
    overallOccupancyRate: number;
  };
};

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

/** Counts, not money: receipts written, pupils on the roll. */
function whole(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

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
 * before the figures are read. Drawn identically on the arrears route, so that
 * moving between the two screens does not change what a red figure means.
 *
 * A band with nothing in it is an em dash rather than "$ 0.00": this is a
 * table of figures, where "nothing in this band" is the whole meaning, and
 * five columns of nought across forty rows is two hundred amounts to read past
 * to find the ones that are not.
 */
function AgedMoney({ amount, tone }: { amount: number; tone: AgeingTone }) {
  if (amount <= 0) {
    return <NumericCell className="text-[color:var(--text-faint)]">—</NumericCell>;
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

const REPORT_VIEWS: ReportView[] = ["collections", "arrears", "enrollment", "occupancy"];

function isReportView(value: string | null): value is ReportView {
  return value !== null && (REPORT_VIEWS as string[]).includes(value);
}

export function SchoolsReportsEnhancedContent() {
  const access = useSchoolAccess();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /*
   * Which cut is open lives in the URL, not in state.
   *
   * It has to: the segment strip on the arrears route links here by view, so
   * held in `useState` every one of those links arrived on Collections whatever
   * its label said. It also makes an enrolment view something a bursar can send
   * to a head, which is the point of a report.
   */
  const viewParam = searchParams.get("view");
  const activeView: ReportView = isReportView(viewParam) ? viewParam : "collections";

  const setActiveView = (next: ReportView) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "collections") params.delete("view");
    else params.set("view", next);
    // `replace`: flicking between four cuts of one pack is not four steps back.
    router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
  };

  // Collections filters.
  const [academicYearId, setAcademicYearId] = useState("");
  const [collectionsTermId, setCollectionsTermId] = useState("");
  const [collectionsClassId, setCollectionsClassId] = useState("");
  const [feeStructureId, setFeeStructureId] = useState("");

  // Arrears filters.
  const [arrearsClassId, setArrearsClassId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [oldestAtLeast, setOldestAtLeast] = useState("");
  const [minOutstanding, setMinOutstanding] = useState("");
  const [boarding, setBoarding] = useState("");

  const [reminding, setReminding] = useState<ArrearsRow[] | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const yearsQuery = useQuery({
    queryKey: ["schools", "academic-years", "reports"],
    queryFn: () => fetchSchoolsAcademicYears({ page: 1, limit: 50 }),
  });
  const termsQuery = useQuery({
    queryKey: ["schools", "terms", "reports"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
  });
  const classesQuery = useQuery({
    queryKey: ["schools", "classes", "reports"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });
  const structuresQuery = useQuery({
    queryKey: ["schools", "fee-structures", "reports"],
    queryFn: () => fetchSchoolFeeStructures({ page: 1, limit: 200 }),
  });

  const years = yearsQuery.data?.data ?? [];
  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);
  const structures = structuresQuery.data?.data ?? [];

  /** Terms narrow to the chosen year, so the two pickers cannot contradict. */
  const terms = useMemo(() => {
    const all = termsQuery.data?.data ?? [];
    return academicYearId
      ? all.filter((term) => term.academicYear.id === academicYearId)
      : all;
  }, [termsQuery.data, academicYearId]);

  /**
   * Streams belong to a year group, so the picker offers only the chosen
   * group's — and every stream in the school when none is chosen, labelled with
   * its class, because "A" on its own names four different rooms.
   */
  const streams = useMemo(() => {
    const source = arrearsClassId
      ? classes.filter((row) => row.id === arrearsClassId)
      : classes;
    return source.flatMap((row) =>
      (row.streams ?? []).map((stream) => ({
        value: stream.id,
        label: arrearsClassId ? stream.name : `${row.name} ${stream.name}`,
      })),
    );
  }, [classes, arrearsClassId]);

  const collectionsParams = useMemo(() => {
    const params = new URLSearchParams();
    if (academicYearId) params.set("academicYearId", academicYearId);
    if (collectionsTermId) params.set("termId", collectionsTermId);
    if (collectionsClassId) params.set("classId", collectionsClassId);
    if (feeStructureId) params.set("feeStructureId", feeStructureId);
    return params;
  }, [academicYearId, collectionsTermId, collectionsClassId, feeStructureId]);

  const arrearsParams = useMemo(() => {
    const params = new URLSearchParams();
    if (arrearsClassId) params.set("classId", arrearsClassId);
    if (streamId) params.set("streamId", streamId);
    if (oldestAtLeast) params.set("oldestAtLeast", oldestAtLeast);
    if (minOutstanding) params.set("minOutstanding", minOutstanding);
    if (boarding) params.set("boarding", boarding);
    return params;
  }, [arrearsClassId, streamId, oldestAtLeast, minOutstanding, boarding]);

  const collectionsQuery = useQuery({
    queryKey: ["schools", "reports", "collections", collectionsParams.toString()],
    queryFn: () =>
      fetchJson<CollectionsResponse>(
        `/api/v2/schools/reports/collections?${collectionsParams.toString()}`,
      ),
  });
  const arrearsQuery = useQuery({
    queryKey: ["schools", "reports", "arrears", arrearsParams.toString()],
    queryFn: () =>
      fetchJson<ArrearsResponse>(
        `/api/v2/schools/reports/arrears?${arrearsParams.toString()}`,
      ),
  });
  const enrollmentQuery = useQuery({
    queryKey: ["schools", "reports", "enrollment"],
    queryFn: () => fetchJson<EnrollmentResponse>("/api/v2/schools/reports/enrollment"),
  });
  const occupancyQuery = useQuery({
    queryKey: ["schools", "reports", "occupancy"],
    queryFn: () => fetchJson<OccupancyResponse>("/api/v2/schools/reports/occupancy"),
  });

  /**
   * `?? []` would hand back a new array on every render, and a new array is a
   * new dependency — every useMemo below it would recompute for nothing. One
   * frozen empty array, reused, keeps them still while a query is pending.
   */
  const collections = useMemo(() => collectionsQuery.data?.data ?? EMPTY, [collectionsQuery.data]);
  const byYearGroup = useMemo(
    () => collectionsQuery.data?.byYearGroup ?? EMPTY,
    [collectionsQuery.data],
  );
  const arrears = useMemo(() => arrearsQuery.data?.data ?? EMPTY, [arrearsQuery.data]);
  const enrollment = useMemo(() => enrollmentQuery.data?.data ?? EMPTY, [enrollmentQuery.data]);
  const occupancy = useMemo(() => occupancyQuery.data?.data ?? EMPTY, [occupancyQuery.data]);

  /**
   * The term the collections panel is about: the one named by the filter, or
   * the most recent row when the whole year is in view. A panel headed "in
   * view" has to be about something specific or it is a second summary.
   */
  const termInView = useMemo(() => {
    if (collections.length === 0) return null;
    if (collectionsTermId) {
      return collections.find((row) => row.termId === collectionsTermId) ?? null;
    }
    return [...collections].sort((a, b) => b.period.localeCompare(a.period))[0] ?? null;
  }, [collections, collectionsTermId]);

  /**
   * The roll as it stands: the most recent term's enrolment. "188 of 842" has
   * to be against today's school, not against whichever term the query
   * happened to return first.
   */
  const rollNow = useMemo(() => {
    if (enrollment.length === 0) return null;
    return [...enrollment].sort((a, b) => b.period.localeCompare(a.period))[0]!
      .totalEnrolled;
  }, [enrollment]);

  /** Where the 90+ sits: the oldest column, grouped by year group. */
  const oldestByYearGroup = useMemo(() => {
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
      rows: rest > 0 ? [...top, ["Everything else", rest] as const] : top,
      families: arrears.filter((row) => row.days120Plus > 0).length,
      total: ordered.reduce((sum, [, amount]) => sum + amount, 0),
    };
  }, [arrears]);

  const arrearsNarrowing = [
    classes.find((row) => row.id === arrearsClassId)?.name,
    streams.find((option) => option.value === streamId)?.label,
    AGE_OPTIONS.find((option) => option.value === oldestAtLeast)?.label,
    OWING_OPTIONS.find((option) => option.value === minOutstanding)?.label,
    BOARDING_OPTIONS.find((option) => option.value === boarding)?.label,
  ].filter((label): label is string => Boolean(label));

  const collectionsNarrowing = [
    years.find((row) => row.id === academicYearId)?.name,
    terms.find((row) => row.id === collectionsTermId)?.name,
    classes.find((row) => row.id === collectionsClassId)?.name,
    structures.find((row) => row.id === feeStructureId)?.name,
  ].filter((label): label is string => Boolean(label));

  const clearArrears = () => {
    setArrearsClassId("");
    setStreamId("");
    setOldestAtLeast("");
    setMinOutstanding("");
    setBoarding("");
  };

  const clearCollections = () => {
    setAcademicYearId("");
    setCollectionsTermId("");
    setCollectionsClassId("");
    setFeeStructureId("");
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
      const params = new URLSearchParams(
        activeView === "collections"
          ? collectionsParams
          : activeView === "arrears"
            ? arrearsParams
            : undefined,
      );
      params.set("reportType", activeView);
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
      anchor.download = named ?? `${activeView}-report.${format}`;
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

  const collectionsColumns = useMemo<ColumnDef<CollectionsRow>[]>(
    () => [
      {
        id: "term",
        header: "Term",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.termName}</div>
            <div className="font-[family-name:var(--font-mono)] text-xs text-muted-foreground">
              {row.original.period}
            </div>
          </div>
        ),
      },
      {
        id: "invoiced",
        header: "Invoiced",
        cell: ({ row }) => (
          <NumericCell>{formatSchoolMoney(row.original.invoiced)}</NumericCell>
        ),
      },
      {
        id: "collected",
        header: "Collected",
        cell: ({ row }) => (
          <NumericCell>{formatSchoolMoney(row.original.collected)}</NumericCell>
        ),
      },
      {
        id: "collectionRate",
        header: "Collection rate",
        cell: ({ row }) => (
          <NumericCell>
            <Badge tone={rateTone(row.original.collectionRate, row.original.invoiced)}>
              {percent(row.original.collectionRate, row.original.invoiced)}
            </Badge>
          </NumericCell>
        ),
      },
      {
        id: "receipts",
        header: "Receipts",
        cell: ({ row }) => <NumericCell>{row.original.receiptsCount}</NumericCell>,
      },
    ],
    [],
  );

  const arrearsColumns = useMemo<ColumnDef<ArrearsRow>[]>(
    () => [
      {
        id: "student",
        header: "Pupil",
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
            {/* Writing to a family is the notices grant, which the route
                enforces on `schools.reports` create. A bursar sees the verb
                disabled and learns whose job it is, rather than after
                composing the letter. */}
            <RecordActions
              layout="menu"
              resource="schools.reports"
              label={`Actions for ${row.original.studentName}`}
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
          </div>
        ),
      },
    ],
    [],
  );

  const enrollmentColumns = useMemo<ColumnDef<EnrollmentRow>[]>(
    () => [
      {
        id: "term",
        header: "Term",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.termName}</div>
            <div className="font-[family-name:var(--font-mono)] text-xs text-muted-foreground">
              {row.original.period}
            </div>
          </div>
        ),
      },
      {
        id: "totalEnrolled",
        header: "Total enrolled",
        cell: ({ row }) => (
          <NumericCell className="font-semibold">
            {row.original.totalEnrolled}
          </NumericCell>
        ),
      },
      {
        id: "boarding",
        header: "Boarding",
        cell: ({ row }) => <NumericCell>{row.original.boardingCount}</NumericCell>,
      },
      {
        id: "day",
        header: "Day",
        cell: ({ row }) => <NumericCell>{row.original.dayCount}</NumericCell>,
      },
      {
        id: "male",
        header: "Boys",
        cell: ({ row }) => <NumericCell>{row.original.maleCount}</NumericCell>,
      },
      {
        id: "female",
        header: "Girls",
        cell: ({ row }) => <NumericCell>{row.original.femaleCount}</NumericCell>,
      },
    ],
    [],
  );

  const occupancyColumns = useMemo<ColumnDef<OccupancyRow>[]>(
    () => [
      {
        id: "hostel",
        header: "Hostel",
        // The house is a record, and the question after "which house is full"
        // is almost always about that house.
        cell: ({ row }) => (
          <RecordNameCell
            kind="hostel"
            href={`/schools/boarding/${row.original.hostelId}`}
            name={row.original.hostelName}
            reference={row.original.hostelCode}
            context={row.original.genderPolicy}
          />
        ),
      },
      {
        id: "totalBeds",
        header: "Total beds",
        cell: ({ row }) => <NumericCell>{row.original.totalBeds}</NumericCell>,
      },
      {
        id: "occupiedBeds",
        header: "Occupied",
        cell: ({ row }) => <NumericCell>{row.original.occupiedBeds}</NumericCell>,
      },
      {
        id: "available",
        header: "Available",
        cell: ({ row }) => (
          <NumericCell>{row.original.totalBeds - row.original.occupiedBeds}</NumericCell>
        ),
      },
      {
        id: "occupancyRate",
        header: "Occupancy rate",
        cell: ({ row }) => (
          <NumericCell>
            <Badge
              tone={
                row.original.totalBeds === 0
                  ? "outline"
                  : row.original.occupancyRate >= 95
                    ? "danger"
                    : row.original.occupancyRate >= 85
                      ? "warn"
                      : "success"
              }
            >
              {percent(row.original.occupancyRate, row.original.totalBeds)}
            </Badge>
          </NumericCell>
        ),
      },
      {
        id: "rooms",
        header: "Rooms",
        cell: ({ row }) => <NumericCell>{row.original.roomCount}</NumericCell>,
      },
    ],
    [],
  );

  const canRemind = access.can("schools.reports", "create");
  const collectionsSummary = collectionsQuery.data?.summary;
  const arrearsSummary = arrearsQuery.data?.summary;

  /**
   * The reminder send lives inside `SendNoticeDialog`, which owns its own error
   * banner but not the arrears table underneath it. Every row there carries a
   * Remind, and a second press while the first send is landing writes to the
   * same family twice.
   */
  const sending = useIsMutating() > 0 && reminding !== null;

  /*
    The band carries the state of the view on screen, and nothing the tiles
    above it already say.

    It used to carry the fee figures on all four views, so somebody reading
    the enrolment trend was shown a collection rate that had nothing to do
    with it. And it repeated whichever tile matched — "Collection rate" twice
    on one screen, in two typefaces, eighty pixels apart — which is a figure
    the reader has to check against itself.
  */
  const bandChips: BandChip[] = (() => {
    if (activeView === "arrears") {
      return [
        {
          label: "Outstanding",
          value: arrearsQuery.isPending
            ? "—"
            : formatSchoolMoney(arrearsSummary?.totalOutstanding ?? 0),
          tone: "danger",
        },
        {
          label: "90+ days",
          value: arrearsQuery.isPending
            ? "—"
            : formatSchoolMoney(arrearsSummary?.aging.days120Plus ?? 0),
          tone: "warn",
        },
      ];
    }
    if (activeView === "enrollment") {
      const summary = enrollmentQuery.data?.summary;
      return [
        {
          label: "Boarders",
          value: enrollmentQuery.isPending
            ? "—"
            : whole(summary?.totalBoardingStudents ?? 0),
        },
        {
          label: "Terms counted",
          value: enrollmentQuery.isPending ? "—" : whole(summary?.totalTerms ?? 0),
        },
      ];
    }
    if (activeView === "occupancy") {
      const summary = occupancyQuery.data?.summary;
      return [
        {
          label: "Beds",
          value: occupancyQuery.isPending ? "—" : whole(summary?.totalBeds ?? 0),
        },
        {
          label: "Free tonight",
          value: occupancyQuery.isPending ? "—" : whole(summary?.totalAvailable ?? 0),
          tone: "success",
        },
      ];
    }
    return [
      {
        label: "Invoiced",
        value: collectionsQuery.isPending
          ? "—"
          : formatSchoolMoney(collectionsSummary?.totalInvoiced ?? 0),
      },
      {
        label: "Collected",
        value: collectionsQuery.isPending
          ? "—"
          : formatSchoolMoney(collectionsSummary?.totalCollected ?? 0),
        tone: "success",
      },
    ];
  })();

  return (
    <div className="space-y-4">
      <PageBand
        chips={bandChips}
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
            {activeView === "arrears" ? (
              <Button
                variant="primary"
                size="sm"
                disabled={!canRemind || arrears.length === 0}
                title={
                  !canRemind
                    ? "Writing to families is the head's to do."
                    : arrears.length === 0
                      ? "Nobody is in arrears in this view."
                      : undefined
                }
                onClick={() => {
                  setSent(null);
                  setReminding(arrears);
                }}
              >
                Remind the {arrears.length}
              </Button>
            ) : null}
          </>
        }
      />

      {exportError ? (
        // An export is a write as far as the person pressing it is concerned:
        // they asked for a file and did not get one.
        <SaveError what="The export" error={exportError} />
      ) : null}
      {sent ? (
        <Alert tone="success" title={sent} onDismiss={() => setSent(null)} />
      ) : null}

      {collectionsQuery.isPending || arrearsQuery.isPending ? (
        <StatsSkeleton count={4} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Collection rate"
            tone={rateTone(
              collectionsSummary?.overallCollectionRate ?? 0,
              collectionsSummary?.totalInvoiced ?? 0,
            )}
            value={percent(
              collectionsSummary?.overallCollectionRate ?? 0,
              collectionsSummary?.totalInvoiced ?? 0,
            )}
            footer={termInView ? `${termInView.termName} to date` : "No term in view"}
          />
          <StatCard
            label="Pupils with arrears"
            tone={arrears.length > 0 ? "danger" : "success"}
            value={arrears.length}
            footer={rollNow === null ? "of the roll" : `of ${rollNow} on the roll`}
          />
          <StatCard
            label="Average enrolment"
            value={enrollmentQuery.data?.summary?.averageEnrollment ?? 0}
            footer={`across ${enrollment.length} term${enrollment.length === 1 ? "" : "s"}`}
          />
          <StatCard
            label="Hostel occupancy"
            tone="brand"
            value={percent(
              occupancyQuery.data?.summary?.overallOccupancyRate ?? 0,
              occupancyQuery.data?.summary?.totalBeds ?? 0,
            )}
            footer={
              occupancyQuery.data?.summary
                ? `${occupancyQuery.data.summary.totalOccupied} of ${occupancyQuery.data.summary.totalBeds} beds`
                : "No hostels"
            }
          />
        </div>
      )}

      <VerticalDataViews
        items={[
          { id: "collections", label: "Collections", count: collections.length },
          { id: "arrears", label: "Arrears ageing", count: arrears.length },
          { id: "enrollment", label: "Enrolment", count: enrollment.length },
          { id: "occupancy", label: "Hostel occupancy", count: occupancy.length },
        ]}
        value={activeView}
        onValueChange={(value) => {
          setActiveView(value as ReportView);
          setExportError(null);
        }}
        railLabel="Report views"
      >
        {/* Collections */}
        <div className={activeView === "collections" ? "space-y-4" : "hidden"}>
          <FilterBar>
            <FilterSelect
              label="Academic year"
              allLabel="Every year"
              value={academicYearId}
              options={years.map((row) => ({ value: row.id, label: row.name }))}
              onChange={(value) => {
                setAcademicYearId(value);
                // The term picker is scoped to the year, so a term from the year
                // just replaced would filter to nothing and read as no data.
                setCollectionsTermId("");
              }}
            />
            <FilterSelect
              label="Term"
              allLabel="Every term"
              value={collectionsTermId}
              options={terms.map((row) => ({
                value: row.id,
                label: `${row.name} · ${row.academicYear.name}`,
              }))}
              onChange={setCollectionsTermId}
            />
            <FilterSelect
              label="Year group"
              allLabel="Every year group"
              value={collectionsClassId}
              options={classes.map((row) => ({ value: row.id, label: row.name }))}
              onChange={setCollectionsClassId}
            />
            <FilterSelect
              label="Fee structure"
              allLabel="Every structure"
              value={feeStructureId}
              options={structures.map((row) => ({
                value: row.id,
                label: `${row.name} · ${row.class.name}`,
              }))}
              onChange={setFeeStructureId}
            />
          </FilterBar>

          {/* The four filters above are read from four separate endpoints, and
              a picker that silently offers no options is indistinguishable from
              a school with no terms. Named where they sit, since the report
              underneath still works unnarrowed. */}
          {yearsQuery.isError ? (
            <LoadError
              what="the academic years"
              error={yearsQuery.error}
              onRetry={() => void yearsQuery.refetch()}
            />
          ) : null}
          {termsQuery.isError ? (
            <LoadError
              what="the terms"
              error={termsQuery.error}
              onRetry={() => void termsQuery.refetch()}
            />
          ) : null}
          {classesQuery.isError ? (
            <LoadError
              what="the year groups"
              error={classesQuery.error}
              onRetry={() => void classesQuery.refetch()}
            />
          ) : null}
          {structuresQuery.isError ? (
            <LoadError
              what="the fee structures"
              error={structuresQuery.error}
              onRetry={() => void structuresQuery.refetch()}
            />
          ) : null}

          {collectionsQuery.error ? (
            <LoadError
              what="the collections report"
              error={collectionsQuery.error}
              onRetry={() => void collectionsQuery.refetch()}
            />
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-4">
              {collections.length > 0 ? (
                <TradingViewChartCard
                  title="Collections by term"
                  data={collections.map((row) => ({
                    label: row.termName,
                    invoiced: row.invoiced,
                    collected: row.collected,
                  }))}
                  xKey="label"
                  series={[
                    { key: "invoiced", label: "Invoiced", type: "bar", color: "var(--chart-1)" },
                    {
                      key: "collected",
                      label: "Collected",
                      type: "bar",
                      color: "var(--chart-passing)",
                    },
                  ]}
                  valueFormatter={(value) => formatSchoolMoney(Number(value))}
                />
              ) : null}

              {collectionsQuery.isPending ? (
                <TableRowsSkeleton
                  headers={[
                    "Term",
                    "Invoiced",
                    "Collected",
                    "Collection rate",
                    "Receipts",
                  ]}
                  columns={[
                    { twoLine: true },
                    { width: 110, align: "right" },
                    { width: 110, align: "right" },
                    { width: 110, align: "right", badge: true },
                    { width: 80, align: "right" },
                  ]}
                />
              ) : collectionsQuery.error ? null : (
                <DataTable
                  data={collections}
                  columns={collectionsColumns}
                  searchPlaceholder="Search terms"
                  searchSubmitLabel="Search"
                  pagination={{ enabled: true }}
                  emptyState={
                    collectionsNarrowing.length > 0 ? (
                      <NothingMatched
                        what="terms"
                        filters={collectionsNarrowing}
                        onClear={clearCollections}
                      />
                    ) : (
                      <NothingYet
                        title="Nothing has been billed yet"
                        body="Issue a fee invoice and the term it belongs to appears here with what came back against it."
                      />
                    )
                  }
                />
              )}
            </div>

            <div className="space-y-4">
              <Card
                title={termInView ? termInView.termName : "Nothing in view"}
                subtitle="in view"
                className="h-fit"
              >
                {termInView ? (
                  <>
                    <dl className="space-y-1.5">
                      <PanelLine
                        label="Invoiced"
                        value={formatSchoolMoney(termInView.invoiced)}
                      />
                      <PanelLine
                        label="Collected"
                        value={formatSchoolMoney(termInView.collected)}
                      />
                      <PanelLine
                        label="Still owing"
                        value={formatSchoolMoney(
                          Math.max(termInView.invoiced - termInView.collected, 0),
                        )}
                        tone="danger"
                      />
                      <PanelLine
                        label="Receipts written"
                        value={whole(termInView.receiptsCount)}
                      />
                      <PanelLine
                        label="Average receipt"
                        value={
                          termInView.receiptsCount > 0
                            ? formatSchoolMoney(
                                termInView.collected / termInView.receiptsCount,
                              )
                            : "—"
                        }
                      />
                    </dl>
                    <p className="mt-3 text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                      {describeAgainstTheRest(termInView, collections)}
                    </p>
                  </>
                ) : (
                  <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                    No term matches the filters in force.
                  </p>
                )}
              </Card>

              <Card title="By year group" className="h-fit">
                {byYearGroup.length === 0 ? (
                  <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                    Nothing has been billed to a year group in this view.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {byYearGroup.map((row) => (
                      <li key={row.classId || row.className} className="space-y-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[length:var(--type-body-sm)] text-[color:var(--text-body)]">
                            {row.className}
                          </span>
                          <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-body-sm)] font-bold tabular-nums text-[color:var(--text-strong)]">
                            {percent(row.collectionRate, row.invoiced)}
                          </span>
                        </div>
                        <Meter
                          percent={row.collectionRate}
                          tone={rateTone(row.collectionRate, row.invoiced)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </div>

        {/* Arrears */}
        <div className={activeView === "arrears" ? "space-y-4" : "hidden"}>
          <FilterBar>
            <FilterSelect
              label="Year group"
              allLabel="Every year group"
              value={arrearsClassId}
              options={classes.map((row) => ({ value: row.id, label: row.name }))}
              onChange={(value) => {
                setArrearsClassId(value);
                // A stream belongs to one year group; keeping it across a change
                // of group narrows to a set that cannot exist.
                setStreamId("");
              }}
            />
            <FilterSelect
              label="Stream"
              allLabel="Every stream"
              value={streamId}
              options={streams}
              onChange={setStreamId}
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
          </FilterBar>

          {arrearsQuery.error ? (
            <LoadError
              what="the arrears report"
              error={arrearsQuery.error}
              onRetry={() => void arrearsQuery.refetch()}
            />
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-4">
              {arrears.length > 0 ? (
                <Card title="How old the debt is">
                  <AgeingStrip amounts={arrearsSummary?.aging} />
                </Card>
              ) : null}

              {arrearsQuery.isPending ? (
                <TableRowsSkeleton
                  headers={[
                    "Pupil",
                    "Total outstanding",
                    ...AGEING_BUCKETS.map((bucket) => bucket.label),
                  ]}
                  columns={[
                    { avatar: true, twoLine: true },
                    // Money, right-aligned in the real row — a left-aligned
                    // skeleton makes six columns jump when the figures land.
                    { width: 110, align: "right" },
                    { width: 90, align: "right" },
                    { width: 90, align: "right" },
                    { width: 90, align: "right" },
                    { width: 90, align: "right" },
                    { width: 90, align: "right" },
                  ]}
                />
              ) : arrearsQuery.error ? null : (
                // The dialog that writes to families sits over this table, and
                // every row here still carries its own Remind while it runs.
                <SavingOverlay saving={sending} label="Sending the reminders…">
                  <DataTable
                    data={arrears}
                    columns={arrearsColumns}
                    searchPlaceholder="Search pupils"
                    searchSubmitLabel="Search"
                    pagination={{ enabled: true }}
                    emptyState={
                      arrearsNarrowing.length > 0 ? (
                        <NothingMatched
                          what="families"
                          filters={arrearsNarrowing}
                          onClear={clearArrears}
                        />
                      ) : rollNow === 0 ? (
                        // No arrears because there is no school yet — a
                        // different sentence from "everybody has paid".
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

            <Card
              title="Where the 90+ sits"
              subtitle="The oldest column, by year group"
              className="h-fit"
            >
              {oldestByYearGroup.rows.length === 0 ? (
                <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                  Nothing in this view has run past ninety days.
                </p>
              ) : (
                <>
                  <dl className="space-y-1.5">
                    {oldestByYearGroup.rows.map(([name, amount]) => (
                      <PanelLine key={name} label={name} value={formatSchoolMoney(amount)} />
                    ))}
                  </dl>
                  <p className="mt-3 text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                    {oldestByYearGroup.families}{" "}
                    {oldestByYearGroup.families === 1 ? "family carries" : "families carry"}{" "}
                    the whole 90+ column. That is the list worth ringing.
                  </p>
                </>
              )}
            </Card>
          </div>
        </div>

        {/* Enrolment */}
        <div className={activeView === "enrollment" ? "space-y-4" : "hidden"}>
          {enrollmentQuery.error ? (
            <LoadError
              what="the enrolment report"
              error={enrollmentQuery.error}
              onRetry={() => void enrollmentQuery.refetch()}
            />
          ) : null}

          {enrollment.length > 0 ? (
            <TradingViewChartCard
              title="Enrolment over the year"
              data={enrollment.map((row) => ({
                label: row.termName,
                boardingCount: row.boardingCount,
                dayCount: row.dayCount,
              }))}
              xKey="label"
              series={[
                {
                  key: "boardingCount",
                  label: "Boarding",
                  type: "bar",
                  color: "var(--chart-in-review)",
                },
                { key: "dayCount", label: "Day", type: "bar", color: "var(--chart-2)" },
              ]}
              valueFormatter={(value) => whole(Number(value))}
            />
          ) : null}

          {enrollmentQuery.isPending ? (
            <TableRowsSkeleton
              headers={["Term", "Total enrolled", "Boarding", "Day", "Boys", "Girls"]}
              columns={[
                { twoLine: true },
                { width: 100, align: "right" },
                { width: 90, align: "right" },
                { width: 90, align: "right" },
                { width: 80, align: "right" },
                { width: 80, align: "right" },
              ]}
            />
          ) : enrollmentQuery.error ? null : (
            <DataTable
              data={enrollment}
              columns={enrollmentColumns}
              searchPlaceholder="Search terms"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              emptyState={
                <NothingYet
                  title="No term has an enrolment yet"
                  body="Enrol pupils against a term and its roll, boarders and day pupils appear here."
                />
              }
            />
          )}
        </div>

        {/* Occupancy */}
        <div className={activeView === "occupancy" ? "space-y-4" : "hidden"}>
          {occupancyQuery.error ? (
            <LoadError
              what="the occupancy report"
              error={occupancyQuery.error}
              onRetry={() => void occupancyQuery.refetch()}
            />
          ) : null}

          {occupancy.length > 0 ? (
            <TradingViewChartCard
              title="Occupancy by hostel"
              data={occupancy.map((row) => ({
                label: row.hostelName,
                occupiedBeds: row.occupiedBeds,
                totalBeds: row.totalBeds,
              }))}
              xKey="label"
              series={[
                {
                  key: "occupiedBeds",
                  label: "Occupied",
                  type: "bar",
                  color: "var(--chart-passing)",
                },
                {
                  key: "totalBeds",
                  label: "Total capacity",
                  type: "bar",
                  color: "var(--chart-pending)",
                },
              ]}
              valueFormatter={(value) => whole(Number(value))}
            />
          ) : null}

          {occupancyQuery.isPending ? (
            <TableRowsSkeleton
              headers={[
                "Hostel",
                "Total beds",
                "Occupied",
                "Available",
                "Occupancy rate",
                "Rooms",
              ]}
              columns={[
                { twoLine: true },
                { width: 90, align: "right" },
                { width: 90, align: "right" },
                { width: 90, align: "right" },
                { width: 110, align: "right", badge: true },
                { width: 80, align: "right" },
              ]}
            />
          ) : occupancyQuery.error ? null : (
            <DataTable
              data={occupancy}
              columns={occupancyColumns}
              searchPlaceholder="Search hostels"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              emptyState={
                <NothingYet
                  title="No hostels have been set up"
                  body="Add a hostel under Boarding and its beds and occupancy appear here."
                />
              }
            />
          )}
        </div>
      </VerticalDataViews>

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
    </div>
  );
}

function PanelLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
        {label}
      </dt>
      <dd
        className={
          tone === "danger"
            ? "font-[family-name:var(--font-mono)] text-[length:var(--type-body-sm)] font-bold tabular-nums text-[color:var(--tone-danger)]"
            : "font-[family-name:var(--font-mono)] text-[length:var(--type-body-sm)] font-bold tabular-nums text-[color:var(--text-strong)]"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function Meter({
  percent: value,
  tone,
}: {
  percent: number;
  /** Absent when there is nothing to rate: the track stays empty rather than red. */
  tone?: "success" | "warn" | "danger";
}) {
  const fill =
    tone === "success"
      ? "bg-[color:var(--tone-success)]"
      : tone === "warn"
        ? "bg-[color:var(--tone-warn)]"
        : tone === "danger"
          ? "bg-[color:var(--tone-danger)]"
          : "bg-[color:var(--surface-muted)]";
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--surface-muted)]">
      <div
        className={`h-full rounded-full ${fill}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/**
 * The sentence under the panel: how the term in view compares with the ones
 * before it. A number on its own does not say whether 69% is a bad week or a
 * catastrophe; the other four terms do.
 */
function describeAgainstTheRest(term: CollectionsRow, all: CollectionsRow[]) {
  const others = all.filter((row) => row.termId !== term.termId);
  if (others.length === 0) {
    return "There is no earlier term to compare this against yet.";
  }
  const average =
    others.reduce((total, row) => total + row.collectionRate, 0) / others.length;
  const gap = Math.round(average - term.collectionRate);
  if (gap <= 1) {
    return `Every other term averaged ${Math.round(average)}%. This one is holding up.`;
  }
  return `Every other term averaged ${Math.round(average)}%. This one is ${gap} points behind.`;
}

"use client";

import { useState, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { getApiErrorMessage } from "@/lib/api-client";
import { rechartsDefaults } from "@/lib/charts/theme";

// ============================================================================
// Types
// ============================================================================

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

type EnrollmentRow = {
  period: string;
  termId: string;
  termName: string;
  totalEnrolled: number;
  boardingCount: number;
  dayCount: number;
  maleCount: number;
  femaleCount: number;
  classBreakdown: Array<{
    classId: string;
    className: string;
    count: number;
  }>;
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

// ============================================================================
// API Functions
// ============================================================================

async function fetchCollectionsReport() {
  const response = await fetch("/api/v2/schools/reports/collections");
  if (!response.ok) throw new Error("Failed to fetch collections report");
  return response.json();
}

async function fetchArrearsReport() {
  const response = await fetch("/api/v2/schools/reports/arrears");
  if (!response.ok) throw new Error("Failed to fetch arrears report");
  return response.json();
}

async function fetchEnrollmentReport() {
  const response = await fetch("/api/v2/schools/reports/enrollment");
  if (!response.ok) throw new Error("Failed to fetch enrollment report");
  return response.json();
}

async function fetchOccupancyReport() {
  const response = await fetch("/api/v2/schools/reports/occupancy");
  if (!response.ok) throw new Error("Failed to fetch occupancy report");
  return response.json();
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

// ============================================================================
// Component
// ============================================================================

export function SchoolsReportsEnhancedContent() {
  const [activeView, setActiveView] = useState<ReportView>("collections");

  const collectionsQuery = useQuery({
    queryKey: ["schools", "reports", "collections"],
    queryFn: fetchCollectionsReport,
  });

  const arrearsQuery = useQuery({
    queryKey: ["schools", "reports", "arrears"],
    queryFn: fetchArrearsReport,
  });

  const enrollmentQuery = useQuery({
    queryKey: ["schools", "reports", "enrollment"],
    queryFn: fetchEnrollmentReport,
  });

  const occupancyQuery = useQuery({
    queryKey: ["schools", "reports", "occupancy"],
    queryFn: fetchOccupancyReport,
  });

  const collectionsData = useMemo(
    () => (collectionsQuery.data?.data ?? []) as CollectionsRow[],
    [collectionsQuery.data],
  );
  const arrearsData = useMemo(
    () => (arrearsQuery.data?.data ?? []) as ArrearsRow[],
    [arrearsQuery.data],
  );
  const enrollmentData = useMemo(
    () => (enrollmentQuery.data?.data ?? []) as EnrollmentRow[],
    [enrollmentQuery.data],
  );
  const occupancyData = useMemo(
    () => (occupancyQuery.data?.data ?? []) as OccupancyRow[],
    [occupancyQuery.data],
  );

  // Collections columns
  const collectionsColumns = useMemo<ColumnDef<CollectionsRow>[]>(
    () => [
      {
        id: "term",
        header: "Term",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.termName}</div>
            <div className="text-xs text-muted-foreground font-mono">{row.original.period}</div>
          </div>
        ),
      },
      {
        id: "invoiced",
        header: "Invoiced",
        cell: ({ row }) => <NumericCell>{formatCurrency(row.original.invoiced)}</NumericCell>,
      },
      {
        id: "collected",
        header: "Collected",
        cell: ({ row }) => <NumericCell>{formatCurrency(row.original.collected)}</NumericCell>,
      },
      {
        id: "collectionRate",
        header: "Collection Rate",
        cell: ({ row }) => (
          <NumericCell>
            <Badge
              variant={
                row.original.collectionRate >= 80
                  ? "default"
                  : row.original.collectionRate >= 60
                    ? "secondary"
                    : "outline"
              }
            >
              {formatPercent(row.original.collectionRate)}
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

  // Arrears columns
  const arrearsColumns = useMemo<ColumnDef<ArrearsRow>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.studentName}</div>
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.studentNo} • {row.original.className}
            </div>
          </div>
        ),
      },
      {
        id: "totalOutstanding",
        header: "Total Outstanding",
        cell: ({ row }) => (
          <NumericCell className="font-semibold">
            {formatCurrency(row.original.totalOutstanding)}
          </NumericCell>
        ),
      },
      {
        id: "current",
        header: "Current",
        cell: ({ row }) => <NumericCell>{formatCurrency(row.original.current)}</NumericCell>,
      },
      {
        id: "days30",
        header: "1-30 Days",
        cell: ({ row }) => <NumericCell>{formatCurrency(row.original.days30)}</NumericCell>,
      },
      {
        id: "days60",
        header: "31-60 Days",
        cell: ({ row }) => <NumericCell>{formatCurrency(row.original.days60)}</NumericCell>,
      },
      {
        id: "days90",
        header: "61-90 Days",
        cell: ({ row }) => <NumericCell>{formatCurrency(row.original.days90)}</NumericCell>,
      },
      {
        id: "days120Plus",
        header: "90+ Days",
        cell: ({ row }) => (
          <NumericCell className="text-destructive font-semibold">
            {formatCurrency(row.original.days120Plus)}
          </NumericCell>
        ),
      },
    ],
    [],
  );

  // Enrollment columns
  const enrollmentColumns = useMemo<ColumnDef<EnrollmentRow>[]>(
    () => [
      {
        id: "term",
        header: "Term",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.termName}</div>
            <div className="text-xs text-muted-foreground font-mono">{row.original.period}</div>
          </div>
        ),
      },
      {
        id: "totalEnrolled",
        header: "Total Enrolled",
        cell: ({ row }) => (
          <NumericCell className="font-semibold">{row.original.totalEnrolled}</NumericCell>
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
        header: "Male",
        cell: ({ row }) => <NumericCell>{row.original.maleCount}</NumericCell>,
      },
      {
        id: "female",
        header: "Female",
        cell: ({ row }) => <NumericCell>{row.original.femaleCount}</NumericCell>,
      },
    ],
    [],
  );

  // Occupancy columns
  const occupancyColumns = useMemo<ColumnDef<OccupancyRow>[]>(
    () => [
      {
        id: "hostel",
        header: "Hostel",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.hostelName}</div>
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.hostelCode} • {row.original.genderPolicy}
            </div>
          </div>
        ),
      },
      {
        id: "totalBeds",
        header: "Total Beds",
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
        header: "Occupancy Rate",
        cell: ({ row }) => (
          <NumericCell>
            <Badge
              variant={
                row.original.occupancyRate >= 85
                  ? "destructive"
                  : row.original.occupancyRate >= 70
                    ? "secondary"
                    : "outline"
              }
            >
              {formatPercent(row.original.occupancyRate)}
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

  const hasError =
    collectionsQuery.error || arrearsQuery.error || enrollmentQuery.error || occupancyQuery.error;

  const handleExport = (format: "csv" | "pdf") => {
    const reportType = activeView;
    const url = `/api/v2/schools/reports/export?reportType=${reportType}&format=${format}`;
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-6">
      {hasError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load reports</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(
              collectionsQuery.error ||
                arrearsQuery.error ||
                enrollmentQuery.error ||
                occupancyQuery.error,
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Summary Cards */}
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface-base p-4">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
            Collection Rate
          </h3>
          <p className="text-2xl font-bold tabular-nums">
            {collectionsQuery.data?.summary?.overallCollectionRate
              ? formatPercent(collectionsQuery.data.summary.overallCollectionRate)
              : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-base p-4">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
            Students with Arrears
          </h3>
          <p className="text-2xl font-bold tabular-nums">
            {arrearsQuery.data?.summary?.studentsWithArrears ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-base p-4">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
            Avg Enrollment
          </h3>
          <p className="text-2xl font-bold tabular-nums">
            {enrollmentQuery.data?.summary?.averageEnrollment ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-base p-4">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
            Hostel Occupancy
          </h3>
          <p className="text-2xl font-bold tabular-nums">
            {occupancyQuery.data?.summary?.overallOccupancyRate
              ? formatPercent(occupancyQuery.data.summary.overallOccupancyRate)
              : "—"}
          </p>
        </div>
      </section>

      {/* Export Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
          Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
          Export PDF
        </Button>
      </div>

      {/* Tabs and Tables */}
      <VerticalDataViews
        items={[
          { id: "collections", label: "Collections", count: collectionsData.length },
          { id: "arrears", label: "Arrears Aging", count: arrearsData.length },
          { id: "enrollment", label: "Enrollment", count: enrollmentData.length },
          { id: "occupancy", label: "Hostel Occupancy", count: occupancyData.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as ReportView)}
        railLabel="Report Views"
      >
        {/* Collections View */}
        <div className={activeView === "collections" ? "space-y-4" : "hidden"}>
          <h2 className="text-section-title">Fee Collections Report</h2>

          {/* Collections Chart */}
          {collectionsData.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-base p-4">
              <h3 className="text-sm font-semibold mb-4">Collections by Term</h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={collectionsData}>
                  <CartesianGrid {...rechartsDefaults.cartesianGrid} />
                  <XAxis
                    dataKey="termName"
                    {...rechartsDefaults.xAxis}
                  />
                  <YAxis {...rechartsDefaults.yAxis} />
                  <Tooltip {...rechartsDefaults.tooltip} />
                  <Legend {...rechartsDefaults.legend} />
                  <Bar
                    dataKey="invoiced"
                    name="Invoiced"
                    fill="var(--chart-1)"
                    radius={rechartsDefaults.bar.radius}
                  />
                  <Bar
                    dataKey="collected"
                    name="Collected"
                    fill="var(--chart-passing)"
                    radius={rechartsDefaults.bar.radius}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <DataTable
            data={collectionsData}
            columns={collectionsColumns}
            searchPlaceholder="Search terms"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              collectionsQuery.isLoading ? "Loading collections..." : "No collections data available."
            }
          />
        </div>

        {/* Arrears View */}
        <div className={activeView === "arrears" ? "space-y-4" : "hidden"}>
          <h2 className="text-section-title">Arrears Aging Report</h2>

          {/* Arrears Chart */}
          {arrearsData.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-base p-4">
              <h3 className="text-sm font-semibold mb-4">Aging Distribution</h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={[
                    {
                      name: "Current",
                      value: arrearsQuery.data?.summary?.aging?.current ?? 0,
                    },
                    {
                      name: "1-30 Days",
                      value: arrearsQuery.data?.summary?.aging?.days30 ?? 0,
                    },
                    {
                      name: "31-60 Days",
                      value: arrearsQuery.data?.summary?.aging?.days60 ?? 0,
                    },
                    {
                      name: "61-90 Days",
                      value: arrearsQuery.data?.summary?.aging?.days90 ?? 0,
                    },
                    {
                      name: "90+ Days",
                      value: arrearsQuery.data?.summary?.aging?.days120Plus ?? 0,
                    },
                  ]}
                >
                  <CartesianGrid {...rechartsDefaults.cartesianGrid} />
                  <XAxis dataKey="name" {...rechartsDefaults.xAxis} />
                  <YAxis {...rechartsDefaults.yAxis} />
                  <Tooltip {...rechartsDefaults.tooltip} />
                  <Bar
                    dataKey="value"
                    name="Amount"
                    fill="var(--chart-need-changes)"
                    radius={rechartsDefaults.bar.radius}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <DataTable
            data={arrearsData}
            columns={arrearsColumns}
            searchPlaceholder="Search students"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              arrearsQuery.isLoading ? "Loading arrears..." : "No students with arrears."
            }
          />
        </div>

        {/* Enrollment View */}
        <div className={activeView === "enrollment" ? "space-y-4" : "hidden"}>
          <h2 className="text-section-title">Enrollment Statistics</h2>

          {/* Enrollment Chart */}
          {enrollmentData.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-base p-4">
              <h3 className="text-sm font-semibold mb-4">Enrollment Trends</h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={enrollmentData}>
                  <CartesianGrid {...rechartsDefaults.cartesianGrid} />
                  <XAxis dataKey="termName" {...rechartsDefaults.xAxis} />
                  <YAxis {...rechartsDefaults.yAxis} />
                  <Tooltip {...rechartsDefaults.tooltip} />
                  <Legend {...rechartsDefaults.legend} />
                  <Bar
                    dataKey="boardingCount"
                    name="Boarding"
                    fill="var(--chart-in-review)"
                    radius={rechartsDefaults.bar.radius}
                  />
                  <Bar
                    dataKey="dayCount"
                    name="Day"
                    fill="var(--chart-2)"
                    radius={rechartsDefaults.bar.radius}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <DataTable
            data={enrollmentData}
            columns={enrollmentColumns}
            searchPlaceholder="Search terms"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              enrollmentQuery.isLoading
                ? "Loading enrollment..."
                : "No enrollment data available."
            }
          />
        </div>

        {/* Occupancy View */}
        <div className={activeView === "occupancy" ? "space-y-4" : "hidden"}>
          <h2 className="text-section-title">Hostel Occupancy Report</h2>

          {/* Occupancy Chart */}
          {occupancyData.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-base p-4">
              <h3 className="text-sm font-semibold mb-4">Occupancy by Hostel</h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={occupancyData}>
                  <CartesianGrid {...rechartsDefaults.cartesianGrid} />
                  <XAxis dataKey="hostelName" {...rechartsDefaults.xAxis} />
                  <YAxis {...rechartsDefaults.yAxis} />
                  <Tooltip {...rechartsDefaults.tooltip} />
                  <Legend {...rechartsDefaults.legend} />
                  <Bar
                    dataKey="occupiedBeds"
                    name="Occupied"
                    fill="var(--chart-passing)"
                    radius={rechartsDefaults.bar.radius}
                  />
                  <Bar
                    dataKey="totalBeds"
                    name="Total Capacity"
                    fill="var(--chart-pending)"
                    radius={rechartsDefaults.bar.radius}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <DataTable
            data={occupancyData}
            columns={occupancyColumns}
            searchPlaceholder="Search hostels"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              occupancyQuery.isLoading ? "Loading occupancy..." : "No hostels available."
            }
          />
        </div>
      </VerticalDataViews>
    </div>
  );
}

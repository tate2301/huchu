"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";

import { AdminTrendChart, type AdminChartSeries } from "@/components/charts/admin-headless-charts";
import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { StatusState } from "@/components/shared/status-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { ExportMenu } from "@/components/ui/export-menu";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchJson } from "@/lib/api-client";
import type { DocumentExportFormat } from "@/lib/documents/export-client";

type SnapshotWindowMode = "day" | "week" | "month" | "all";

type SnapshotTrendRow = {
  label: string;
  purchaseWeight: number;
  saleWeight: number;
  purchaseValue: number;
  saleValue: number;
  margin: number;
  tickets: number;
  varianceKg: number;
  saleCount: number;
};

type DashboardPayload = {
  window: {
    mode: SnapshotWindowMode;
    label: string;
    anchorDate: string;
    startDate: string | null;
    endDate: string;
  };
  summary: {
    purchasesThisMonthWeight: number;
    purchasesThisMonthValue: number;
    salesThisMonthWeight: number;
    salesThisMonthValue: number;
    estimatedMarginThisMonth: number;
    ticketsProcessedToday: number;
    ticketsProcessedPerHour: number;
    pendingSupplierPaymentsCount: number;
    pendingSupplierPaymentsAmount: number;
    marginPercent: number;
    marginPerKg: number;
  };
  snapshotTrend: {
    granularity: "hour" | "day" | "month";
    rows: SnapshotTrendRow[];
  };
};

const MONEY_SERIES: AdminChartSeries[] = [
  { key: "purchaseValue", label: "Spend", kind: "line", color: "var(--danger-500)" },
  { key: "saleValue", label: "Revenue", kind: "line", color: "var(--success-500)" },
  { key: "margin", label: "Margin", kind: "line", color: "var(--primary-500)" },
];

const WEIGHT_SERIES: AdminChartSeries[] = [
  { key: "purchaseWeight", label: "Weight In", kind: "line", color: "var(--accent-500)" },
  { key: "saleWeight", label: "Weight Out", kind: "line", color: "var(--info-500)" },
];

function formatMoney(value: number) {
  return `USD ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatKg(value: number) {
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
}

function escapeCsv(value: string | number) {
  return `"${String(value).replace(/"/g, "\"\"")}"`;
}

function downloadCsv(name: string, rows: Array<Record<string, string | number>>) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header] ?? "")).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function exportSnapshotPdf(input: {
  fileName: string;
  title: string;
  windowLabel: string;
  dateLabel: string;
  summaryRows: Array<{ label: string; value: string }>;
  trendRows: SnapshotTrendRow[];
}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const padding = 30;
  const mutedText: [number, number, number] = [107, 114, 128];
  const darkText: [number, number, number] = [17, 24, 39];
  const surface: [number, number, number] = [248, 250, 252];
  const panel: [number, number, number] = [241, 245, 249];
  const border: [number, number, number] = [226, 232, 240];

  doc.setFillColor(...surface);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  doc.setTextColor(...darkText);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(input.title, padding, 38);

  doc.setTextColor(...mutedText);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`${input.windowLabel} • ${input.dateLabel}`, padding, 56);

  const cardTop = 76;
  const cardHeight = 76;
  const cardGap = 12;
  const cardsPerRow = 4;
  const cardWidth = (pageWidth - padding * 2 - cardGap * (cardsPerRow - 1)) / cardsPerRow;

  input.summaryRows.slice(0, 4).forEach((row, index) => {
    const x = padding + index * (cardWidth + cardGap);
    doc.setFillColor(...panel);
    doc.setDrawColor(...border);
    doc.roundedRect(x, cardTop, cardWidth, cardHeight, 8, 8, "FD");
    doc.setTextColor(...mutedText);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(row.label, x + 12, cardTop + 22);
    doc.setTextColor(...darkText);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(row.value, x + 12, cardTop + 50);
  });

  const tableTop = cardTop + cardHeight + 24;
  const tableWidth = pageWidth - padding * 2;
  const columns = [
    { key: "label", title: "Period", width: 92 },
    { key: "purchaseValue", title: "Spend", width: 102 },
    { key: "saleValue", title: "Revenue", width: 102 },
    { key: "margin", title: "Margin", width: 102 },
    { key: "purchaseWeight", title: "In (kg)", width: 90 },
    { key: "saleWeight", title: "Out (kg)", width: 90 },
    { key: "tickets", title: "Tickets", width: 70 },
    { key: "varianceKg", title: "Variance", width: 90 },
  ];

  doc.setFillColor(...panel);
  doc.setDrawColor(...border);
  doc.roundedRect(padding, tableTop, tableWidth, 26, 6, 6, "FD");

  let xCursor = padding + 10;
  doc.setTextColor(...darkText);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  for (const column of columns) {
    doc.text(column.title, xCursor, tableTop + 17);
    xCursor += column.width;
  }

  let yCursor = tableTop + 26;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  for (const row of input.trendRows.slice(0, 18)) {
    yCursor += 22;
    if (yCursor > pageHeight - 24) break;
    doc.setDrawColor(...border);
    doc.line(padding, yCursor - 14, pageWidth - padding, yCursor - 14);

    const rowValues: Array<string | number> = [
      row.label,
      row.purchaseValue.toFixed(2),
      row.saleValue.toFixed(2),
      row.margin.toFixed(2),
      row.purchaseWeight.toFixed(2),
      row.saleWeight.toFixed(2),
      row.tickets,
      row.varianceKg.toFixed(2),
    ];

    let rowX = padding + 10;
    rowValues.forEach((value, index) => {
      doc.setTextColor(index === 3 ? 30 : darkText[0], index === 3 ? 128 : darkText[1], index === 3 ? 95 : darkText[2]);
      doc.text(String(value), rowX, yCursor);
      rowX += columns[index]?.width ?? 90;
    });
  }

  doc.save(`${input.fileName}.pdf`);
}

export default function ScrapDailySnapshotPage() {
  const [windowMode, setWindowMode] = useState<SnapshotWindowMode>("day");
  const [anchorDate, setAnchorDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [exportingFormat, setExportingFormat] = useState<DocumentExportFormat | null>(null);

  const query = useQuery({
    queryKey: ["scrap-daily-snapshot", windowMode, anchorDate],
    queryFn: () =>
      fetchJson<DashboardPayload>(
        `/api/scrap-metal/dashboard?window=${encodeURIComponent(windowMode)}&anchorDate=${encodeURIComponent(anchorDate)}`,
      ),
  });

  const summary = query.data?.summary;
  const trendRows = useMemo(() => query.data?.snapshotTrend.rows ?? [], [query.data?.snapshotTrend.rows]);
  const windowLabel = query.data?.window.label ?? "Daily";
  const exportBaseName = `scrap-snapshot-${windowMode}-${anchorDate}`;

  const summaryRows = useMemo(
    () => [
      { label: "Spend", value: formatMoney(summary?.purchasesThisMonthValue ?? 0) },
      { label: "Revenue", value: formatMoney(summary?.salesThisMonthValue ?? 0) },
      { label: "Margin", value: formatMoney(summary?.estimatedMarginThisMonth ?? 0) },
      { label: "Tickets", value: String(summary?.ticketsProcessedToday ?? 0) },
      { label: "Weight In", value: formatKg(summary?.purchasesThisMonthWeight ?? 0) },
      { label: "Weight Out", value: formatKg(summary?.salesThisMonthWeight ?? 0) },
      { label: "Margin / kg", value: formatMoney(summary?.marginPerKg ?? 0) },
      { label: "Margin %", value: `${(summary?.marginPercent ?? 0).toFixed(2)}%` },
    ],
    [summary],
  );

  const csvRows = useMemo(() => {
    const metricRows = summaryRows.map((row) => ({
      section: "Summary",
      period: "",
      metric: row.label,
      value: row.value,
    }));
    const trendExportRows = trendRows.map((row) => ({
      section: "Trend",
      period: row.label,
      spend: row.purchaseValue.toFixed(2),
      revenue: row.saleValue.toFixed(2),
      margin: row.margin.toFixed(2),
      weightInKg: row.purchaseWeight.toFixed(2),
      weightOutKg: row.saleWeight.toFixed(2),
      tickets: row.tickets,
      varianceKg: row.varianceKg.toFixed(2),
    }));
    return [...metricRows, ...trendExportRows];
  }, [summaryRows, trendRows]);

  const trendColumns = useMemo<ColumnDef<SnapshotTrendRow>[]>(
    () => [
      { id: "label", header: "Period", accessorKey: "label", size: 120 },
      { id: "purchaseValue", header: "Spend", cell: ({ row }) => <NumericCell>{formatMoney(row.original.purchaseValue)}</NumericCell>, size: 130 },
      { id: "saleValue", header: "Revenue", cell: ({ row }) => <NumericCell>{formatMoney(row.original.saleValue)}</NumericCell>, size: 130 },
      { id: "margin", header: "Margin", cell: ({ row }) => <NumericCell>{formatMoney(row.original.margin)}</NumericCell>, size: 130 },
      { id: "purchaseWeight", header: "In (kg)", cell: ({ row }) => <NumericCell>{row.original.purchaseWeight.toFixed(2)}</NumericCell>, size: 100 },
      { id: "saleWeight", header: "Out (kg)", cell: ({ row }) => <NumericCell>{row.original.saleWeight.toFixed(2)}</NumericCell>, size: 100 },
      { id: "tickets", header: "Tickets", cell: ({ row }) => <NumericCell>{row.original.tickets}</NumericCell>, size: 80 },
      { id: "varianceKg", header: "Variance (kg)", cell: ({ row }) => <NumericCell>{row.original.varianceKg.toFixed(2)}</NumericCell>, size: 110 },
    ],
    [],
  );

  async function handleExport(format: DocumentExportFormat) {
    if (!summary) return;
    setExportingFormat(format);
    try {
      if (format === "csv") {
        downloadCsv(exportBaseName, csvRows);
        return;
      }
      await exportSnapshotPdf({
        fileName: exportBaseName,
        title: "Scrap Snapshot",
        windowLabel,
        dateLabel: anchorDate,
        summaryRows,
        trendRows,
      });
    } finally {
      setExportingFormat(null);
    }
  }

  if (query.error) {
    return (
      <ScrapShell title="Daily Snapshot">
        <StatusState variant="error" title="Unable to load daily snapshot" />
      </ScrapShell>
    );
  }

  return (
    <ScrapShell
      title="Daily Snapshot"
      actions={
        <div className="flex flex-wrap gap-2">
          <ExportMenu
            label="Export Snapshot"
            exportingFormat={exportingFormat}
            disabled={!summary}
            onExport={(format) => void handleExport(format)}
          />
          <Button asChild size="sm" variant="outline">
            <Link href="/scrap-metal/reports">Open Full Reports</Link>
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] p-3">
        <div className="min-w-[180px] space-y-1">
          <div className="text-xs text-muted-foreground">Snapshot Window</div>
          <Select value={windowMode} onValueChange={(value) => setWindowMode(value as SnapshotWindowMode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[180px] space-y-1">
          <div className="text-xs text-muted-foreground">Anchor Date</div>
          <Input type="date" value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} />
        </div>
        <div className="text-xs text-muted-foreground">
          {query.data?.window.startDate
            ? `${query.data.window.startDate} to ${query.data.window.endDate}`
            : `Up to ${query.data?.window.endDate ?? anchorDate}`}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Spend</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-xl">{formatMoney(summary?.purchasesThisMonthValue ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Revenue</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-xl">{formatMoney(summary?.salesThisMonthValue ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Margin</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-xl">{formatMoney(summary?.estimatedMarginThisMonth ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tickets Processed</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-xl">{summary?.ticketsProcessedToday ?? 0}</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Financial Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminTrendChart
              rows={trendRows}
              series={MONEY_SERIES}
              height={260}
              valueFormatter={(value) => value.toFixed(2)}
              yTickFormatter={(value) => value.toFixed(0)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Weight Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminTrendChart
              rows={trendRows}
              series={WEIGHT_SERIES}
              height={260}
              valueFormatter={(value) => value.toFixed(2)}
              yTickFormatter={(value) => value.toFixed(0)}
            />
          </CardContent>
        </Card>
      </div>

      <DataTable
        data={trendRows}
        columns={trendColumns}
        searchPlaceholder="Search periods"
        pagination={{ enabled: true }}
        emptyState={query.isLoading ? "Loading trend..." : "No trend data for this period."}
      />
    </ScrapShell>
  );
}

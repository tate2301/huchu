"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeading } from "@/components/layout/page-heading";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchAttendance,
  fetchCCTVEvents,
  fetchDowntimeAnalytics,
  fetchGoldDispatches,
  fetchGoldPours,
  fetchGoldReceipts,
  fetchIncidents,
  fetchPlantReports,
  fetchShiftReports,
  fetchSites,
  fetchStockMovements,
  fetchWorkOrders,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { exportElementToPdf } from "@/lib/pdf";

type ReportType =
  | "operations"
  | "attendance"
  | "stores"
  | "gold"
  | "compliance"
  | "maintenance"
  | "cctv";

const REPORT_LABELS: Record<ReportType, string> = {
  operations: "Operations",
  attendance: "Attendance",
  stores: "Stores Movements",
  gold: "Gold Chain",
  compliance: "Compliance Incidents",
  maintenance: "Maintenance Work Orders",
  cctv: "CCTV Events",
};

export default function ReportsPage() {
  const { toast } = useToast();
  const today = new Date();
  const [selectedSite, setSelectedSite] = useState("all");
  const [startDate, setStartDate] = useState(format(subDays(today, 6), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(today, "yyyy-MM-dd"));
  const [selectedReport, setSelectedReport] = useState<ReportType>("operations");
  const [exportingPdf, setExportingPdf] = useState(false);
  const reportPdfRef = useRef<HTMLDivElement>(null);

  const siteFilterId = "reports-site-filter";
  const reportFilterId = "reports-type-filter";
  const startDateFilterId = "reports-start-date-filter";
  const endDateFilterId = "reports-end-date-filter";

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const siteId = selectedSite === "all" ? undefined : selectedSite;

  const { data: plantReports, isLoading: plantLoading, error: plantError } = useQuery({
    queryKey: ["plant-reports", siteId ?? "all", startDate, endDate],
    queryFn: () => fetchPlantReports({ siteId, startDate, endDate, limit: 200 }),
    enabled: !!startDate && !!endDate,
  });

  const { data: shiftReports, isLoading: shiftLoading, error: shiftError } = useQuery({
    queryKey: ["shift-reports", siteId ?? "all", startDate, endDate],
    queryFn: () => fetchShiftReports({ siteId, startDate, endDate, limit: 200 }),
    enabled: !!startDate && !!endDate,
  });

  const { data: attendanceData, isLoading: attendanceLoading, error: attendanceError } = useQuery({
    queryKey: ["attendance", siteId ?? "all", startDate, endDate],
    queryFn: () => fetchAttendance({ siteId, startDate, endDate, limit: 200 }),
    enabled: !!startDate && !!endDate,
  });

  const { data: movementData, isLoading: movementLoading, error: movementError } = useQuery({
    queryKey: ["stock-movements", siteId ?? "all", startDate, endDate],
    queryFn: () => fetchStockMovements({ siteId, page: 1, limit: 200 }),
    enabled: !!startDate && !!endDate,
  });

  const { data: goldPoursData, isLoading: goldPoursLoading, error: goldPoursError } = useQuery({
    queryKey: ["gold-pours", siteId ?? "all"],
    queryFn: () => fetchGoldPours({ siteId, limit: 200 }),
  });

  const { data: goldDispatchesData, isLoading: goldDispatchesLoading, error: goldDispatchesError } = useQuery({
    queryKey: ["gold-dispatches", siteId ?? "all"],
    queryFn: () => fetchGoldDispatches({ siteId, limit: 200 }),
  });

  const { data: goldReceiptsData, isLoading: goldReceiptsLoading, error: goldReceiptsError } = useQuery({
    queryKey: ["gold-receipts", siteId ?? "all"],
    queryFn: () => fetchGoldReceipts({ siteId, limit: 200 }),
  });

  const { data: incidentData, isLoading: incidentLoading, error: incidentError } = useQuery({
    queryKey: ["incidents", siteId ?? "all", startDate, endDate],
    queryFn: () => fetchIncidents({ siteId, startDate, endDate, page: 1, limit: 200 }),
    enabled: !!startDate && !!endDate,
  });

  const { data: workOrderData, isLoading: workOrderLoading, error: workOrderError } = useQuery({
    queryKey: ["work-orders", siteId ?? "all"],
    queryFn: () => fetchWorkOrders({ siteId, page: 1, limit: 200 }),
  });

  const { data: cctvEventData, isLoading: cctvLoading, error: cctvError } = useQuery({
    queryKey: ["cctv-events", startDate, endDate],
    queryFn: () => fetchCCTVEvents({ startDate, endDate, page: 1, limit: 200 }),
    enabled: !!startDate && !!endDate,
  });

  const {
    data: downtimeAnalytics,
    isLoading: downtimeLoading,
    error: downtimeError,
  } = useQuery({
    queryKey: ["downtime-analytics", siteId ?? "", startDate, endDate],
    queryFn: () => fetchDowntimeAnalytics({ siteId: siteId ?? "", startDate, endDate }),
    enabled: !!siteId && !!startDate && !!endDate,
  });

  const plantData = useMemo(() => plantReports?.data ?? [], [plantReports]);
  const shiftData = useMemo(() => shiftReports?.data ?? [], [shiftReports]);
  const attendanceRows = useMemo(() => attendanceData?.data ?? [], [attendanceData]);
  const movementRows = useMemo(() => movementData?.data ?? [], [movementData]);
  const pours = useMemo(() => goldPoursData?.data ?? [], [goldPoursData]);
  const dispatches = useMemo(() => goldDispatchesData?.data ?? [], [goldDispatchesData]);
  const receipts = useMemo(() => goldReceiptsData?.data ?? [], [goldReceiptsData]);
  const incidents = useMemo(() => incidentData?.data ?? [], [incidentData]);
  const workOrders = useMemo(() => workOrderData?.data ?? [], [workOrderData]);
  const cctvEvents = useMemo(() => cctvEventData?.data ?? [], [cctvEventData]);

  const summary = useMemo(
    () =>
      plantData.reduce(
        (acc, report) => {
          acc.tonnesProcessed += report.tonnesProcessed ?? 0;
          acc.goldRecovered += report.goldRecovered ?? 0;
          acc.runHours += report.runHours ?? 0;
          return acc;
        },
        { tonnesProcessed: 0, goldRecovered: 0, runHours: 0 },
      ),
    [plantData],
  );

  const shiftByWorkType = useMemo(() => {
    const totals = new Map<string, { reports: number; crew: number }>();
    shiftData.forEach((row) => {
      const current = totals.get(row.workType) ?? { reports: 0, crew: 0 };
      current.reports += 1;
      current.crew += row.crewCount ?? 0;
      totals.set(row.workType, current);
    });
    return Array.from(totals.entries());
  }, [shiftData]);

  const dispatchByPourId = useMemo(() => {
    const map = new Map<string, (typeof dispatches)[number]>();
    dispatches.forEach((dispatch) => map.set(dispatch.goldPourId, dispatch));
    return map;
  }, [dispatches]);

  const receiptByDispatchId = useMemo(() => {
    const map = new Map<string, (typeof receipts)[number]>();
    receipts.forEach((receipt) => map.set(receipt.goldDispatch.id, receipt));
    return map;
  }, [receipts]);

  const goldChainRows = useMemo(
    () =>
      pours.map((pour) => {
        const dispatch = dispatchByPourId.get(pour.id);
        const receipt = dispatch ? receiptByDispatchId.get(dispatch.id) : undefined;
        const status = receipt ? "RECEIPTED" : dispatch ? "DISPATCHED" : "POURED";
        return {
          pour,
          dispatch,
          receipt,
          status,
        };
      }),
    [dispatchByPourId, pours, receiptByDispatchId],
  );

  const activeSiteName =
    selectedSite === "all"
      ? "All sites"
      : sites?.find((site) => site.id === selectedSite)?.name ?? "Selected site";

  const hasAnyError =
    sitesError ||
    plantError ||
    shiftError ||
    attendanceError ||
    movementError ||
    goldPoursError ||
    goldDispatchesError ||
    goldReceiptsError ||
    incidentError ||
    workOrderError ||
    cctvError ||
    downtimeError;

  const isLoadingAny =
    sitesLoading ||
    plantLoading ||
    shiftLoading ||
    attendanceLoading ||
    movementLoading ||
    goldPoursLoading ||
    goldDispatchesLoading ||
    goldReceiptsLoading ||
    incidentLoading ||
    workOrderLoading ||
    cctvLoading;

  const downloadCsv = (filename: string, rows: Array<Array<string | number>>) => {
    const csv = rows
      .map((row) =>
        row
          .map((value) => {
            const text = String(value ?? "");
            if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
              return `"${text.replace(/"/g, '""')}"`;
            }
            return text;
          })
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    if (selectedReport === "operations") {
      const rows = [
        ["Date", "Site", "Tonnes Processed", "Gold Recovered", "Run Hours", "Downtime Hours"],
        ...plantData.map((report) => {
          const downtimeHours =
            report.downtimeEvents?.reduce((total, event) => total + event.durationHours, 0) ?? 0;
          return [
            format(new Date(report.date), "yyyy-MM-dd"),
            report.site?.name ?? "",
            report.tonnesProcessed ?? 0,
            report.goldRecovered ?? 0,
            report.runHours ?? 0,
            downtimeHours,
          ];
        }),
      ];
      downloadCsv(`operations-${startDate}-to-${endDate}.csv`, rows);
      return;
    }

    if (selectedReport === "attendance") {
      const rows = [
        ["Date", "Site", "Shift", "Employee", "Employee ID", "Status", "Overtime"],
        ...attendanceRows.map((row) => [
          format(new Date(row.date), "yyyy-MM-dd"),
          row.site?.name ?? "",
          row.shift,
          row.employee?.name ?? "",
          row.employee?.employeeId ?? "",
          row.status,
          row.overtime ?? "",
        ]),
      ];
      downloadCsv(`attendance-${startDate}-to-${endDate}.csv`, rows);
      return;
    }

    if (selectedReport === "stores") {
      const rows = [
        ["Date", "Type", "Item", "Quantity", "Unit", "Site", "Issued To", "Requested By"],
        ...movementRows.map((row) => [
          format(new Date(row.createdAt), "yyyy-MM-dd"),
          row.movementType,
          row.item?.name ?? "",
          row.quantity,
          row.unit,
          row.item?.site?.name ?? "",
          row.issuedTo ?? "",
          row.requestedBy ?? "",
        ]),
      ];
      downloadCsv(`stores-${startDate}-to-${endDate}.csv`, rows);
      return;
    }

    if (selectedReport === "gold") {
      const rows = [
        ["Pour Date", "Pour Bar", "Site", "Weight", "Dispatch Date", "Receipt Date", "Status"],
        ...goldChainRows.map((row) => [
          format(new Date(row.pour.pourDate), "yyyy-MM-dd"),
          row.pour.pourBarId,
          row.pour.site?.name ?? "",
          row.pour.grossWeight,
          row.dispatch ? format(new Date(row.dispatch.dispatchDate), "yyyy-MM-dd") : "",
          row.receipt ? format(new Date(row.receipt.receiptDate), "yyyy-MM-dd") : "",
          row.status,
        ]),
      ];
      downloadCsv(`gold-chain-${startDate}-to-${endDate}.csv`, rows);
      return;
    }

    if (selectedReport === "compliance") {
      const rows = [
        ["Date", "Site", "Type", "Severity", "Status", "Reported By"],
        ...incidents.map((row) => [
          format(new Date(row.incidentDate), "yyyy-MM-dd"),
          row.site?.name ?? "",
          row.incidentType,
          row.severity,
          row.status,
          row.reportedBy,
        ]),
      ];
      downloadCsv(`compliance-${startDate}-to-${endDate}.csv`, rows);
      return;
    }

    if (selectedReport === "maintenance") {
      const rows = [
        ["Created", "Site", "Equipment", "Issue", "Status", "Technician"],
        ...workOrders.map((row) => [
          format(new Date(row.createdAt), "yyyy-MM-dd"),
          row.equipment?.site?.name ?? "",
          row.equipment?.name ?? "",
          row.issue,
          row.status,
          row.technician?.name ?? "",
        ]),
      ];
      downloadCsv(`maintenance-${startDate}-to-${endDate}.csv`, rows);
      return;
    }

    const rows = [
      ["Event Time", "Type", "Severity", "Title", "Acknowledged", "Camera"],
      ...cctvEvents.map((row) => [
        format(new Date(row.eventTime), "yyyy-MM-dd HH:mm"),
        row.eventType,
        row.severity,
        row.title,
        row.isAcknowledged ? "Yes" : "No",
        row.camera?.name ?? "",
      ]),
    ];
    downloadCsv(`cctv-${startDate}-to-${endDate}.csv`, rows);
  };

  const handleExportPdf = async () => {
    if (!reportPdfRef.current) return;
    setExportingPdf(true);
    try {
      await exportElementToPdf(
        reportPdfRef.current,
        `${selectedReport}-${startDate}-to-${endDate}.pdf`,
      );
    } catch (error) {
      toast({
        title: "PDF export failed",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const renderSelectedReport = (compact = false) => {
    if (selectedReport === "operations") {
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Tonnes Processed</p>
              <p className="text-2xl font-semibold">{summary.tonnesProcessed.toFixed(1)}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Gold Recovered</p>
              <p className="text-2xl font-semibold">{summary.goldRecovered.toFixed(2)} g</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Run Hours</p>
              <p className="text-2xl font-semibold">{summary.runHours.toFixed(1)}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Downtime</p>
              <p className="text-2xl font-semibold">
                {downtimeLoading || !siteId ? "-" : `${downtimeAnalytics?.totalDowntimeHours.toFixed(1) ?? "0.0"}h`}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className={compact ? "w-full text-xs" : "w-full text-sm"}>
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Date</th>
                  <th className="py-2">Site</th>
                  <th className="py-2">Tonnes Processed</th>
                  <th className="py-2">Gold Recovered</th>
                  <th className="py-2">Run Hours</th>
                </tr>
              </thead>
              <tbody>
                {plantData.map((report) => (
                  <tr key={report.id} className="border-b">
                    <td className="py-2">{format(new Date(report.date), "MMM d, yyyy")}</td>
                    <td className="py-2">{report.site?.name ?? ""}</td>
                    <td className="py-2">{(report.tonnesProcessed ?? 0).toFixed(1)}</td>
                    <td className="py-2">{(report.goldRecovered ?? 0).toFixed(2)}</td>
                    <td className="py-2">{(report.runHours ?? 0).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto">
            <table className={compact ? "w-full text-xs" : "w-full text-sm"}>
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Work Type</th>
                  <th className="py-2">Reports</th>
                  <th className="py-2">Crew Total</th>
                </tr>
              </thead>
              <tbody>
                {shiftByWorkType.map(([workType, totals]) => (
                  <tr key={workType} className="border-b">
                    <td className="py-2">{workType}</td>
                    <td className="py-2">{totals.reports}</td>
                    <td className="py-2">{totals.crew}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (selectedReport === "attendance") {
      return (
        <div className="overflow-x-auto">
          <table className={compact ? "w-full text-xs" : "w-full text-sm"}>
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Date</th>
                <th className="py-2">Site</th>
                <th className="py-2">Shift</th>
                <th className="py-2">Employee</th>
                <th className="py-2">Status</th>
                <th className="py-2">Overtime</th>
              </tr>
            </thead>
            <tbody>
              {attendanceRows.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="py-2">{format(new Date(row.date), "MMM d, yyyy")}</td>
                  <td className="py-2">{row.site?.name}</td>
                  <td className="py-2">{row.shift}</td>
                  <td className="py-2">{row.employee?.name}</td>
                  <td className="py-2">{row.status}</td>
                  <td className="py-2">{row.overtime ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (selectedReport === "stores") {
      return (
        <div className="overflow-x-auto">
          <table className={compact ? "w-full text-xs" : "w-full text-sm"}>
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Date</th>
                <th className="py-2">Type</th>
                <th className="py-2">Item</th>
                <th className="py-2">Qty</th>
                <th className="py-2">Site</th>
                <th className="py-2">Issued To</th>
              </tr>
            </thead>
            <tbody>
              {movementRows.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="py-2">{format(new Date(row.createdAt), "MMM d, yyyy")}</td>
                  <td className="py-2">{row.movementType}</td>
                  <td className="py-2">{row.item?.name}</td>
                  <td className="py-2">{row.quantity} {row.unit}</td>
                  <td className="py-2">{row.item?.site?.name}</td>
                  <td className="py-2">{row.issuedTo ?? row.requestedBy ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (selectedReport === "gold") {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Pours</p>
              <p className="text-2xl font-semibold">{pours.length}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Dispatches</p>
              <p className="text-2xl font-semibold">{dispatches.length}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Receipts</p>
              <p className="text-2xl font-semibold">{receipts.length}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className={compact ? "w-full text-xs" : "w-full text-sm"}>
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Pour Date</th>
                  <th className="py-2">Bar ID</th>
                  <th className="py-2">Site</th>
                  <th className="py-2">Weight</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {goldChainRows.map((row) => (
                  <tr key={row.pour.id} className="border-b">
                    <td className="py-2">{format(new Date(row.pour.pourDate), "MMM d, yyyy")}</td>
                    <td className="py-2">{row.pour.pourBarId}</td>
                    <td className="py-2">{row.pour.site?.name}</td>
                    <td className="py-2">{row.pour.grossWeight.toFixed(2)} g</td>
                    <td className="py-2">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (selectedReport === "compliance") {
      return (
        <div className="overflow-x-auto">
          <table className={compact ? "w-full text-xs" : "w-full text-sm"}>
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Date</th>
                <th className="py-2">Site</th>
                <th className="py-2">Type</th>
                <th className="py-2">Severity</th>
                <th className="py-2">Status</th>
                <th className="py-2">Reported By</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="py-2">{format(new Date(row.incidentDate), "MMM d, yyyy")}</td>
                  <td className="py-2">{row.site?.name}</td>
                  <td className="py-2">{row.incidentType}</td>
                  <td className="py-2">{row.severity}</td>
                  <td className="py-2">{row.status}</td>
                  <td className="py-2">{row.reportedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (selectedReport === "maintenance") {
      return (
        <div className="overflow-x-auto">
          <table className={compact ? "w-full text-xs" : "w-full text-sm"}>
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Created</th>
                <th className="py-2">Site</th>
                <th className="py-2">Equipment</th>
                <th className="py-2">Issue</th>
                <th className="py-2">Status</th>
                <th className="py-2">Technician</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="py-2">{format(new Date(row.createdAt), "MMM d, yyyy")}</td>
                  <td className="py-2">{row.equipment?.site?.name}</td>
                  <td className="py-2">{row.equipment?.name}</td>
                  <td className="py-2">{row.issue}</td>
                  <td className="py-2">{row.status}</td>
                  <td className="py-2">{row.technician?.name ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className={compact ? "w-full text-xs" : "w-full text-sm"}>
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Event Time</th>
              <th className="py-2">Type</th>
              <th className="py-2">Severity</th>
              <th className="py-2">Title</th>
              <th className="py-2">Ack</th>
            </tr>
          </thead>
          <tbody>
            {cctvEvents.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="py-2">{format(new Date(row.eventTime), "MMM d, yyyy HH:mm")}</td>
                <td className="py-2">{row.eventType}</td>
                <td className="py-2">{row.severity}</td>
                <td className="py-2">{row.title}</td>
                <td className="py-2">{row.isAcknowledged ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeading title="Reports" description="Generate reports across all platform modules" />

      {hasAnyError && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load some report data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(hasAnyError)}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Report Filters</CardTitle>
          <CardDescription>Select report scope and date range</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold" htmlFor={siteFilterId}>
                Site
              </label>
              {sitesLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={selectedSite} onValueChange={setSelectedSite}>
                  <SelectTrigger id={siteFilterId} className="w-full">
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sites</SelectItem>
                    {sites?.length ? (
                      sites.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-sites" disabled>
                        No sites available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold" htmlFor={reportFilterId}>
                Report Type
              </label>
              <Select value={selectedReport} onValueChange={(value) => setSelectedReport(value as ReportType)}>
                <SelectTrigger id={reportFilterId} className="w-full">
                  <SelectValue placeholder="Select report" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REPORT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold" htmlFor={startDateFilterId}>
                Start Date
              </label>
              <Input
                id={startDateFilterId}
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold" htmlFor={endDateFilterId}>
                End Date
              </label>
              <Input
                id={endDateFilterId}
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>

            <div className="md:col-span-4 flex flex-wrap items-center gap-3">
              <Button onClick={handleExportPdf} disabled={exportingPdf || isLoadingAny}>
                {exportingPdf ? "Exporting..." : "Export PDF"}
              </Button>
              <Button variant="outline" onClick={handleExportCsv} disabled={isLoadingAny}>
                Export CSV
              </Button>
              <p className="text-xs text-muted-foreground">
                Selected report: {REPORT_LABELS[selectedReport]} ({startDate} to {endDate})
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Operations</p>
            <p className="text-2xl font-semibold">{plantData.length + shiftData.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Attendance</p>
            <p className="text-2xl font-semibold">{attendanceRows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Stores</p>
            <p className="text-2xl font-semibold">{movementRows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Gold Chain</p>
            <p className="text-2xl font-semibold">{goldChainRows.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{REPORT_LABELS[selectedReport]}</CardTitle>
          <CardDescription>
            {activeSiteName} - {startDate} to {endDate}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingAny ? <Skeleton className="h-32 w-full" /> : renderSelectedReport(false)}
        </CardContent>
      </Card>

      <div className="absolute left-[-9999px] top-0">
        <div ref={reportPdfRef}>
          <PdfTemplate
            title={REPORT_LABELS[selectedReport]}
            subtitle={`${startDate} to ${endDate}`}
            meta={[
              { label: "Site", value: activeSiteName },
              { label: "Report Type", value: REPORT_LABELS[selectedReport] },
            ]}
          >
            {renderSelectedReport(true)}
          </PdfTemplate>
        </div>
      </div>
    </div>
  );
}

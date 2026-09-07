/**
 * The document sources this host's modules have not taken with them yet: the
 * mine's shift and plant reports, the attendance report and the executive
 * dashboard. Each moves into its module when that
 * module is extracted; the pipeline they resolve into is
 * `@corelithzw/module-documents`.
 */
import { prisma } from "@corelithzw/db/client";
import type { DocumentSource, SourceResolution } from "@corelithzw/module-documents/source-registry";

function isoDate(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "-";
}

function applyDateFilter(dateField: string, filters: Record<string, string> | undefined) {
  const startDate = filters?.startDate;
  const endDate = filters?.endDate;
  if (!startDate && !endDate) return {};

  const dateFilter: Record<string, Date> = {};
  if (startDate) dateFilter.gte = new Date(startDate);
  if (endDate) dateFilter.lte = new Date(endDate);
  return { [dateField]: dateFilter };
}

async function resolveShiftList(companyId: string, filters: Record<string, string> | undefined): Promise<SourceResolution> {
  const rows = await prisma.shiftReport.findMany({
    where: {
      site: { companyId },
      ...applyDateFilter("date", filters),
      ...(filters?.siteId ? { siteId: filters.siteId } : {}),
    },
    include: {
      site: { select: { name: true } },
      section: { select: { name: true } },
      groupLeader: { select: { name: true } },
    },
    orderBy: [{ date: "desc" }],
    take: Number(filters?.limit ?? 1000),
  });

  const exportRows = rows.map((row) => ({
    date: isoDate(row.date),
    shift: row.shift,
    site: row.site.name,
    section: row.section?.name ?? "-",
    crewCount: row.crewCount,
    workType: row.workType,
    outputTonnes: row.outputTonnes ?? 0,
    outputTrips: row.outputTrips ?? 0,
    status: row.status,
    groupLeader: row.groupLeader.name,
  }));

  return {
    targetType: "LIST",
    documentType: "REPORT_TABLE",
    sourceKey: "reports.shift",
    fileName: "shift-report.pdf",
    payload: {
      title: "Shift Report",
      subtitle: "Operational shift entries",
      list: {
        columns: [
          { key: "date", label: "Date" },
          { key: "shift", label: "Shift" },
          { key: "site", label: "Site" },
          { key: "section", label: "Section" },
          { key: "crewCount", label: "Crew" },
          { key: "workType", label: "Work Type" },
          { key: "outputTonnes", label: "Tonnes" },
          { key: "outputTrips", label: "Trips" },
          { key: "status", label: "Status" },
        ],
        rows: exportRows,
      },
    },
    rowsForCsv: exportRows,
  };
}

async function resolveAttendanceList(companyId: string, filters: Record<string, string> | undefined): Promise<SourceResolution> {
  const rows = await prisma.attendance.findMany({
    where: {
      // The row's own company. `site: { companyId }` stopped being a complete
      // tenant filter when a register stopped needing a site.
      companyId,
      ...applyDateFilter("date", filters),
      ...(filters?.siteId ? { siteId: filters.siteId } : {}),
    },
    include: {
      site: { select: { name: true } },
      employee: { select: { employeeId: true, name: true } },
      shiftGroup: { select: { name: true } },
    },
    orderBy: [{ date: "desc" }],
    take: Number(filters?.limit ?? 1000),
  });

  const exportRows = rows.map((row) => ({
    date: isoDate(row.date),
    shift: row.shift,
    // Blank rather than a crash: a register without a site is a whole
    // company's, which is the normal shape off a mine.
    site: row.site?.name ?? "Whole company",
    employeeId: row.employee.employeeId,
    employeeName: row.employee.name,
    shiftGroup: row.shiftGroup?.name ?? "-",
    status: row.status,
    overtime: row.overtime ?? 0,
  }));

  return {
    targetType: "LIST",
    documentType: "REPORT_TABLE",
    sourceKey: "reports.attendance",
    fileName: "attendance-report.pdf",
    payload: {
      title: "Attendance Report",
      subtitle: "Attendance and shift status",
      list: {
        rows: exportRows,
      },
    },
    rowsForCsv: exportRows,
  };
}

async function resolvePlantList(companyId: string, filters: Record<string, string> | undefined): Promise<SourceResolution> {
  const rows = await prisma.plantReport.findMany({
    where: {
      site: { companyId },
      ...applyDateFilter("date", filters),
      ...(filters?.siteId ? { siteId: filters.siteId } : {}),
    },
    include: {
      site: { select: { name: true } },
    },
    orderBy: [{ date: "desc" }],
    take: Number(filters?.limit ?? 1000),
  });

  const exportRows = rows.map((row) => ({
    date: isoDate(row.date),
    site: row.site.name,
    tonnesFed: row.tonnesFed ?? 0,
    tonnesProcessed: row.tonnesProcessed ?? 0,
    runHours: row.runHours ?? 0,
    goldRecovered: row.goldRecovered ?? 0,
    status: row.status,
  }));

  return {
    targetType: "LIST",
    documentType: "REPORT_TABLE",
    sourceKey: "reports.plant",
    fileName: "plant-report.pdf",
    payload: {
      title: "Plant Report",
      subtitle: "Processing and output history",
      list: {
        rows: exportRows,
      },
    },
    rowsForCsv: exportRows,
  };
}

async function resolveDashboardSummary(companyId: string): Promise<SourceResolution> {
  const [users, employees, openWorkOrders, draftInvoices, reports] = await Promise.all([
    prisma.user.count({ where: { companyId } }),
    prisma.employee.count({ where: { companyId, isActive: true } }),
    prisma.workOrder.count({ where: { equipment: { site: { companyId } }, status: "OPEN" } }),
    prisma.salesInvoice.count({ where: { companyId, status: "DRAFT" } }),
    prisma.shiftReport.count({
      where: {
        site: { companyId },
        date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  return {
    targetType: "DASHBOARD",
    documentType: "DASHBOARD_PACK",
    sourceKey: "dashboard.executive-summary",
    fileName: "dashboard-summary.pdf",
    payload: {
      title: "Executive Dashboard Summary",
      dashboard: {
        metrics: [
          { label: "Users", value: users.toLocaleString() },
          { label: "Active Workers", value: employees.toLocaleString() },
          { label: "Open Work Orders", value: openWorkOrders.toLocaleString() },
          { label: "Draft Invoices", value: draftInvoices.toLocaleString() },
          { label: "Shift Reports (30d)", value: reports.toLocaleString() },
        ],
      },
    },
  };
}

export const ENTERPRISE_DOCUMENT_SOURCE_PREFIXES = ["reports.", "dashboard."] as const;

export function matchesEnterpriseDocumentSource(sourceKey: string): boolean {
  return ENTERPRISE_DOCUMENT_SOURCE_PREFIXES.some((prefix) => sourceKey.startsWith(prefix));
}

/** The feature that opens each of the host's own sources; sales documents open from the books or the CRM. */
const ENTERPRISE_DOCUMENT_FEATURES: Record<string, string[]> = {
  "reports.shift": ["reports.shift"],
  "reports.attendance": ["reports.attendance"],
  "reports.plant": ["reports.plant"],
  "dashboard.executive-summary": ["reports.dashboard"],
};

export const enterpriseDocumentSource: DocumentSource = {
  access: async (sourceKey) => ({ featureKeys: ENTERPRISE_DOCUMENT_FEATURES[sourceKey] ?? [] }),
  id: "enterprise",
  matches: matchesEnterpriseDocumentSource,
  resolve: async (input) => {
    const { companyId } = input;
      switch (input.sourceKey) {
      case "reports.shift":
        return resolveShiftList(companyId, input.filters);
      case "reports.attendance":
        return resolveAttendanceList(companyId, input.filters);
      case "reports.plant":
        return resolvePlantList(companyId, input.filters);
      case "dashboard.executive-summary":
        return resolveDashboardSummary(companyId);
      default:
        throw new Error(`Unknown sourceKey: ${input.sourceKey}`);
    }
  },
};

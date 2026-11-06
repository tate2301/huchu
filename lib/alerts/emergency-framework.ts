import { claimFromDailyLog } from "@/lib/books/core/claims";
import { dayTotals, submitDailyLog } from "@/lib/crm/daily-log";
import { reportHeadline, saveDailyReport, type DailyReportSummary } from "@/lib/crm/daily-report";
import { money } from "@/lib/money";
import { emitCrmNotification, getCrmManagerRecipients } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { closeShopFiscalDay } from "@/lib/retail/fiscal-settings";
import { closeDay, dayFigures, loadDayRows, shortDayLabel } from "@/lib/retail/floor/day-close";
import type { ShiftSession } from "@/lib/retail/floor/shifts";
import { closeShiftUncounted } from "@/lib/retail/shift-close-uncounted";
import { tradingDayAsDate, tradingDayKey } from "@/lib/retail/z-report";
import { formatMoney } from "@/lib/workspace/format";

export type EmergencyCategory =
  | "retail-shift"
  | "retail-day-close"
  | "fiscal-day-close"
  | "cost-tracking"
  | "operations-shift"
  | "books-period"
  | "emergency";

export type EmergencyModule = "retail" | "books" | "crm" | "operations";

export type EmergencySeverity = "critical" | "warning";

export type EmergencyWorkflowActionKey =
  | "close-retail-shift"
  | "close-retail-day"
  | "close-fiscal-day"
  | "close-cost-day"
  | "submit-shift-report";

export type EmergencyWorkflowSpec = {
  actionKey: EmergencyWorkflowActionKey;
  label: string;
  description: string;
  canRunInPlace: boolean;
  defaultPayload: Record<string, unknown>;
  notePlaceholder?: string;
};

export type EmergencyAlertItem = {
  id: string;
  category: EmergencyCategory;
  module: EmergencyModule;
  moduleLabel: string;
  severity: EmergencySeverity;
  title: string;
  summary: string;
  day: string;
  dayLabel: string;
  isPastDay: boolean;
  shortcut: {
    label: string;
    href: string;
  };
  secondaryShortcut?: {
    label: string;
    href: string;
  };
  workflow: EmergencyWorkflowSpec | null;
};

export type EmergencyDetectionContext = {
  companyId: string;
  userId: string;
  userRole?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  now?: Date;
};

export type EmergencyDetector = {
  key: string;
  detect: (ctx: EmergencyDetectionContext) => Promise<EmergencyAlertItem[]>;
};

export type EmergencyFeedResponse = {
  items: EmergencyAlertItem[];
  counts: {
    total: number;
    critical: number;
    warning: number;
    pastUnclosedDays: number;
  };
  shouldPromptDialog: boolean;
  generatedAt: string;
};

export type WorkflowExecutionResult = {
  ok: boolean;
  actionKey: string;
  itemId?: string;
  message: string;
  closedCount?: number;
  results?: Array<{ itemId: string; title: string; ok: boolean; message: string }>;
};

const customDetectors: EmergencyDetector[] = [];

/**
 * Extensible registration point so any domain module can register emergency
 * or end-of-day detectors that surface in the notification bell and emergency dialog.
 */
export function registerEmergencyDetector(detector: EmergencyDetector): void {
  const existingIndex = customDetectors.findIndex((entry) => entry.key === detector.key);
  if (existingIndex >= 0) {
    customDetectors[existingIndex] = detector;
  } else {
    customDetectors.push(detector);
  }
}

export function formatRelativeDayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  const todayMs = Date.parse(`${today}T00:00:00.000Z`);
  const dayMs = Date.parse(`${day}T00:00:00.000Z`);
  const diffDays = Math.round((todayMs - dayMs) / 86_400_000);
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays <= 7) return `${diffDays} days ago (${shortDayLabel(day)})`;
  return shortDayLabel(day);
}

/**
 * 1. Retail Open Shifts (POS / Floor Tills)
 * Detects open shifts from a past day (or open > 12h) as critical emergencies,
 * and today's open shifts as end-of-day warnings.
 */
async function detectRetailOpenShifts(ctx: EmergencyDetectionContext): Promise<EmergencyAlertItem[]> {
  const now = ctx.now ?? new Date();
  const today = tradingDayKey(now);
  const shifts = await prisma.retailShift.findMany({
    where: { companyId: ctx.companyId, status: "OPEN" },
    select: {
      id: true,
      shiftNo: true,
      registerName: true,
      cashierName: true,
      openedAt: true,
      expectedCash: true,
      site: { select: { id: true, name: true } },
    },
    orderBy: { openedAt: "asc" },
    take: 25,
  });

  return shifts.map((shift) => {
    const openedDay = tradingDayKey(shift.openedAt);
    const hoursOpen = Math.max(1, Math.floor((now.getTime() - shift.openedAt.getTime()) / 3_600_000));
    const isPastDay = openedDay < today || hoursOpen >= 12;
    const expectedFormatted = formatMoney(Number(money(shift.expectedCash)));
    const dayText = formatRelativeDayLabel(openedDay, today);

    return {
      id: `retail-shift:${shift.id}`,
      category: "retail-shift",
      module: "retail",
      moduleLabel: "Retail Shifts",
      severity: isPastDay ? "critical" : "warning",
      title: isPastDay
        ? `${shift.registerName} shift (${shift.shiftNo}) is still open from ${dayText}`
        : `${shift.registerName} shift (${shift.shiftNo}) is open today`,
      summary: `${shift.cashierName} · ${shift.site.name} · Open ${hoursOpen}h · Expected in drawer: ${expectedFormatted}`,
      day: openedDay,
      dayLabel: dayText,
      isPastDay,
      shortcut: {
        label: "Go to Shift Close",
        href: `/retail/shifts/${shift.id}/close`,
      },
      secondaryShortcut: {
        label: "End of Day",
        href: `/retail/shifts/end-of-day?site=${shift.site.id}&date=${openedDay}`,
      },
      workflow: {
        actionKey: "close-retail-shift",
        label: isPastDay ? "Close overdue shift now" : "Close shift now",
        description: `Closes ${shift.registerName} (${shift.shiftNo}) so the trading day can finish.`,
        canRunInPlace: true,
        defaultPayload: {
          shiftId: shift.id,
          expectedCash: money(shift.expectedCash).toFixed(2),
          note: isPastDay ? `Closed via end-of-day emergency workflow (${dayText})` : "Closed at end of day",
        },
        notePlaceholder: "Optional close note or cash variance reason…",
      },
    };
  });
}

/**
 * 2. Retail & Books Takings Unclosed Trading Days
 * Detects past trading days at any active site where shifts or sales occurred
 * but `RetailDayClose` has not been run yet.
 */
async function detectUnclosedRetailDays(ctx: EmergencyDetectionContext): Promise<EmergencyAlertItem[]> {
  const now = ctx.now ?? new Date();
  const today = tradingDayKey(now);
  const lookbackStart = new Date(now.getTime() - 14 * 86_400_000);

  const [recentShifts, existingCloses] = await Promise.all([
    prisma.retailShift.findMany({
      where: {
        companyId: ctx.companyId,
        openedAt: { gte: lookbackStart },
      },
      select: {
        id: true,
        siteId: true,
        status: true,
        openedAt: true,
        site: { select: { id: true, name: true } },
      },
      orderBy: { openedAt: "desc" },
    }),
    prisma.retailDayClose.findMany({
      where: {
        companyId: ctx.companyId,
        businessDate: { gte: tradingDayAsDate(tradingDayKey(lookbackStart)) },
      },
      select: {
        siteId: true,
        businessDate: true,
      },
    }),
  ]);

  const closedKeys = new Set(
    existingCloses.map((close) => `${close.siteId}:${tradingDayKey(close.businessDate)}`),
  );

  const grouped = new Map<
    string,
    {
      siteId: string;
      siteName: string;
      day: string;
      totalShifts: number;
      openShifts: number;
    }
  >();

  for (const shift of recentShifts) {
    const day = tradingDayKey(shift.openedAt);
    const key = `${shift.siteId}:${day}`;
    if (closedKeys.has(key)) continue;
    const current = grouped.get(key) ?? {
      siteId: shift.siteId,
      siteName: shift.site.name,
      day,
      totalShifts: 0,
      openShifts: 0,
    };
    current.totalShifts += 1;
    if (shift.status === "OPEN") current.openShifts += 1;
    grouped.set(key, current);
  }

  const items: EmergencyAlertItem[] = [];
  for (const group of grouped.values()) {
    const isPastDay = group.day < today;
    const dayText = formatRelativeDayLabel(group.day, today);
    const shiftStatusText =
      group.openShifts > 0
        ? `${group.openShifts} of ${group.totalShifts} shift${group.totalShifts === 1 ? "" : "s"} still open`
        : `All ${group.totalShifts} shift${group.totalShifts === 1 ? "" : "s"} closed — waiting for final day close`;

    items.push({
      id: `retail-day-close:${group.siteId}:${group.day}`,
      category: "retail-day-close",
      module: "retail",
      moduleLabel: "Retail & Takings",
      severity: isPastDay ? "critical" : "warning",
      title: isPastDay
        ? `Trading day not closed for ${group.siteName} (${dayText})`
        : `Close today's trading day for ${group.siteName}`,
      summary: `${shiftStatusText} · Z-reports and takings sign-off pending`,
      day: group.day,
      dayLabel: dayText,
      isPastDay,
      shortcut: {
        label: "Go to Retail End of Day",
        href: `/retail/shifts/end-of-day?site=${group.siteId}&date=${group.day}`,
      },
      secondaryShortcut: {
        label: "Open in Books Takings",
        href: `/books/takings?site=${group.siteId}&date=${group.day}`,
      },
      workflow: {
        actionKey: "close-retail-day",
        label: isPastDay ? "Close overdue trading day" : "Close trading day now",
        description:
          group.openShifts > 0
            ? `Closes remaining open shifts at ${group.siteName} and finalizes the ${dayText} Z-report.`
            : `Takes the Z-reports and records the day close for ${group.siteName} (${dayText}).`,
        canRunInPlace: true,
        defaultPayload: {
          siteId: group.siteId,
          date: group.day,
          autoCloseOpenShifts: true,
        },
        notePlaceholder: "Optional close note…",
      },
    });
  }

  return items.sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * 3. Fiscal Day Close (Books / ZIMRA FDMS)
 * Detects open or stuck fiscal days from past dates (critical) or today (warning).
 */
async function detectOpenFiscalDays(ctx: EmergencyDetectionContext): Promise<EmergencyAlertItem[]> {
  const now = ctx.now ?? new Date();
  const today = tradingDayKey(now);

  const openDays = await prisma.fiscalDay.findMany({
    where: {
      companyId: ctx.companyId,
      status: { not: "CLOSED" },
    },
    select: {
      id: true,
      fiscalDayNo: true,
      status: true,
      openedAt: true,
      deviceId: true,
      lastError: true,
      _count: { select: { receipts: true } },
    },
    orderBy: { openedAt: "asc" },
    take: 10,
  });

  return openDays.map((fiscalDay) => {
    const openedDay = tradingDayKey(fiscalDay.openedAt);
    const isPastDay = openedDay < today;
    const dayText = formatRelativeDayLabel(openedDay, today);
    const receiptsCount = fiscalDay._count.receipts;

    return {
      id: `fiscal-day:${fiscalDay.id}`,
      category: "fiscal-day-close",
      module: "books",
      moduleLabel: "Books & Fiscal",
      severity: isPastDay || fiscalDay.status === "FAILED" ? "critical" : "warning",
      title: isPastDay
        ? `Fiscal day #${fiscalDay.fiscalDayNo} is still open from ${dayText}`
        : `Fiscal day #${fiscalDay.fiscalDayNo} is open today`,
      summary: `${receiptsCount} fiscal receipt${receiptsCount === 1 ? "" : "s"} · Device ${fiscalDay.deviceId}${
        fiscalDay.lastError ? ` · ${fiscalDay.lastError}` : ""
      }`,
      day: openedDay,
      dayLabel: dayText,
      isPastDay,
      shortcut: {
        label: "Go to Fiscal Register",
        href: "/books/fiscal?tab=days",
      },
      secondaryShortcut: {
        label: "Fiscal Device Setup",
        href: "/settings/shop/fiscal",
      },
      workflow: {
        actionKey: "close-fiscal-day",
        label: isPastDay ? "Close overdue fiscal day" : "Close fiscal day now",
        description: `Sends the Z-report for Fiscal Day #${fiscalDay.fiscalDayNo} to close the day.`,
        canRunInPlace: true,
        defaultPayload: {
          fiscalDayId: fiscalDay.id,
        },
      },
    };
  });
}

/**
 * 4. CRM Cost Tracking Daily Logs
 * Detects unsubmitted daily cost logs (`CrmDailyLog` with `submittedAt: null`)
 * from past days (critical) or today when entries have been logged (warning).
 */
async function detectUnclosedCostTrackerDays(ctx: EmergencyDetectionContext): Promise<EmergencyAlertItem[]> {
  const now = ctx.now ?? new Date();
  const today = tradingDayKey(now);
  const lookbackStart = new Date(now.getTime() - 30 * 86_400_000);

  const openLogs = await prisma.crmDailyLog.findMany({
    where: {
      companyId: ctx.companyId,
      userId: ctx.userId,
      submittedAt: null,
      logDate: { gte: lookbackStart },
    },
    include: {
      entries: {
        select: {
          id: true,
          direction: true,
          amount: true,
          projectId: true,
          receiptUrl: true,
        },
      },
      user: { select: { id: true, name: true } },
    },
    orderBy: { logDate: "asc" },
    take: 15,
  });

  const items: EmergencyAlertItem[] = [];
  for (const log of openLogs) {
    const day = tradingDayKey(log.logDate);
    const isPastDay = day < today;
    // Today's empty log is just the container created when visiting the page;
    // only alert if it's a past unclosed day OR if today has entries waiting to be closed.
    if (!isPastDay && log.entries.length === 0 && !log.notes) {
      continue;
    }

    const totals = dayTotals(log.entries);
    const dayText = formatRelativeDayLabel(day, today);
    const spentFormatted = formatMoney(Number(totals.spent));
    const receivedFormatted = formatMoney(Number(totals.received));

    items.push({
      id: `cost-tracking:${log.id}`,
      category: "cost-tracking",
      module: "crm",
      moduleLabel: "Cost Tracking",
      severity: isPastDay ? "critical" : "warning",
      title: isPastDay
        ? `Cost tracking day not ended for ${dayText}`
        : `End today's cost tracking (${totals.entryCount} ${totals.entryCount === 1 ? "entry" : "entries"})`,
      summary:
        totals.entryCount > 0
          ? `${totals.entryCount} line${totals.entryCount === 1 ? "" : "s"} · Spent ${spentFormatted} · Received ${receivedFormatted}${
              totals.missingReceipts > 0 ? ` · ${totals.missingReceipts} without receipt` : ""
            }`
          : "No entries logged yet — add a note to close and send the daily cost report",
      day,
      dayLabel: dayText,
      isPastDay,
      shortcut: {
        label: "Go to Cost Tracker",
        href: "/crm/cost-tracker",
      },
      workflow: {
        actionKey: "close-cost-day",
        label: isPastDay ? "End overdue cost day now" : "End cost tracking day",
        description: "Submits the daily cost log and sends the summary report to management.",
        canRunInPlace: true,
        defaultPayload: {
          logId: log.id,
          logDate: day,
          note:
            log.notes?.trim() ||
            (totals.entryCount === 0 ? `No cash movement recorded on ${dayText}.` : ""),
        },
        notePlaceholder: "Day handover note (required if 0 entries logged)…",
      },
    });
  }

  return items;
}

/**
 * 5. Operations Shift Reports
 * Detects draft `ShiftReport` records from past days (critical) or today (warning)
 * that haven't been submitted/closed at end of shift.
 */
async function detectUnclosedOperationsShifts(ctx: EmergencyDetectionContext): Promise<EmergencyAlertItem[]> {
  const now = ctx.now ?? new Date();
  const today = tradingDayKey(now);
  const lookbackStart = new Date(now.getTime() - 14 * 86_400_000);

  const draftReports = await prisma.shiftReport.findMany({
    where: {
      site: { companyId: ctx.companyId },
      status: "DRAFT",
      date: { gte: lookbackStart },
    },
    select: {
      id: true,
      date: true,
      shift: true,
      workType: true,
      crewCount: true,
      site: { select: { id: true, name: true } },
      groupLeader: { select: { name: true } },
    },
    orderBy: { date: "asc" },
    take: 15,
  });

  return draftReports.map((report) => {
    const day = tradingDayKey(report.date);
    const isPastDay = day < today;
    const dayText = formatRelativeDayLabel(day, today);

    return {
      id: `operations-shift:${report.id}`,
      category: "operations-shift",
      module: "operations",
      moduleLabel: "Operations Shifts",
      severity: isPastDay ? "critical" : "warning",
      title: isPastDay
        ? `Unclosed ${report.shift} shift report at ${report.site.name} (${dayText})`
        : `${report.shift} shift report in draft at ${report.site.name}`,
      summary: `${report.workType} · Crew: ${report.crewCount}${
        report.groupLeader?.name ? ` · Leader: ${report.groupLeader.name}` : ""
      }`,
      day,
      dayLabel: dayText,
      isPastDay,
      shortcut: {
        label: "Go to Shift Reports",
        href: "/shift-report",
      },
      workflow: {
        actionKey: "submit-shift-report",
        label: isPastDay ? "Submit & close shift report" : "Submit shift report",
        description: `Submits the ${report.shift} shift report for ${report.site.name} (${dayText}).`,
        canRunInPlace: true,
        defaultPayload: {
          reportId: report.id,
        },
      },
    };
  });
}

const builtInDetectors: EmergencyDetector[] = [
  { key: "retail-open-shifts", detect: detectRetailOpenShifts },
  { key: "retail-unclosed-days", detect: detectUnclosedRetailDays },
  { key: "books-open-fiscal-days", detect: detectOpenFiscalDays },
  { key: "crm-unclosed-cost-days", detect: detectUnclosedCostTrackerDays },
  { key: "operations-draft-shifts", detect: detectUnclosedOperationsShifts },
];

/**
 * Evaluates all registered emergency & day-close detectors in parallel.
 */
export async function detectEmergencyAlerts(
  ctx: EmergencyDetectionContext,
): Promise<EmergencyFeedResponse> {
  const now = ctx.now ?? new Date();
  const detectors = [...builtInDetectors, ...customDetectors];

  const settled = await Promise.allSettled(detectors.map((detector) => detector.detect(ctx)));
  const items: EmergencyAlertItem[] = [];

  for (const result of settled) {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    } else {
      console.error("[emergency-framework] detector failed:", result.reason);
    }
  }

  // Sort critical & oldest past days first so the most urgent unclosed items lead.
  items.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    if (a.isPastDay !== b.isPastDay) return a.isPastDay ? -1 : 1;
    return a.day.localeCompare(b.day);
  });

  const critical = items.filter((item) => item.severity === "critical").length;
  const warning = items.filter((item) => item.severity === "warning").length;
  const pastUnclosedDays = items.filter((item) => item.isPastDay).length;

  return {
    items,
    counts: {
      total: items.length,
      critical,
      warning,
      pastUnclosedDays,
    },
    shouldPromptDialog: critical > 0,
    generatedAt: now.toISOString(),
  };
}

/**
 * Executes an in-place day-close or shift-close workflow action from the
 * emergency dialog or notification bell.
 */
export async function executeEmergencyWorkflow(
  ctx: EmergencyDetectionContext & { session: ShiftSession },
  input: {
    actionKey: EmergencyWorkflowActionKey;
    payload: Record<string, unknown>;
    note?: string;
  },
): Promise<WorkflowExecutionResult> {
  const { actionKey, payload } = input;
  const noteText = (input.note ?? (payload.note as string | undefined) ?? "").trim();

  if (actionKey === "close-retail-shift") {
    const shiftId = String(payload.shiftId ?? "");
    if (!shiftId) {
      return { ok: false, actionKey, message: "Missing shift ID." };
    }
    const actor: RetailAuditActor = {
      companyId: ctx.companyId,
      userId: ctx.userId,
      userName: ctx.userName ?? ctx.userEmail ?? "Manager",
      userRole: ctx.userRole ?? null,
    };
    const reason = noteText || "Closed via day-close workflow";
    const closed = await prisma.$transaction(async (tx) => {
      const res = await closeShiftUncounted(tx, {
        actor,
        shiftId,
        reason,
      });
      if (!res) return null;
      // Also sign off the uncounted drawer if closed via manager emergency close so it doesn't block End-of-Day.
      await tx.retailShift.update({
        where: { id: shiftId },
        data: {
          signOffOutcome: "ACCEPT",
          signOffNote: reason,
          signedOffAt: new Date(),
          signedOffById: ctx.userId,
        },
      });
      return res;
    });
    if (!closed) {
      return { ok: false, actionKey, message: "Shift is already closed or could not be found." };
    }
    return {
      ok: true,
      actionKey,
      message: `Closed shift ${closed.shiftNo} on ${closed.registerName}.`,
    };
  }

  if (actionKey === "close-retail-day") {
    const siteId = String(payload.siteId ?? "");
    const date = String(payload.date ?? "");
    if (!siteId || !date) {
      return { ok: false, actionKey, message: "Missing site or date for retail day close." };
    }

    const actor: RetailAuditActor = {
      companyId: ctx.companyId,
      userId: ctx.userId,
      userName: ctx.userName ?? ctx.userEmail ?? "Manager",
      userRole: ctx.userRole ?? null,
    };
    const reason = noteText || `Closed via End-of-Day workflow (${date})`;

    // Ensure any open shifts or unsigned variances on that trading day are resolved when autoCloseOpenShifts is enabled
    if (payload.autoCloseOpenShifts !== false) {
      const { shifts } = await loadDayRows(ctx.companyId, siteId, date);
      await prisma.$transaction(async (tx) => {
        for (const shift of shifts) {
          if (shift.status === "OPEN") {
            await closeShiftUncounted(tx, {
              actor,
              shiftId: shift.id,
              reason,
            });
          }
          await tx.retailShift.update({
            where: { id: shift.id },
            data: {
              signOffOutcome: shift.signOffOutcome ?? "ACCEPT",
              signOffNote: reason,
              signedOffAt: new Date(),
              signedOffById: ctx.userId,
            },
          });
        }
      });
    }

    // Calculate default cash banked (or 0.00 if no default bank account is configured so close doesn't fail on NO_BANK)
    const [{ shifts, sales }, settings] = await Promise.all([
      loadDayRows(ctx.companyId, siteId, date),
      prisma.accountingSettings.findUnique({
        where: { companyId: ctx.companyId },
        select: { defaultBankAccount: { select: { id: true, isActive: true } } },
      }),
    ]);
    const figures = dayFigures(shifts, sales);
    const hasActiveBank = Boolean(settings?.defaultBankAccount?.isActive);
    const bankedAmount =
      typeof payload.banked === "string"
        ? payload.banked
        : hasActiveBank
          ? figures.cashUsd
          : "0.00";

    const result = await closeDay(ctx.session, {
      siteId,
      date,
      banked: bankedAmount,
    });

    return {
      ok: true,
      actionKey,
      message: `Closed trading day ${shortDayLabel(date)} (${result.zReports.length} Z-report${
        result.zReports.length === 1 ? "" : "s"
      } generated).`,
    };
  }

  if (actionKey === "close-fiscal-day") {
    const fiscalDayId = String(payload.fiscalDayId ?? "");
    if (!fiscalDayId) {
      return { ok: false, actionKey, message: "Missing fiscal day ID." };
    }
    const actor: RetailAuditActor = {
      companyId: ctx.companyId,
      userId: ctx.userId,
      userName: ctx.userName ?? ctx.userEmail ?? "Manager",
      userRole: ctx.userRole ?? null,
    };
    try {
      await closeShopFiscalDay(actor, fiscalDayId, "HAND");
      return {
        ok: true,
        actionKey,
        message: "Fiscal day closed and Z-report recorded.",
      };
    } catch (error) {
      // If the fiscal device is simulated/offline in local or staging without FDMS reachability,
      // allow force-closing a past stuck fiscal day if requested or return the device message clearly.
      if (payload.forceOfflineClose === true) {
        const closed = await prisma.fiscalDay.updateMany({
          where: { id: fiscalDayId, companyId: ctx.companyId, status: { not: "CLOSED" } },
          data: { status: "CLOSED", closedAt: new Date(), lastError: null },
        });
        if (closed.count > 0) {
          await writeRetailAuditEvent(prisma, {
            actor,
            eventType: RETAIL_AUDIT_EVENTS.fiscalDayClosed,
            entityType: "RetailSettings",
            entityId: "fiscal",
            payload: { fiscalDayId, how: "HAND", offlineForceClose: true },
          });
          return {
            ok: true,
            actionKey,
            message: "Fiscal day marked closed.",
          };
        }
      }
      const message = error instanceof Error ? error.message : "Could not close the fiscal day.";
      return { ok: false, actionKey, message };
    }
  }

  if (actionKey === "close-cost-day") {
    const logId = String(payload.logId ?? "");
    if (!logId) {
      return { ok: false, actionKey, message: "Missing daily cost log ID." };
    }
    const log = await prisma.crmDailyLog.findFirst({
      where: { id: logId, companyId: ctx.companyId },
      include: { entries: { select: { id: true } } },
    });
    if (!log) {
      return { ok: false, actionKey, message: "Daily cost log not found." };
    }

    const effectiveNote =
      noteText ||
      log.notes?.trim() ||
      (log.entries.length === 0 ? "No money moved on this day (closed via end-of-day workflow)." : null);

    const { report } = await prisma.$transaction(async (tx) => {
      if (effectiveNote && effectiveNote !== log.notes) {
        await tx.crmDailyLog.update({
          where: { id: log.id },
          data: { notes: effectiveNote },
        });
      }
      const submitted = await submitDailyLog(tx, ctx.companyId, log.id);
      const savedReport = await saveDailyReport(tx, ctx.companyId, log.userId, log.logDate);
      await claimFromDailyLog(tx, ctx.companyId, log.id);
      return { submitted, report: savedReport };
    });

    try {
      const summary = report.summary as unknown as DailyReportSummary;
      const recipientIds = await getCrmManagerRecipients(ctx.companyId, log.userId);
      if (recipientIds.length > 0) {
        await emitCrmNotification({
          companyId: ctx.companyId,
          recipientIds,
          type: "CRM_DAILY_REPORT_READY",
          title: `${summary.person.name ?? "Team member"} — ${summary.date}`,
          summary:
            summary.flags.length > 0
              ? `${reportHeadline(summary)}. ${summary.flags[0]}`
              : reportHeadline(summary),
          entityType: "CRM_DAILY_REPORT",
          entityId: report.id,
          viewPath: `/crm/daily-reports/${report.id}`,
          severity: summary.flags.length > 0 ? "WARNING" : "INFO",
        });
      }
    } catch (notifyErr) {
      console.error("[emergency-framework] cost day report notification failed:", notifyErr);
    }

    return {
      ok: true,
      actionKey,
      message: `Ended cost tracking day (${tradingDayKey(log.logDate)}) and sent report.`,
    };
  }

  if (actionKey === "submit-shift-report") {
    const reportId = String(payload.reportId ?? "");
    if (!reportId) {
      return { ok: false, actionKey, message: "Missing shift report ID." };
    }
    const existing = await prisma.shiftReport.findFirst({
      where: { id: reportId, site: { companyId: ctx.companyId } },
      select: { id: true, shift: true, status: true, site: { select: { name: true } } },
    });
    if (!existing) {
      return { ok: false, actionKey, message: "Shift report not found." };
    }
    if (existing.status !== "DRAFT") {
      return { ok: true, actionKey, message: `Shift report is already ${existing.status.toLowerCase()}.` };
    }
    await prisma.shiftReport.update({
      where: { id: existing.id },
      data: {
        status: "SUBMITTED",
        ...(noteText ? { handoverNotes: noteText } : {}),
      },
    });
    return {
      ok: true,
      actionKey,
      message: `Submitted ${existing.shift} shift report for ${existing.site.name}.`,
    };
  }

  return {
    ok: false,
    actionKey,
    message: `Unsupported workflow action: ${String(actionKey)}`,
  };
}

/**
 * Runs the close-day workflows across all overdue items (or a selected subset of item IDs)
 * in safe dependency order:
 *   1. Open retail shifts
 *   2. Unclosed retail trading days
 *   3. Open fiscal days
 *   4. Unclosed CRM cost tracking days
 *   5. Draft operations shift reports
 */
export async function executeBatchEmergencyWorkflow(
  ctx: EmergencyDetectionContext & { session: ShiftSession },
  options: { onlyPastDays?: boolean; itemIds?: string[]; note?: string } = {},
): Promise<WorkflowExecutionResult> {
  const feed = await detectEmergencyAlerts(ctx);
  const candidates = feed.items.filter((item) => {
    if (!item.workflow?.canRunInPlace) return false;
    if (options.itemIds?.length) return options.itemIds.includes(item.id);
    if (options.onlyPastDays !== false) return item.isPastDay;
    return true;
  });

  const orderWeight: Record<EmergencyCategory, number> = {
    "retail-shift": 1,
    "retail-day-close": 2,
    "fiscal-day-close": 3,
    "cost-tracking": 4,
    "operations-shift": 5,
    "books-period": 6,
    emergency: 7,
  };

  candidates.sort((a, b) => orderWeight[a.category] - orderWeight[b.category]);

  const results: Array<{ itemId: string; title: string; ok: boolean; message: string }> = [];
  let closedCount = 0;

  for (const item of candidates) {
    if (!item.workflow) continue;
    try {
      const outcome = await executeEmergencyWorkflow(ctx, {
        actionKey: item.workflow.actionKey,
        payload: {
          ...item.workflow.defaultPayload,
          ...(item.category === "fiscal-day-close" ? { forceOfflineClose: true } : {}),
        },
        note: options.note,
      });
      results.push({
        itemId: item.id,
        title: item.title,
        ok: outcome.ok,
        message: outcome.message,
      });
      if (outcome.ok) closedCount += 1;
    } catch (error) {
      results.push({
        itemId: item.id,
        title: item.title,
        ok: false,
        message: error instanceof Error ? error.message : "Workflow step failed.",
      });
    }
  }

  const failedCount = results.length - closedCount;
  const message =
    results.length === 0
      ? "No open days or shifts needed closing."
      : failedCount === 0
        ? `Closed all ${closedCount} item${closedCount === 1 ? "" : "s"} across your workspace.`
        : `Closed ${closedCount} of ${results.length} items (${failedCount} need manual review).`;

  return {
    ok: failedCount === 0,
    actionKey: "batch-close",
    message,
    closedCount,
    results,
  };
}

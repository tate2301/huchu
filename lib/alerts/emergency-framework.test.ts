import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    retailShift: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    retailDayClose: {
      findMany: vi.fn(),
    },
    fiscalDay: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    crmDailyLog: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    shiftReport: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import {
  detectEmergencyAlerts,
  executeBatchEmergencyWorkflow,
  executeEmergencyWorkflow,
  formatRelativeDayLabel,
  registerEmergencyDetector,
  type EmergencyAlertItem,
} from "./emergency-framework";
import type { ShiftSession } from "@/lib/retail/floor/shifts";

const mockedPrisma = prisma as unknown as {
  retailShift: {
    findMany: ReturnType<typeof vi.fn>;
  };
  retailDayClose: {
    findMany: ReturnType<typeof vi.fn>;
  };
  fiscalDay: {
    findMany: ReturnType<typeof vi.fn>;
  };
  crmDailyLog: {
    findMany: ReturnType<typeof vi.fn>;
  };
  shiftReport: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

describe("emergency-framework", () => {
  const now = new Date("2026-11-06T15:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.retailShift.findMany.mockResolvedValue([]);
    mockedPrisma.retailDayClose.findMany.mockResolvedValue([]);
    mockedPrisma.fiscalDay.findMany.mockResolvedValue([]);
    mockedPrisma.crmDailyLog.findMany.mockResolvedValue([]);
    mockedPrisma.shiftReport.findMany.mockResolvedValue([]);
  });

  it("formats relative day labels clearly", () => {
    expect(formatRelativeDayLabel("2026-11-06", "2026-11-06")).toBe("Today");
    expect(formatRelativeDayLabel("2026-11-05", "2026-11-06")).toBe("Yesterday");
    expect(formatRelativeDayLabel("2026-11-03", "2026-11-06")).toContain("3 days ago");
  });

  it("detects overdue past retail shifts, unclosed trading days, fiscal days, cost tracker logs, and operations shifts", async () => {
    mockedPrisma.retailShift.findMany
      // 1st call: detectRetailOpenShifts
      .mockResolvedValueOnce([
        {
          id: "shift-1",
          shiftNo: "SH-00101",
          registerName: "Front Till",
          cashierName: "Tariro",
          openedAt: new Date("2026-11-05T08:00:00.000Z"),
          expectedCash: 245.5,
          site: { id: "site-1", name: "Harare Main" },
        },
      ])
      // 2nd call: detectUnclosedRetailDays
      .mockResolvedValueOnce([
        {
          id: "shift-1",
          siteId: "site-1",
          status: "OPEN",
          openedAt: new Date("2026-11-05T08:00:00.000Z"),
          site: { id: "site-1", name: "Harare Main" },
        },
      ]);

    mockedPrisma.fiscalDay.findMany.mockResolvedValueOnce([
      {
        id: "fday-1",
        fiscalDayNo: 42,
        status: "OPENED",
        openedAt: new Date("2026-11-05T07:30:00.000Z"),
        deviceId: "FDMS-1001",
        lastError: null,
        _count: { receipts: 19 },
      },
    ]);

    mockedPrisma.crmDailyLog.findMany.mockResolvedValueOnce([
      {
        id: "log-1",
        logDate: new Date("2026-11-05T00:00:00.000Z"),
        notes: null,
        submittedAt: null,
        entries: [
          {
            id: "entry-1",
            direction: "SPENT",
            amount: 45,
            projectId: null,
            receiptUrl: null,
          },
        ],
        user: { id: "user-1", name: "Nyasha" },
      },
    ]);

    mockedPrisma.shiftReport.findMany.mockResolvedValueOnce([
      {
        id: "sr-1",
        date: new Date("2026-11-06T08:00:00.000Z"),
        shift: "DAY SHIFT",
        workType: "MINING",
        crewCount: 14,
        site: { id: "site-1", name: "Shaft A" },
        groupLeader: { name: "Kudzai" },
      },
    ]);

    const feed = await detectEmergencyAlerts({
      companyId: "comp-1",
      userId: "user-1",
      now,
    });

    expect(feed.shouldPromptDialog).toBe(true);
    expect(feed.counts.critical).toBe(4);
    expect(feed.counts.warning).toBe(1);
    expect(feed.counts.pastUnclosedDays).toBe(4);

    const categories = feed.items.map((item) => item.category);
    expect(categories).toContain("retail-shift");
    expect(categories).toContain("retail-day-close");
    expect(categories).toContain("fiscal-day-close");
    expect(categories).toContain("cost-tracking");
    expect(categories).toContain("operations-shift");

    // Critical items are sorted ahead of warning items
    expect(feed.items[0]?.severity).toBe("critical");
    expect(feed.items[feed.items.length - 1]?.severity).toBe("warning");
  });

  it("supports registering custom emergency detectors via registerEmergencyDetector", async () => {
    const customItem: EmergencyAlertItem = {
      id: "custom-emergency:vault-audit",
      category: "emergency",
      module: "books",
      moduleLabel: "Treasury",
      severity: "critical",
      title: "Vault reconciliation overdue",
      summary: "Main cash vault has not been verified in 48 hours.",
      day: "2026-11-04",
      dayLabel: "2 days ago",
      isPastDay: true,
      shortcut: {
        label: "Open Vault Reconciliation",
        href: "/books/reconciliations",
      },
      workflow: null,
    };

    registerEmergencyDetector({
      key: "test-custom-detector",
      detect: async () => [customItem],
    });

    const feed = await detectEmergencyAlerts({
      companyId: "comp-1",
      userId: "user-1",
      now,
    });

    expect(feed.items.some((item) => item.id === "custom-emergency:vault-audit")).toBe(true);
    expect(feed.shouldPromptDialog).toBe(true);

    // Clean up custom detector
    registerEmergencyDetector({
      key: "test-custom-detector",
      detect: async () => [],
    });
  });

  it("executes submit-shift-report workflow in-place and batch-closes eligible items", async () => {
    mockedPrisma.shiftReport.findFirst.mockResolvedValueOnce({
      id: "sr-1",
      shift: "NIGHT SHIFT",
      status: "DRAFT",
      site: { name: "Plant 1" },
    });
    mockedPrisma.shiftReport.update.mockResolvedValueOnce({
      id: "sr-1",
      status: "SUBMITTED",
    });

    const dummySession = {
      user: { id: "user-1", companyId: "comp-1", name: "Admin", role: "MANAGER" },
    } as unknown as ShiftSession;

    const singleResult = await executeEmergencyWorkflow(
      {
        companyId: "comp-1",
        userId: "user-1",
        session: dummySession,
      },
      {
        actionKey: "submit-shift-report",
        payload: { reportId: "sr-1" },
        note: "All equipment handed over safely.",
      },
    );

    expect(singleResult.ok).toBe(true);
    expect(singleResult.message).toContain("Submitted NIGHT SHIFT shift report");
    expect(mockedPrisma.shiftReport.update).toHaveBeenCalledWith({
      where: { id: "sr-1" },
      data: {
        status: "SUBMITTED",
        handoverNotes: "All equipment handed over safely.",
      },
    });

    // Test batch workflow when a past draft shift report is detected
    mockedPrisma.shiftReport.findMany.mockResolvedValueOnce([
      {
        id: "sr-2",
        date: new Date("2026-11-05T08:00:00.000Z"),
        shift: "MORNING SHIFT",
        workType: "PROCESSING",
        crewCount: 9,
        site: { id: "site-1", name: "Plant 1" },
        groupLeader: { name: "Tendai" },
      },
    ]);
    mockedPrisma.shiftReport.findFirst.mockResolvedValueOnce({
      id: "sr-2",
      shift: "MORNING SHIFT",
      status: "DRAFT",
      site: { name: "Plant 1" },
    });
    mockedPrisma.shiftReport.update.mockResolvedValueOnce({
      id: "sr-2",
      status: "SUBMITTED",
    });

    const batchResult = await executeBatchEmergencyWorkflow(
      {
        companyId: "comp-1",
        userId: "user-1",
        now,
        session: dummySession,
      },
      { onlyPastDays: true },
    );

    expect(batchResult.ok).toBe(true);
    expect(batchResult.closedCount).toBe(1);
    expect(batchResult.results?.[0]?.ok).toBe(true);
  });
});

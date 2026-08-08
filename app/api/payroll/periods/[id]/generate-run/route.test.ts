import { NextRequest, NextResponse } from "next/server"

const { validateSessionMock, createApprovalActionMock, prismaMock } = vi.hoisted(
  () => ({
    validateSessionMock: vi.fn(),
    createApprovalActionMock: vi.fn(),
    prismaMock: {
      payrollPeriod: {
        findUnique: vi.fn(),
      },
      employee: {
        findMany: vi.fn(),
      },
      compensationProfile: {
        findMany: vi.fn(),
      },
      compensationRule: {
        findMany: vi.fn(),
      },
      // Reached by `assembleSalaryRun` and `ensureHrPayrollDefaults` on the
      // salary path. Present so the guard-path tests below do not blow up on a
      // missing delegate; the salary path itself is tested for real.
      accountingSettings: { findUnique: vi.fn() },
      currencyRate: { findFirst: vi.fn() },
      attendance: { groupBy: vi.fn() },
      payeTable: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
      statutoryRate: { create: vi.fn(), findMany: vi.fn() },
      taxCredit: { create: vi.fn(), findMany: vi.fn() },
      necAgreement: { findFirst: vi.fn() },
      $transaction: vi.fn(),
    },
  }),
)

vi.mock("@/lib/api-utils", () => {
  return {
    validateSession: validateSessionMock,
    errorResponse: (
      message: string,
      status = 500,
      details?: unknown,
    ) =>
      NextResponse.json(
        {
          error: message,
          ...(details !== undefined ? { details } : {}),
        },
        { status },
      ),
    successResponse: <T>(data: T, status = 200) =>
      NextResponse.json(data, { status }),
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}))

vi.mock("@/lib/workflow/approvals", async () => {
  const actual = await vi.importActual<typeof import("@/lib/workflow/approvals")>(
    "@/lib/workflow/approvals",
  )

  return {
    ...actual,
    createApprovalAction: createApprovalActionMock,
  }
})

import { POST } from "./route"

const session = {
  user: {
    id: "user-1",
    companyId: "company-1",
    role: "MANAGER",
  },
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest(
    "http://test.local/api/payroll/periods/period-1/generate-run",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vercel-id": "iad1::test-request",
      },
      body: JSON.stringify(body),
    },
  )
}

function makePeriod(overrides: Record<string, unknown> = {}) {
  return {
    id: "period-1",
    companyId: "company-1",
    domain: "PAYROLL",
    payoutSource: null,
    status: "DRAFT",
    startDate: new Date("2026-04-01T00:00:00.000Z"),
    endDate: new Date("2026-04-30T23:59:59.999Z"),
    employeeScopeJson: null,
    appliesToContractorsOnly: false,
    company: {
      goldSettlementMode: "CURRENT_PERIOD",
    },
    runs: [],
    ...overrides,
  }
}

describe("POST /api/payroll/periods/[id]/generate-run", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    validateSessionMock.mockResolvedValue({ session })
    prismaMock.accountingSettings.findUnique.mockResolvedValue({
      baseCurrency: "USD",
    })
    prismaMock.currencyRate.findFirst.mockResolvedValue(null)
    // Already seeded, so `ensureHrPayrollDefaults` is a no-op.
    prismaMock.payeTable.count.mockResolvedValue(2)
    prismaMock.attendance.groupBy.mockResolvedValue([])
    prismaMock.necAgreement.findFirst.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns 409 when a draft run already exists and overwriteDraft is not set", async () => {
    prismaMock.payrollPeriod.findUnique.mockResolvedValue(
      makePeriod({
        runs: [{ id: "run-1", runNumber: 1, status: "DRAFT" }],
      }),
    )

    const response = await POST(makeRequest({}), {
      params: Promise.resolve({ id: "period-1" }),
    })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toContain("Draft payroll run already exists")
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("returns 409 with warnings when no salary employees are eligible", async () => {
    prismaMock.payrollPeriod.findUnique.mockResolvedValue(makePeriod())
    prismaMock.employee.findMany.mockResolvedValue([])

    const response = await POST(makeRequest({}), {
      params: Promise.resolve({ id: "period-1" }),
    })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toBe("No eligible salary employees found for this period")
    expect(body.details.warnings).toEqual([
      "No eligible employees found for this payroll period scope.",
    ])
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  // The salary path is exercised end to end against a real Postgres in
  // `lib/hr/payroll/run-integration.test.ts`. It reads compensation profiles,
  // rules, attendance, four statutory tables and an FX rate; mocking all of
  // that here would assert the shape of the mocks rather than the behaviour of
  // the route. The guard paths above stay mocked, because they return before any
  // of that happens.

  it("returns auth responses without querying payroll data", async () => {
    validateSessionMock.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    )

    const response = await POST(makeRequest({}), {
      params: Promise.resolve({ id: "period-1" }),
    })

    expect(response.status).toBe(401)
    expect(prismaMock.payrollPeriod.findUnique).not.toHaveBeenCalled()
  })
})

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

vi.mock("@/lib/hr-payroll", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hr-payroll")>(
    "@/lib/hr-payroll",
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

  it("creates a salary payroll draft from approved profiles and active rules", async () => {
    const payrollRunCreate = vi.fn().mockResolvedValue({
      id: "run-1",
      companyId: "company-1",
      periodId: "period-1",
      domain: "PAYROLL",
      runNumber: 1,
      grossTotal: 1100,
      allowancesTotal: 100,
      deductionsTotal: 100,
      netTotal: 1000,
      lineItems: [{ id: "line-1" }],
    })

    prismaMock.payrollPeriod.findUnique.mockResolvedValue(makePeriod())
    prismaMock.employee.findMany.mockResolvedValue([
      {
        id: "emp-1",
        name: "Ada",
        employeeId: "EMP-001",
        departmentId: null,
        gradeId: null,
        defaultCurrency: "USD",
      },
    ])
    prismaMock.compensationProfile.findMany.mockResolvedValue([
      {
        id: "profile-1",
        employeeId: "emp-1",
        baseAmount: 1000,
        currency: "USD",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
    ])
    prismaMock.compensationRule.findMany.mockResolvedValue([
      {
        id: "allowance-1",
        name: "Housing",
        type: "ALLOWANCE",
        calcMethod: "FIXED",
        value: 100,
        cap: null,
        taxable: true,
        employeeId: null,
        departmentId: null,
        gradeId: null,
      },
      {
        id: "deduction-1",
        name: "Pension",
        type: "DEDUCTION",
        calcMethod: "PERCENT",
        value: 10,
        cap: null,
        taxable: false,
        employeeId: null,
        departmentId: null,
        gradeId: null,
      },
    ])
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback({
        payrollRun: {
          create: payrollRunCreate,
          delete: vi.fn(),
        },
      }),
    )

    const response = await POST(makeRequest({ notes: "April payroll" }), {
      params: Promise.resolve({ id: "period-1" }),
    })
    const body = await response.json()
    const createInput = payrollRunCreate.mock.calls[0]?.[0]

    expect(response.status).toBe(201)
    expect(body.id).toBe("run-1")
    expect(createInput.data.grossTotal).toBe(1100)
    expect(createInput.data.allowancesTotal).toBe(100)
    expect(createInput.data.deductionsTotal).toBe(100)
    expect(createInput.data.netTotal).toBe(1000)
    expect(createInput.data.lineItems.create[0]).toMatchObject({
      employeeId: "emp-1",
      compensationProfileId: "profile-1",
      baseAmount: 1000,
      allowancesTotal: 100,
      deductionsTotal: 100,
      grossAmount: 1100,
      netAmount: 1000,
      currency: "USD",
    })
    expect(createApprovalActionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "PAYROLL_RUN",
        entityId: "run-1",
        action: "CREATE",
      }),
    )
  })

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

import { NextRequest, NextResponse } from "next/server"

const {
  validateSessionMock,
  createApprovalActionMock,
  captureAccountingEventMock,
  prismaMock,
} = vi.hoisted(() => ({
  validateSessionMock: vi.fn(),
  createApprovalActionMock: vi.fn(),
  captureAccountingEventMock: vi.fn(),
  prismaMock: {
    payrollRun: {
      findUnique: vi.fn(),
    },
    disbursementBatch: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock("@/lib/api-utils", () => {
  return {
    validateSession: validateSessionMock,
    getPaginationParams: () => ({ page: 1, limit: 50, skip: 0 }),
    paginationResponse: <T>(data: T[], total: number, page: number, limit: number) => ({
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    }),
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

vi.mock("@/lib/accounting/integration", () => ({
  captureAccountingEvent: captureAccountingEventMock,
}))

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
    generateDisbursementCode: () => "DB-TEST-00001",
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

const payrollRunId = "11111111-1111-4111-8111-111111111111"
const disbursementBatchId = "22222222-2222-4222-8222-222222222222"
const lineItemId = "33333333-3333-4333-8333-333333333333"
const employeeId = "44444444-4444-4444-8444-444444444444"

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://test.local/api/disbursements/batches", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vercel-id": "iad1::test-request",
    },
    body: JSON.stringify(body),
  })
}

function makeApprovedRun(overrides: Record<string, unknown> = {}) {
  return {
    id: payrollRunId,
    companyId: "company-1",
    domain: "PAYROLL",
    payoutSource: null,
    status: "APPROVED",
    runNumber: 1,
    company: { cashDisbursementOnly: true },
    period: {
      startDate: new Date("2026-04-01T00:00:00.000Z"),
      endDate: new Date("2026-04-30T23:59:59.999Z"),
      periodKey: "2026-04",
    },
    lineItems: [
      {
        id: lineItemId,
        employeeId,
        baseAmount: 1000,
        netAmount: 1000,
        notes: "Salary run",
      },
    ],
    ...overrides,
  }
}

describe("POST /api/disbursements/batches", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    validateSessionMock.mockResolvedValue({ session })
    captureAccountingEventMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns 409 when an active batch already exists for the payroll run", async () => {
    prismaMock.payrollRun.findUnique.mockResolvedValue(makeApprovedRun())
    prismaMock.disbursementBatch.findFirst.mockResolvedValue({
      id: disbursementBatchId,
      code: "DB-001",
      status: "DRAFT",
    })

    const response = await POST(makeRequest({ payrollRunId }))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toContain("Run already has disbursement batch")
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("returns 400 when an approved payroll run has no disbursable items", async () => {
    prismaMock.payrollRun.findUnique.mockResolvedValue(
      makeApprovedRun({ lineItems: [] }),
    )
    prismaMock.disbursementBatch.findFirst.mockResolvedValue(null)

    const response = await POST(makeRequest({ payrollRunId }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe("Selected run has no disbursable items")
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("creates a cash disbursement batch from approved payroll line items", async () => {
    const disbursementBatchCreate = vi.fn().mockResolvedValue({
      id: disbursementBatchId,
      code: "DB-TEST-00001",
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      totalAmount: 1000,
      payrollRun: {
        id: payrollRunId,
        runNumber: 1,
        domain: "PAYROLL",
        payoutSource: null,
        period: {
          id: "period-1",
          periodKey: "2026-04",
          startDate: new Date("2026-04-01T00:00:00.000Z"),
          endDate: new Date("2026-04-30T23:59:59.999Z"),
        },
      },
      items: [{ id: "55555555-5555-4555-8555-555555555555" }],
    })

    prismaMock.payrollRun.findUnique.mockResolvedValue(makeApprovedRun())
    prismaMock.disbursementBatch.findFirst.mockResolvedValue(null)
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback({
        disbursementBatch: {
          create: disbursementBatchCreate,
        },
      }),
    )

    const response = await POST(
      makeRequest({ payrollRunId, notes: "Cash issued" }),
    )
    const body = await response.json()
    const createInput = disbursementBatchCreate.mock.calls[0]?.[0]

    expect(response.status).toBe(201)
    expect(body.id).toBe(disbursementBatchId)
    expect(createInput.data).toMatchObject({
      companyId: "company-1",
      payrollRunId,
      code: "DB-TEST-00001",
      status: "DRAFT",
      method: "CASH",
      totalAmount: 1000,
      itemCount: 1,
      createdById: "user-1",
    })
    expect(createInput.data.items.create).toEqual([
      {
        employeeId,
        lineItemId,
        amount: 1000,
        status: "DUE",
      },
    ])
    expect(createApprovalActionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "DISBURSEMENT_BATCH",
        entityId: disbursementBatchId,
        action: "CREATE",
      }),
    )
    expect(captureAccountingEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceDomain: "disbursements",
        sourceAction: "batch-created",
        sourceId: disbursementBatchId,
        status: "PENDING",
      }),
    )
  })
})

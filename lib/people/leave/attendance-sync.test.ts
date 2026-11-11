import { describe, it, expect, vi } from "vitest"
import { syncApprovedLeaveToAttendance } from "./attendance-sync"

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

type TxClient = Parameters<typeof syncApprovedLeaveToAttendance>[0]

describe("syncApprovedLeaveToAttendance", () => {
  it("creates attendance records as ON_LEAVE for working days when no records exist", async () => {
    const created: Record<string, unknown>[] = []
    const updated: Record<string, unknown>[] = []

    const mockTx = {
      attendance: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
          created.push(args.data)
          return Promise.resolve(args.data)
        }),
        updateMany: vi.fn().mockImplementation((args: Record<string, unknown>) => {
          updated.push(args)
          return Promise.resolve({ count: 1 })
        }),
      },
    } as unknown as TxClient

    // Mon 2026-08-03 to Wed 2026-08-05 (3 working days)
    await syncApprovedLeaveToAttendance(mockTx, {
      id: "leave-1",
      companyId: "comp-1",
      employeeId: "emp-1",
      startDate: utc("2026-08-03"),
      endDate: utc("2026-08-05"),
      leaveType: { name: "Annual Leave" },
    })

    expect(created).toHaveLength(3)
    expect(updated).toHaveLength(0)
    expect(created[0].status).toBe("ON_LEAVE")
    expect(created[0].shift).toBe("DAY SHIFT")
    expect(created[0].notes).toBe("Approved leave: Annual Leave")
  })

  it("skips weekend days and updates existing attendance records if present", async () => {
    const created: Record<string, unknown>[] = []
    const updated: Record<string, unknown>[] = []

    const mockTx = {
      attendance: {
        findMany: vi.fn().mockImplementation(({ where }: { where: { date: Date } }) => {
          // Friday has an existing record
          if (where.date.toISOString().startsWith("2026-08-07")) {
            return Promise.resolve([{ id: "att-1", status: "ABSENT" }])
          }
          return Promise.resolve([])
        }),
        create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
          created.push(args.data)
          return Promise.resolve(args.data)
        }),
        updateMany: vi.fn().mockImplementation((args: Record<string, unknown>) => {
          updated.push(args)
          return Promise.resolve({ count: 1 })
        }),
      },
    } as unknown as TxClient

    // Friday 2026-08-07 to Monday 2026-08-10 (4 calendar days, 2 working days: Fri & Mon)
    await syncApprovedLeaveToAttendance(mockTx, {
      id: "leave-2",
      companyId: "comp-1",
      employeeId: "emp-1",
      startDate: utc("2026-08-07"),
      endDate: utc("2026-08-10"),
      leaveType: { name: "Sick Leave" },
    })

    // Friday updated, Monday created. Weekend (Sat & Sun) skipped.
    expect(updated).toHaveLength(1)
    const updateData = updated[0].data as Record<string, unknown>
    expect(updateData.status).toBe("ON_LEAVE")
    expect(created).toHaveLength(1)
    const createdDate = created[0].date as Date
    expect(createdDate.toISOString().startsWith("2026-08-10")).toBe(true)
  })
})

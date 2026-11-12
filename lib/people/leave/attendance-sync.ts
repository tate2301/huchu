import { Prisma } from "@prisma/client"

import { DEFAULT_WORK_WEEK, WorkWeek } from "./working-days"

/**
 * When a leave request is approved, automatically mark the employee's
 * attendance records for all working days in the leave interval as ON_LEAVE.
 *
 * If attendance was already recorded for that day, its status is updated to ON_LEAVE.
 * If no attendance record existed, a record with shift "DAY SHIFT" is created.
 */
export async function syncApprovedLeaveToAttendance(
  tx: Prisma.TransactionClient,
  leaveRequest: {
    id: string
    companyId: string
    employeeId: string
    startDate: Date
    endDate: Date
    leaveType: { name: string }
  },
  workWeek: WorkWeek = DEFAULT_WORK_WEEK,
) {
  const start = new Date(leaveRequest.startDate)
  const end = new Date(leaveRequest.endDate)

  // Normalize to UTC start of day
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))

  const note = `Approved leave: ${leaveRequest.leaveType.name}`

  while (cur <= last) {
    const dayOfWeek = cur.getUTCDay()
    if (workWeek.has(dayOfWeek)) {
      const dayDate = new Date(cur.getTime())
      const existing = await tx.attendance.findMany({
        where: {
          companyId: leaveRequest.companyId,
          employeeId: leaveRequest.employeeId,
          date: dayDate,
        },
      })

      if (existing.length > 0) {
        await tx.attendance.updateMany({
          where: {
            companyId: leaveRequest.companyId,
            employeeId: leaveRequest.employeeId,
            date: dayDate,
          },
          data: {
            status: "ON_LEAVE",
            notes: note,
          },
        })
      } else {
        await tx.attendance.create({
          data: {
            companyId: leaveRequest.companyId,
            employeeId: leaveRequest.employeeId,
            date: dayDate,
            shift: "DAY SHIFT",
            status: "ON_LEAVE",
            notes: note,
          },
        })
      }
    }
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
}

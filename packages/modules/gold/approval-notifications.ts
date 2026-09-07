/**
 * The settlement allocation's approval notices: the one approvable entity the
 * gold module owns, told through the people module's approval emitter (the
 * payout is the workers', and the notice reads as HR's). A host registers
 * `emitGoldApprovalNotification` with the workflow module's `onApprovalAction`.
 */
import { NotificationEntityType, NotificationType, type ApprovalActionType } from "@corelithzw/db"
import type { DbClient } from "@corelithzw/module-notifications/service"
import {
  emitApprovalNotice,
  type ApprovalNoticeInput,
  type ApprovalNoticeResolver,
} from "@corelithzw/module-people/approval-notifications"

function mapAllocationApproval(action: ApprovalActionType): NotificationType | null {
  if (action === "SUBMIT") return NotificationType.HR_GOLD_PAYOUT_SUBMITTED
  if (action === "APPROVE") return NotificationType.HR_GOLD_PAYOUT_APPROVED
  if (action === "REJECT") return NotificationType.HR_GOLD_PAYOUT_REJECTED
  return null
}

function allocationCopy(type: NotificationType, actorName: string, label: string) {
  switch (type) {
    case NotificationType.HR_GOLD_PAYOUT_SUBMITTED:
      return { title: "Settlement allocation pending approval", summary: `${actorName} submitted ${label}.` }
    case NotificationType.HR_GOLD_PAYOUT_APPROVED:
      return { title: "Settlement allocation approved", summary: `${actorName} approved ${label}.` }
    case NotificationType.HR_GOLD_PAYOUT_REJECTED:
      return { title: "Settlement allocation rejected", summary: `${actorName} rejected ${label}.` }
    default:
      return { title: "Workflow update", summary: `${actorName} updated ${label}.` }
  }
}

export const resolveGoldApprovalNotice: ApprovalNoticeResolver = async (db, input) => {
  if (input.entityType !== "GOLD_SHIFT_ALLOCATION") return null
  const type = mapAllocationApproval(input.action)
  if (!type) return null

  const allocation = await db.goldShiftAllocation.findUnique({
    where: { id: input.entityId },
    select: {
      id: true,
      date: true,
      shift: true,
      totalWeight: true,
      netWeight: true,
      workerShareWeight: true,
      submittedById: true,
      createdById: true,
      site: { select: { code: true, name: true } },
    },
  })
  if (!allocation) return null
  const shiftDate = allocation.date.toISOString().slice(0, 10)
  const label = `${shiftDate} ${allocation.shift} - ${allocation.site.code}`
  return {
    type,
    entityType: NotificationEntityType.GOLD_SHIFT_ALLOCATION,
    category: "HR",
    context: {
      submittedById: allocation.submittedById,
      createdById: allocation.createdById,
      label,
      viewPath: `/gold/settlement/approvals?allocationId=${allocation.id}`,
      payload: {
        shiftDate,
        shift: allocation.shift,
        siteCode: allocation.site.code,
        siteName: allocation.site.name,
        totalWeight: allocation.totalWeight,
        netWeight: allocation.netWeight,
        workerShareWeight: allocation.workerShareWeight,
      },
    },
    copy: (actorName) => allocationCopy(type, actorName, label),
  }
}

/** After an approval action on a settlement allocation: the approvers, or the submitter and the prior approvers, are told. */
export function emitGoldApprovalNotification(db: DbClient, input: ApprovalNoticeInput) {
  return emitApprovalNotice(db, input, resolveGoldApprovalNotice)
}

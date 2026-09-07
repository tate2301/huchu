/**
 * Who an operational notice escalates to, and how loud it is.
 *
 * The managers and superadmins of the company, plus the clerk who raised it
 * unless the matter is critical, in which case the clerk is not told twice.
 * The people, compliance and maintenance modules all notify this way; the
 * scale below turns a module's own severity words into the centre's.
 */
import { NotificationSeverity } from "@corelithzw/db"
import type { DbClient } from "./service"

/** The managers and superadmins, plus the clerk who raised it unless it is critical. */
export async function escalationRecipientIds(
  db: DbClient,
  input: {
    companyId: string
    actorId: string
    actorRole?: string
    severity: NotificationSeverity
  },
) {
  const approvers = await db.user.findMany({
    where: {
      companyId: input.companyId,
      role: { in: ["MANAGER", "SUPERADMIN"] },
      isActive: true,
    },
    select: { id: true },
  })

  const recipientIds = new Set(approvers.map((user) => user.id))
  if (input.actorRole === "CLERK" && input.severity !== NotificationSeverity.CRITICAL) {
    recipientIds.add(input.actorId)
  }

  return Array.from(recipientIds)
}

/** CRITICAL and HIGH escalate, MEDIUM warns, the rest inform. */
export function severityFromIncidentLevel(rawSeverity: string) {
  const severity = rawSeverity.toUpperCase()
  if (severity === "CRITICAL" || severity === "HIGH") return NotificationSeverity.CRITICAL
  if (severity === "MEDIUM") return NotificationSeverity.WARNING
  return NotificationSeverity.INFO
}

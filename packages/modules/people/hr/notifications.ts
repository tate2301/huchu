/**
 * What the HR module tells people about: an incident reported against an
 * employee, and its status changing. Approval notices are in
 * `../approval-notifications.ts`.
 */
import { NotificationEntityType, NotificationSourceAction, NotificationType } from "@corelithzw/db"
import { createNotification, type DbClient } from "@corelithzw/module-notifications/service"
import { escalationRecipientIds, severityFromIncidentLevel } from "@corelithzw/module-notifications/escalation"

export async function emitHrIncidentNotification(
  db: DbClient,
  input: {
    companyId: string
    actorId: string
    actorRole?: string
    event: "CREATED" | "STATUS_CHANGED"
    incident: {
      id: string
      title: string
      severity: string
      status: string
      employee: { id: string; employeeId: string; name: string }
      site?: { id?: string; name?: string; code?: string } | null
    }
    previousStatus?: string | null
  },
) {
  try {
    const severity = severityFromIncidentLevel(input.incident.severity)
    const recipientIds = await escalationRecipientIds(db, {
      companyId: input.companyId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      severity,
    })

    const type =
      input.event === "CREATED"
        ? NotificationType.HR_INCIDENT_CREATED
        : NotificationType.HR_INCIDENT_STATUS_CHANGED
    const title =
      input.event === "CREATED"
        ? `HR incident reported: ${input.incident.title}`
        : `HR incident status changed: ${input.incident.status}`
    const summary =
      input.event === "CREATED"
        ? `${input.incident.employee.name} (${input.incident.employee.employeeId}) has a new HR incident.`
        : `${input.incident.employee.name} moved from ${input.previousStatus ?? "UNKNOWN"} to ${input.incident.status}.`

    return createNotification(db, {
      companyId: input.companyId,
      type,
      title,
      summary,
      severity,
      category: "HR",
      recipientIds,
      payload: {
        incidentTitle: input.incident.title,
        status: input.incident.status,
        severity: input.incident.severity,
        employeeName: input.incident.employee.name,
        employeeId: input.incident.employee.employeeId,
        siteName: input.incident.site?.name ?? null,
        siteCode: input.incident.site?.code ?? null,
        previousStatus: input.previousStatus ?? null,
        viewPath: `/people/incidents?incidentId=${input.incident.id}`,
      },
      entityType: NotificationEntityType.HR_INCIDENT,
      entityId: input.incident.id,
      sourceAction:
        input.event === "CREATED"
          ? NotificationSourceAction.CREATE
          : NotificationSourceAction.STATUS_CHANGE,
    })
  } catch (error) {
    console.error("[Notifications] Failed to emit HR incident notification:", error)
    return null
  }
}

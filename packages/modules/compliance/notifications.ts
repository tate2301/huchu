/**
 * What the compliance module tells people about: an incident reported or
 * moved, and a permit expiring or expired.
 */
import { NotificationEntityType, NotificationSeverity, NotificationSourceAction, NotificationType } from "@corelithzw/db"
import { createNotification, type DbClient } from "@corelithzw/module-notifications/service"
import { escalationRecipientIds, severityFromIncidentLevel } from "@corelithzw/module-notifications/escalation"

function normalizePermitSeverity(status: string) {
  return status === "EXPIRED" ? NotificationSeverity.CRITICAL : NotificationSeverity.WARNING
}

export async function emitIncidentNotification(
  db: DbClient,
  input: {
    companyId: string
    actorId: string
    actorRole?: string
    event: "CREATED" | "STATUS_CHANGED"
    incident: {
      id: string
      incidentType: string
      severity: string
      status: string
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
        ? NotificationType.OPS_INCIDENT_CREATED
        : NotificationType.OPS_INCIDENT_STATUS_CHANGED
    const title =
      input.event === "CREATED"
        ? `Incident reported: ${input.incident.incidentType}`
        : `Incident status changed: ${input.incident.status}`
    const siteCode = input.incident.site?.code ?? "site"
    const summary =
      input.event === "CREATED"
        ? `${input.incident.incidentType} reported at ${siteCode}.`
        : `Incident at ${siteCode} moved from ${input.previousStatus ?? "UNKNOWN"} to ${input.incident.status}.`

    return createNotification(db, {
      companyId: input.companyId,
      type,
      title,
      summary,
      severity,
      category: "OPS",
      recipientIds,
      payload: {
        incidentType: input.incident.incidentType,
        severity: input.incident.severity,
        status: input.incident.status,
        previousStatus: input.previousStatus ?? null,
        siteName: input.incident.site?.name ?? null,
        siteCode: input.incident.site?.code ?? null,
        viewPath: `/compliance/incidents?createdId=${input.incident.id}`,
      },
      entityType: NotificationEntityType.INCIDENT,
      entityId: input.incident.id,
      sourceAction:
        input.event === "CREATED"
          ? NotificationSourceAction.CREATE
          : NotificationSourceAction.STATUS_CHANGE,
    })
  } catch (error) {
    console.error("[Notifications] Failed to emit incident notification:", error)
    return null
  }
}

export async function emitPermitRiskNotification(
  db: DbClient,
  input: {
    companyId: string
    actorId: string
    actorRole?: string
    permit: {
      id: string
      permitNumber: string
      permitType: string
      status: string
      expiryDate: Date
      site?: { id?: string; name?: string; code?: string } | null
    }
  },
) {
  try {
    if (input.permit.status !== "EXPIRING_SOON" && input.permit.status !== "EXPIRED") {
      return null
    }

    const severity = normalizePermitSeverity(input.permit.status)
    const recipientIds = await escalationRecipientIds(db, {
      companyId: input.companyId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      severity,
    })
    const type =
      input.permit.status === "EXPIRED"
        ? NotificationType.OPS_PERMIT_EXPIRED
        : NotificationType.OPS_PERMIT_EXPIRING
    const title =
      input.permit.status === "EXPIRED"
        ? `Permit expired: ${input.permit.permitNumber}`
        : `Permit expiring soon: ${input.permit.permitNumber}`
    const siteCode = input.permit.site?.code ?? "site"
    const summary = `${input.permit.permitType} permit at ${siteCode} is ${input.permit.status.toLowerCase()}.`

    return createNotification(db, {
      companyId: input.companyId,
      type,
      title,
      summary,
      severity,
      category: "OPS",
      recipientIds,
      payload: {
        permitNumber: input.permit.permitNumber,
        permitType: input.permit.permitType,
        status: input.permit.status,
        expiryDate: input.permit.expiryDate.toISOString(),
        siteName: input.permit.site?.name ?? null,
        siteCode: input.permit.site?.code ?? null,
        viewPath: `/compliance/permits?createdId=${input.permit.id}`,
      },
      entityType: NotificationEntityType.PERMIT,
      entityId: input.permit.id,
      sourceAction: NotificationSourceAction.EXPIRY_ALERT,
    })
  } catch (error) {
    console.error("[Notifications] Failed to emit permit notification:", error)
    return null
  }
}

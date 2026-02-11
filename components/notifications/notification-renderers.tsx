"use client"

import type { NotificationListItem, NotificationType } from "@/lib/api"
import type { ReactNode } from "react"

type RendererProps = {
  item: NotificationListItem
}

function payloadValue(item: NotificationListItem, key: string) {
  const value = item.payload?.[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : null
}

function GenericRenderer({ item }: RendererProps) {
  return <p className="text-sm text-muted-foreground">{item.summary}</p>
}

function WorkflowRenderer({ item }: RendererProps) {
  const label = payloadValue(item, "label")
  const actor = payloadValue(item, "actorName")

  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{item.summary}</p>
      <div className="text-xs text-muted-foreground">
        {label ? `Target: ${label}` : null}
        {label && actor ? " | " : null}
        {actor ? `By: ${actor}` : null}
      </div>
    </div>
  )
}

function IncidentRenderer({ item }: RendererProps) {
  const incidentType = payloadValue(item, "incidentType")
  const status = payloadValue(item, "status")
  const siteCode = payloadValue(item, "siteCode")
  const severity = payloadValue(item, "severity")

  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{item.summary}</p>
      <div className="text-xs text-muted-foreground">
        {incidentType ? `Type: ${incidentType}` : null}
        {incidentType && status ? " | " : null}
        {status ? `Status: ${status}` : null}
        {(incidentType || status) && siteCode ? " | " : null}
        {siteCode ? `Site: ${siteCode}` : null}
        {(incidentType || status || siteCode) && severity ? " | " : null}
        {severity ? `Severity: ${severity}` : null}
      </div>
    </div>
  )
}

function PermitRenderer({ item }: RendererProps) {
  const permitNumber = payloadValue(item, "permitNumber")
  const permitType = payloadValue(item, "permitType")
  const status = payloadValue(item, "status")
  const expiryDate = payloadValue(item, "expiryDate")

  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{item.summary}</p>
      <div className="text-xs text-muted-foreground">
        {permitNumber ? `Permit: ${permitNumber}` : null}
        {permitNumber && permitType ? " | " : null}
        {permitType ? `Type: ${permitType}` : null}
        {(permitNumber || permitType) && status ? " | " : null}
        {status ? `Status: ${status}` : null}
        {(permitNumber || permitType || status) && expiryDate ? " | " : null}
        {expiryDate ? `Expiry: ${new Date(expiryDate).toLocaleDateString()}` : null}
      </div>
    </div>
  )
}

function WorkOrderRenderer({ item }: RendererProps) {
  const equipmentCode = payloadValue(item, "equipmentCode")
  const equipmentName = payloadValue(item, "equipmentName")
  const status = payloadValue(item, "status")
  const issue = payloadValue(item, "issue")

  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{item.summary}</p>
      <div className="text-xs text-muted-foreground">
        {equipmentCode ? `Equipment: ${equipmentCode}` : null}
        {equipmentCode && equipmentName ? " | " : null}
        {equipmentName ? equipmentName : null}
        {(equipmentCode || equipmentName) && status ? " | " : null}
        {status ? `Status: ${status}` : null}
      </div>
      {issue ? <p className="text-xs text-muted-foreground">Issue: {issue}</p> : null}
    </div>
  )
}

const registry: Partial<Record<NotificationType, (props: RendererProps) => ReactNode>> = {
  HR_PAYROLL_SUBMITTED: WorkflowRenderer,
  HR_PAYROLL_APPROVED: WorkflowRenderer,
  HR_PAYROLL_REJECTED: WorkflowRenderer,
  HR_DISBURSEMENT_SUBMITTED: WorkflowRenderer,
  HR_DISBURSEMENT_APPROVED: WorkflowRenderer,
  HR_DISBURSEMENT_REJECTED: WorkflowRenderer,
  HR_ADJUSTMENT_SUBMITTED: WorkflowRenderer,
  HR_ADJUSTMENT_APPROVED: WorkflowRenderer,
  HR_ADJUSTMENT_REJECTED: WorkflowRenderer,
  HR_COMP_PROFILE_SUBMITTED: WorkflowRenderer,
  HR_COMP_PROFILE_APPROVED: WorkflowRenderer,
  HR_COMP_PROFILE_REJECTED: WorkflowRenderer,
  HR_COMP_RULE_SUBMITTED: WorkflowRenderer,
  HR_COMP_RULE_APPROVED: WorkflowRenderer,
  HR_COMP_RULE_REJECTED: WorkflowRenderer,
  HR_GOLD_PAYOUT_SUBMITTED: WorkflowRenderer,
  HR_GOLD_PAYOUT_APPROVED: WorkflowRenderer,
  HR_GOLD_PAYOUT_REJECTED: WorkflowRenderer,
  OPS_INCIDENT_CREATED: IncidentRenderer,
  OPS_INCIDENT_STATUS_CHANGED: IncidentRenderer,
  OPS_PERMIT_EXPIRING: PermitRenderer,
  OPS_PERMIT_EXPIRED: PermitRenderer,
  OPS_WORK_ORDER_OPENED: WorkOrderRenderer,
  OPS_WORK_ORDER_IN_PROGRESS: WorkOrderRenderer,
}

export function NotificationRichBody({ item }: RendererProps) {
  const Renderer = registry[item.type] ?? GenericRenderer
  return <Renderer item={item} />
}

"use client";

import { AlertCircle, Clock } from "@/lib/icons";
import { formatSlaRemaining, stageSla } from "@/lib/crm/sla";
import type { CrmLeadListRecord } from "@/lib/crm/crm-v2";

import { BoardCardFace, BoardCardSignal } from "@/components/crm/records/board-card-face";
import { useBoardField } from "@/components/crm/records/board-fields";

import { formatDaysAgo, formatLeadValue, isOverdue } from "./stage-config";

/** A pipeline card's face. The board supplies the card around it. */
export function LeadCardBody({ lead }: { lead: CrmLeadListRecord }) {
  const showReference = useBoardField("reference");
  const showClient = useBoardField("client");
  const showValue = useBoardField("value");
  const showOwner = useBoardField("owner");
  const showSla = useBoardField("sla");
  const showOverdue = useBoardField("overdue");

  // Time in stage against what the stage is allowed, counted in working hours.
  // "3 days in stage" over a weekend is not the same fact as three working
  // days, and the card is where somebody decides what to pick up next.
  const sla = stageSla(lead.stage, lead.stageEnteredAt);
  const slaLabel = formatSlaRemaining(sla);
  const overdue = showOverdue && isOverdue(lead.nextFollowUp?.dueAt);

  const reference = lead.deal?.dealNo ?? lead.leadNo;
  const client = lead.client?.name ?? lead.contactName ?? "No client";

  return (
    <BoardCardFace
      title={lead.title ?? lead.leadNo}
      subtitle={
        showReference || showClient ? (
          <>
            {showReference ? <span className="font-mono">{reference}</span> : null}
            {showReference && showClient ? " · " : null}
            {showClient ? client : null}
          </>
        ) : undefined
      }
      // The deal's own value supersedes the lead's estimate once one exists —
      // that is the number somebody actually agreed to.
      figure={showValue ? formatLeadValue(lead.deal?.value ?? lead.estimatedValue, lead.currency) : undefined}
      owner={showOwner ? (lead.assignedTo?.name ?? null) : undefined}
    >
      {showSla ? (
        <BoardCardSignal
          icon={Clock}
          tone={sla.breached ? "danger" : sla.atRisk ? "warn" : "neutral"}
        >
          {formatDaysAgo(lead.stageEnteredAt)} in stage
          {slaLabel ? ` · ${slaLabel}` : ""}
        </BoardCardSignal>
      ) : null}
      {overdue ? (
        <BoardCardSignal icon={AlertCircle} tone="danger">
          Overdue: {lead.nextFollowUp?.title ?? "follow-up"}
        </BoardCardSignal>
      ) : null}
    </BoardCardFace>
  );
}

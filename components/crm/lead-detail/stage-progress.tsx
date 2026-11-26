"use client";

import type { CrmLeadStage } from "@prisma/client";

import { StageMenu } from "@/components/records/stage-menu";
import { CRM_LEAD_STAGES, CRM_STAGE_LABELS } from "@/lib/crm/pipeline";

/**
 * A lead's stage, as the app bar's stage menu. Won and Lost are outcomes, not
 * steps along the way, so they sit after the rule.
 */
export function StageProgress({
  stage,
  onChange,
  disabled,
}: {
  stage: CrmLeadStage;
  onChange: (stage: CrmLeadStage) => void;
  disabled?: boolean;
}) {
  return (
    <StageMenu
      label="Lead stage"
      currentId={stage}
      disabled={disabled}
      stages={CRM_LEAD_STAGES.map((entry) => ({
        id: entry,
        label: CRM_STAGE_LABELS[entry],
        outcome: entry === "WON" || entry === "LOST",
      }))}
      onPick={(picked) => onChange(picked.id as CrmLeadStage)}
    />
  );
}

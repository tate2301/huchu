import type { CrmLeadStage } from "@corelithzw/db";
import type { CanonicalUiStatus } from "@corelithzw/ui/lib/ui/status-map";

export { CRM_LEAD_STAGES, CRM_STAGE_LABELS } from "@/lib/crm/pipeline";

/**
 * Stage → the platform's canonical status tone. Early stages read as pending,
 * work in flight as progress, and only the two terminal stages carry the
 * success/failure weight — so a board scan tells you where the money is.
 */
export const CRM_STAGE_STATUS: Record<CrmLeadStage, CanonicalUiStatus> = {
  NEW: "pending",
  CONTACTED: "pending",
  QUALIFIED: "in_progress",
  SITE_VISIT: "in_progress",
  QUOTED: "in_review",
  INVOICED: "in_review",
  WON: "passing",
  LOST: "failing",
};

export const CRM_CHANNEL_LABELS: Record<string, string> = {
  MANUAL: "Manual",
  WEB_FORM: "Web form",
  WEBHOOK: "Webhook",
  SOCIAL: "Social",
  ADS: "Ads",
  REFERRAL: "Referral",
  OTHER: "Other",
};

export const CRM_LEAD_CHANNELS = [
  "MANUAL",
  "WEB_FORM",
  "WEBHOOK",
  "SOCIAL",
  "ADS",
  "REFERRAL",
  "OTHER",
] as const;

/** Money as it appears in tables and on cards — grouped, no trailing cents noise. */
export function formatLeadValue(value: number | null | undefined, currency: string): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${currency} ${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Compact relative age, e.g. "today", "6d", "3w". */
export function formatDaysAgo(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const then = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(then.getTime())) return "—";
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d";
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

export function isOverdue(dueAt: string | null | undefined): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}


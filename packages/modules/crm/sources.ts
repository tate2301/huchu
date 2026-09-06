/**
 * Lead-source attribution.
 *
 * Every lead carries a free-text `source`, UTM fields, and a normalized
 * `sourceChannel` used for filtering and insights. The channel is derived
 * once at capture time from (in priority order): an explicit channel, paid
 * UTM signals, known social sources, referral hints, then the capture origin
 * (rep-entered, hosted intake form, or webhook).
 */
import type { CrmLeadChannel } from "@corelithzw/db";

export const CRM_LEAD_CHANNELS: CrmLeadChannel[] = [
  "MANUAL",
  "WEB_FORM",
  "WEBHOOK",
  "SOCIAL",
  "ADS",
  "REFERRAL",
  "OTHER",
];

export const CRM_CHANNEL_LABELS: Record<CrmLeadChannel, string> = {
  MANUAL: "Rep entered",
  WEB_FORM: "Web form",
  WEBHOOK: "Integration",
  SOCIAL: "Social media",
  ADS: "Paid ads",
  REFERRAL: "Referral",
  OTHER: "Other",
};

const SOCIAL_SOURCES = new Set([
  "facebook",
  "fb",
  "instagram",
  "ig",
  "tiktok",
  "twitter",
  "x",
  "linkedin",
  "whatsapp",
  "youtube",
  "threads",
  "pinterest",
  "snapchat",
]);

const ADS_MEDIUMS = new Set([
  "cpc",
  "ppc",
  "cpm",
  "paid",
  "paid_social",
  "paidsocial",
  "paid-social",
  "display",
  "ads",
  "ad",
  "retargeting",
  "sponsored",
]);

function norm(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidChannel(value: string | null | undefined): value is CrmLeadChannel {
  return CRM_LEAD_CHANNELS.includes(norm(value).toUpperCase() as CrmLeadChannel);
}

export type DeriveChannelInput = {
  /** Declared channel (from a webhook payload or an API key default). Wins when valid. */
  explicitChannel?: string | null;
  utmMedium?: string | null;
  utmSource?: string | null;
  source?: string | null;
  /** How the lead physically entered the system. */
  origin: "MANUAL" | "WEB_FORM" | "WEBHOOK";
};

export function deriveLeadChannel(input: DeriveChannelInput): CrmLeadChannel {
  const explicit = norm(input.explicitChannel).toUpperCase();
  if (isValidChannel(explicit)) return explicit as CrmLeadChannel;

  const medium = norm(input.utmMedium);
  if (medium && ADS_MEDIUMS.has(medium)) return "ADS";

  const utmSource = norm(input.utmSource);
  const source = norm(input.source);
  if (SOCIAL_SOURCES.has(utmSource) || SOCIAL_SOURCES.has(source)) {
    // A social source arriving with a paid medium was caught above; organic
    // social traffic lands here.
    return "SOCIAL";
  }

  if (source.includes("referral") || medium === "referral") return "REFERRAL";

  return input.origin;
}

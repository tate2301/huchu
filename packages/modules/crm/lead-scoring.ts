/**
 * Lead scoring, deliberately transparent.
 *
 * A score nobody can explain is a score nobody trusts, and a rep who doesn't
 * trust it works the list in whatever order they like. So this is a small set
 * of named rules with visible weights — every point on a lead can be traced
 * back to a sentence you could say out loud.
 */
import type { CrmLeadChannel } from "@corelithzw/db";

export type ScoreSignal = {
  key: string;
  label: string;
  points: number;
};

export type LeadScore = {
  /** 0–100. */
  total: number;
  band: "COLD" | "WARM" | "HOT";
  signals: ScoreSignal[];
};

export type ScorableLead = {
  estimatedValue?: number | null;
  currency?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  clientId?: string | null;
  services?: string[] | null;
  sourceChannel?: CrmLeadChannel | null;
  source?: string | null;
  createdAt?: Date | string | null;
  firstContactAt?: Date | string | null;
  /** Activity and appointment counts, which say more than any field does. */
  activityCount?: number;
  appointmentCount?: number;
  documentCount?: number;
};

/**
 * Channels ranked by how much intent they imply. Somebody who filled in a
 * form asking for a quote is further along than a name typed in from a trade
 * show badge.
 */
const CHANNEL_POINTS: Record<CrmLeadChannel, number> = {
  WEB_FORM: 12,
  REFERRAL: 12,
  WEBHOOK: 8,
  ADS: 6,
  SOCIAL: 5,
  MANUAL: 2,
  OTHER: 1,
};

/** Value thresholds, in the tenant's own currency — no conversion is done. */
const VALUE_BANDS: { min: number; points: number; label: string }[] = [
  { min: 50_000, points: 25, label: "Deal size over 50k" },
  { min: 20_000, points: 20, label: "Deal size over 20k" },
  { min: 5_000, points: 14, label: "Deal size over 5k" },
  { min: 1_000, points: 8, label: "Deal size over 1k" },
  { min: 0.01, points: 4, label: "Deal size recorded" },
];

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

export function scoreLead(lead: ScorableLead, now: Date = new Date()): LeadScore {
  const signals: ScoreSignal[] = [];
  const add = (key: string, label: string, points: number) => {
    if (points > 0) signals.push({ key, label, points });
  };

  const value = lead.estimatedValue ?? 0;
  const band = VALUE_BANDS.find((entry) => value >= entry.min);
  if (band) add("value", band.label, band.points);

  // Two ways to reach someone beats one, and one beats none.
  const contactPoints = (lead.contactEmail ? 6 : 0) + (lead.contactPhone ? 8 : 0);
  add("contactable", lead.contactEmail && lead.contactPhone ? "Phone and email on file" : lead.contactPhone ? "Phone number on file" : "Email on file", contactPoints);

  if (lead.clientId) add("known_company", "Linked to a known company", 10);

  const channel = lead.sourceChannel ?? "MANUAL";
  add("channel", `Came in via ${channel.toLowerCase().replace(/_/g, " ")}`, CHANNEL_POINTS[channel] ?? 0);

  if ((lead.services?.length ?? 0) > 0) add("services", "Said what they want", 6);

  // Engagement is the strongest signal there is, so it is capped rather than
  // unbounded — twenty notes on a dead lead shouldn't outrank a live one.
  const activityPoints = Math.min(15, (lead.activityCount ?? 0) * 3);
  add("engagement", "Conversations logged", activityPoints);

  if ((lead.appointmentCount ?? 0) > 0) add("visit", "Site visit booked or done", 12);
  if ((lead.documentCount ?? 0) > 0) add("quoted", "Quote or invoice issued", 10);

  // Speed of first response, which is the one thing a team actually controls.
  const created = toDate(lead.createdAt);
  const contacted = toDate(lead.firstContactAt);
  if (created && contacted) {
    const hours = (contacted.getTime() - created.getTime()) / 3_600_000;
    if (hours <= 1) add("fast_response", "Contacted within the hour", 10);
    else if (hours <= 24) add("fast_response", "Contacted within a day", 6);
  }

  let total = signals.reduce((sum, signal) => sum + signal.points, 0);

  // Going quiet costs points rather than being silently ignored, so a stale
  // list decays instead of staying permanently "hot".
  if (created && !contacted) {
    const ageDays = (now.getTime() - created.getTime()) / 86_400_000;
    if (ageDays > 14) {
      const penalty = Math.min(15, Math.floor((ageDays - 14) / 7) * 5 + 5);
      signals.push({ key: "stale", label: "Nobody has made contact", points: -penalty });
      total -= penalty;
    }
  }

  total = Math.max(0, Math.min(100, Math.round(total)));

  return {
    total,
    band: total >= 65 ? "HOT" : total >= 35 ? "WARM" : "COLD",
    signals,
  };
}

export const SCORE_BAND_LABELS: Record<LeadScore["band"], string> = {
  HOT: "Hot",
  WARM: "Warm",
  COLD: "Cold",
};

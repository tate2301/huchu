import { randomBytes } from "crypto";

/**
 * The public brief for a site visit.
 *
 * A visit was only legible to somebody with an account. But the people who
 * most need to know where to be at 8am — the customer expecting a van, a
 * subcontractor with a ladder — are exactly the people who do not have one,
 * and the answer until now was somebody retyping the address into WhatsApp.
 *
 * So a visit can be shared as a link, the same shape as a document approval:
 * one token, no session, revocable by rotating it.
 *
 * What the brief shows is deliberately narrow. Where, when, who is coming and
 * what the job is. Not the value of the deal, not the margin, not the notes
 * the team wrote each other — a link that gets forwarded should not carry
 * anything that would embarrass the sender.
 */

export function generateBriefToken(): string {
  return randomBytes(32).toString("base64url");
}

export type VisitBriefSource = {
  appointmentNo: string;
  title: string;
  scheduledStart: Date | string;
  scheduledEnd: Date | string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  briefExpiresAt: Date | string | null;
  assignedTo: { name: string | null } | null;
  site: { name: string; addressLine: string | null; city: string | null } | null;
  client: { name: string } | null;
  checklist: unknown;
};

export type VisitBrief = {
  reference: string;
  title: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  /** One line somebody can read out to a driver. */
  where: string | null;
  /** A maps link, when the place is pinned. */
  mapUrl: string | null;
  attendingName: string | null;
  customerName: string | null;
  /** What to bring or check — labels only, never the team's notes. */
  checklist: string[];
};

function isoOf(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

/** Has the link stopped working? Expiry is optional; absent means it stands. */
export function isBriefExpired(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  const at = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(at.getTime())) return false;
  return at.getTime() <= now.getTime();
}

/** The address as one readable line: the site's, or whatever was typed. */
export function briefWhere(source: VisitBriefSource): string | null {
  if (source.site) {
    const parts = [source.site.name, source.site.addressLine, source.site.city]
      .map((part) => part?.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts.join(", ");
  }
  return source.location?.trim() || null;
}

/**
 * Checklist labels only. The stored checklist carries per-item notes the team
 * wrote for each other, and those are not for a forwarded link.
 */
export function briefChecklist(checklist: unknown): string[] {
  if (!Array.isArray(checklist)) return [];
  return checklist
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const label = (item as { label?: unknown }).label;
      return typeof label === "string" && label.trim() ? label.trim() : null;
    })
    .filter((label): label is string => label !== null);
}

export function buildVisitBrief(source: VisitBriefSource): VisitBrief {
  const pinned = source.latitude != null && source.longitude != null;
  return {
    reference: source.appointmentNo,
    title: source.title,
    scheduledStart: isoOf(source.scheduledStart) as string,
    scheduledEnd: isoOf(source.scheduledEnd),
    where: briefWhere(source),
    mapUrl: pinned
      ? `https://www.google.com/maps/search/?api=1&query=${source.latitude},${source.longitude}`
      : null,
    attendingName: source.assignedTo?.name ?? null,
    customerName: source.client?.name ?? null,
    checklist: briefChecklist(source.checklist),
  };
}

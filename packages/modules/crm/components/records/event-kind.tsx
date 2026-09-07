import type { Accent } from "@corelithzw/react";

import {
  ArrowRight,
  Calendar,
  ChatCircle,
  Checklist,
  FileText,
  Mail,
  MapPin,
  NoteAdd,
  Payments,
  Phone,
  Send,
  User,
} from "@corelithzw/ui/lib/icons";

/**
 * What each kind of thing that happens to a record looks like.
 *
 * One table, in one file, because the same event is drawn in three places —
 * the timeline, the "contact so far" strip, and the recent-contact list beside
 * it — and a call that is blue on the timeline and grey in the summary teaches
 * the reader nothing. Colour only becomes a shortcut once it is the *same*
 * shortcut everywhere; until then it is decoration.
 *
 * The hues are assigned by what the event *is*, not by taste:
 *
 *   - **Talking to the client** takes the cool half of the wheel — call,
 *     email, meeting, WhatsApp — because that is the bulk of a record and it
 *     should read as one family with four members.
 *   - **Being somewhere** (a site visit) takes orange: it is the one kind that
 *     costs a morning, and it should stand out of a scrolled feed.
 *   - **Ours, not theirs** — an internal comment — takes pink, the one hue no
 *     client-facing event uses, so an internal remark is never mistaken for a
 *     record of contact at a glance. That is the same mistake the composer is
 *     shaped to prevent, carried through to how it reads afterwards.
 *   - **Paperwork and money** take brown and green.
 *   - **Things the system did to the record** — a stage move, a created-at
 *     line — take gray, which is the point: they are context, not news.
 *
 * Colour is never the only channel. Every kind also has its own glyph and its
 * own word, so the coding is a third cue for people who read colour and no cue
 * lost for people who do not.
 */
export type EventKind =
  | "note"
  | "call"
  | "email"
  | "whatsapp"
  | "meeting"
  | "stage"
  | "document"
  | "payment"
  | "task"
  | "visit"
  | "comment"
  | "intake"
  | "system";

export type EventKindStyle = {
  /** The word for this kind, singular. */
  label: string;
  icon: typeof NoteAdd;
  accent: Accent;
};

export const EVENT_KIND: Record<EventKind, EventKindStyle> = {
  call: { label: "Call", icon: Phone, accent: "blue" },
  email: { label: "Email", icon: Mail, accent: "indigo" },
  whatsapp: { label: "WhatsApp", icon: Send, accent: "teal" },
  meeting: { label: "Meeting", icon: Calendar, accent: "violet" },
  visit: { label: "Site visit", icon: MapPin, accent: "orange" },
  note: { label: "Note", icon: NoteAdd, accent: "amber" },
  comment: { label: "Comment", icon: ChatCircle, accent: "pink" },
  task: { label: "Task", icon: Checklist, accent: "cyan" },
  document: { label: "Document", icon: FileText, accent: "brown" },
  payment: { label: "Payment", icon: Payments, accent: "green" },
  intake: { label: "Enquiry", icon: User, accent: "yellow" },
  stage: { label: "Stage", icon: ArrowRight, accent: "gray" },
  system: { label: "Update", icon: ArrowRight, accent: "gray" },
};

/**
 * Which events are context and which are news.
 *
 * A stage change is worth knowing and worth passing over quickly; a note
 * somebody wrote is the thing you came to read. The quiet ones keep their
 * place in the order but not the reader's attention.
 */
export const QUIET_KINDS: ReadonlySet<EventKind> = new Set([
  "stage",
  "system",
  "document",
  "payment",
]);

/**
 * The activity types the API stores, mapped onto the kinds above.
 *
 * `CrmActivity.type` is the wire format; `EventKind` is what the reader sees.
 * Anything unknown reads as `system`.
 */
export const ACTIVITY_KIND: Record<string, EventKind> = {
  NOTE: "note",
  CALL: "call",
  EMAIL: "email",
  WHATSAPP: "whatsapp",
  MEETING: "meeting",
  STAGE_CHANGE: "stage",
  INTAKE_SUBMISSION: "intake",
  DOCUMENT_CREATED: "document",
  DOCUMENT_SENT: "document",
  DOCUMENT_APPROVED: "document",
  DOCUMENT_DECLINED: "document",
  PAYMENT_RECORDED: "payment",
};

/**
 * The subset of those that mean *a person dealt with another person*.
 *
 * Deliberately narrower than `ACTIVITY_KIND`: a stage move and a raised
 * quotation are things that happened to the record, not contact with anybody,
 * and counting them under "contact so far" would answer "have we spoken to
 * them" with paperwork.
 */
export const CONTACT_ACTIVITY_KIND: Record<string, EventKind> = {
  NOTE: "note",
  CALL: "call",
  EMAIL: "email",
  WHATSAPP: "whatsapp",
  MEETING: "meeting",
};

export function eventKindStyle(kind: EventKind | string | null | undefined): EventKindStyle {
  if (kind && kind in EVENT_KIND) return EVENT_KIND[kind as EventKind];
  return EVENT_KIND.system;
}

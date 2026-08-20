import type { CrmLeadStage } from "@prisma/client";
import type { LeadScore } from "@/lib/crm/lead-scoring";

import type { LeadDocument } from "@/components/crm/documents/document-types";

export type LeadActivity = {
  id: string;
  type: string;
  subject: string;
  body: string | null;
  metadata: unknown;
  occurredAt: string;
  /** Who logged it. The API has always sent this; nothing used to ask. */
  createdBy?: { id: string; name: string | null } | null;
};

export type LeadFollowUp = {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  assignedToId: string;
  completedAt: string | null;
};

export type LeadAppointment = {
  id: string;
  appointmentNo: string;
  title: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  location: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  assignedToId: string;
  outcomeNotes: string | null;
  reportCompletedAt: string | null;
};

export type LeadIntakeSubmission = {
  id: string;
  photoUrls: string[];
  message: string | null;
  selectedServices: string[];
  createdAt: string;
};

export type LeadDetail = {
  id: string;
  leadNo: string;
  /** The administrator's own fields. `CrmLead.customFields` has always been
   *  there; the lead page just never read it. */
  customFields?: Record<string, unknown> | null;
  title: string | null;
  stage: CrmLeadStage;
  probability: number | null;
  estimatedValue: number | null;
  currency: string;
  services: string[];
  source: string | null;
  sourceChannel: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  lostReason: string | null;
  firstContactAt: string | null;
  wonAt: string | null;
  lostAt: string | null;
  /** Out of the working set. Set by archiving, and by conversion. */
  archivedAt: string | null;
  /** When this lead became a deal, and which deal it became. */
  convertedAt: string | null;
  convertedDealId: string | null;
  createdAt: string;
  updatedAt: string;
  clientId: string | null;
  client: { id: string; name: string; addressLine: string | null; city: string | null } | null;
  assignedTo: { id: string; name: string | null } | null;
  documents: LeadDocument[];
  activities: LeadActivity[];
  followUps: LeadFollowUp[];
  appointments: LeadAppointment[];
  intakeSubmissions: LeadIntakeSubmission[];
  scoreBreakdown?: LeadScore;
};

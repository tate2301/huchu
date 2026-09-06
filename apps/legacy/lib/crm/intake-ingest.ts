/**
 * Shared lead-ingestion for public entry points (hosted intake form + webhook).
 * Both create a submission, find-or-create a deduped client, spawn a lead with
 * full UTM capture, log an activity, and notify the assignee (or managers).
 */
import { NotificationType } from "@corelithzw/db";

import { prisma } from "@corelithzw/db/client";
import { reserveIdentifier } from "@/lib/id-generator";
import { findOrCreateClient } from "@/lib/crm/dedupe";
import { normalizeEmail, normalizePhoneE164 } from "@/lib/crm/phone";
import { defaultProbabilityForStage } from "@/lib/crm/pipeline";
import { deriveLeadChannel } from "@/lib/crm/sources";
import { emitCrmNotification, getCrmManagerRecipients } from "@/lib/notifications";

export type IngestLeadInput = {
  companyId: string;
  formId?: string | null;
  apiKeyId?: string | null;
  contactName: string;
  email?: string | null;
  phone?: string | null;
  phoneCountry?: string | null;
  selectedServices?: string[];
  answers?: Record<string, unknown> | null;
  photoUrls?: string[];
  message?: string | null;
  source?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  referrer?: string | null;
  landingPage?: string | null;
  defaultAssigneeId?: string | null;
  /** How the lead physically entered the system. */
  origin: "WEB_FORM" | "WEBHOOK";
  /** Declared channel (webhook payload or API-key default); wins when valid. */
  explicitChannel?: string | null;
};

export async function ingestLead(input: IngestLeadInput): Promise<{ leadId: string; leadNo: string; clientId: string }> {
  const emailNormalized = normalizeEmail(input.email);
  const phoneE164 = normalizePhoneE164(input.phone, input.phoneCountry);

  const outcome = await prisma.$transaction(async (tx) => {
    const client = await findOrCreateClient(tx, {
      companyId: input.companyId,
      name: input.contactName,
      email: input.email,
      phone: input.phone,
      phoneCountry: input.phoneCountry,
      assignedToId: input.defaultAssigneeId,
      source: input.source,
    });

    const leadNo = await reserveIdentifier(tx, {
      companyId: input.companyId,
      entity: "CRM_LEAD",
    });

    const lead = await tx.crmLead.create({
      data: {
        companyId: input.companyId,
        leadNo,
        clientId: client.id,
        contactName: input.contactName,
        contactEmail: input.email ?? undefined,
        contactPhone: input.phone ?? undefined,
        stage: "NEW",
        probability: defaultProbabilityForStage("NEW"),
        services: input.selectedServices ?? [],
        details: input.answers ? (input.answers as object) : undefined,
        source: input.source ?? input.utmSource ?? undefined,
        sourceChannel: deriveLeadChannel({
          explicitChannel: input.explicitChannel,
          utmMedium: input.utmMedium,
          utmSource: input.utmSource,
          source: input.source,
          origin: input.origin,
        }),
        utmSource: input.utmSource ?? undefined,
        utmMedium: input.utmMedium ?? undefined,
        utmCampaign: input.utmCampaign ?? undefined,
        utmTerm: input.utmTerm ?? undefined,
        utmContent: input.utmContent ?? undefined,
        referrer: input.referrer ?? undefined,
        landingPage: input.landingPage ?? undefined,
        assignedToId: input.defaultAssigneeId ?? undefined,
      },
      select: { id: true, leadNo: true },
    });

    const submission = await tx.crmIntakeSubmission.create({
      data: {
        companyId: input.companyId,
        formId: input.formId ?? undefined,
        apiKeyId: input.apiKeyId ?? undefined,
        status: "CONVERTED",
        contactName: input.contactName,
        email: input.email ?? undefined,
        emailNormalized: emailNormalized ?? undefined,
        phone: input.phone ?? undefined,
        phoneE164: phoneE164 ?? undefined,
        selectedServices: input.selectedServices ?? [],
        answers: input.answers ? (input.answers as object) : undefined,
        photoUrls: input.photoUrls ?? [],
        message: input.message ?? undefined,
        source: input.source ?? undefined,
        utmSource: input.utmSource ?? undefined,
        utmMedium: input.utmMedium ?? undefined,
        utmCampaign: input.utmCampaign ?? undefined,
        utmTerm: input.utmTerm ?? undefined,
        utmContent: input.utmContent ?? undefined,
        referrer: input.referrer ?? undefined,
        landingPage: input.landingPage ?? undefined,
        leadId: lead.id,
        clientId: client.id,
      },
      select: { id: true },
    });

    await tx.crmActivity.create({
      data: {
        companyId: input.companyId,
        type: "INTAKE_SUBMISSION",
        leadId: lead.id,
        clientId: client.id,
        subject: input.formId ? "Intake form submitted" : "Lead captured via webhook",
        body: input.message ?? undefined,
        metadata: { submissionId: submission.id, source: input.source, utmCampaign: input.utmCampaign },
      },
    });

    return { leadId: lead.id, leadNo: lead.leadNo, clientId: client.id };
  });

  // Notify the assignee, or all managers when unassigned.
  const recipients = input.defaultAssigneeId
    ? [input.defaultAssigneeId]
    : await getCrmManagerRecipients(input.companyId);
  await emitCrmNotification({
    companyId: input.companyId,
    recipientIds: recipients,
    type: NotificationType.CRM_LEAD_CREATED,
    title: "New lead",
    summary: `${input.contactName} submitted a new enquiry.`,
    leadId: outcome.leadId,
    viewPath: `/crm/leads/${outcome.leadId}`,
  });

  return outcome;
}

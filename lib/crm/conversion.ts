/**
 * Lead conversion.
 *
 * A qualified lead becomes a person, a company and a deal. The lead itself is
 * kept as history and marked converted rather than deleted — it is the record
 * of where the business came from, and source reporting depends on it.
 *
 * The caller decides whether to reuse existing records or create new ones; the
 * conversion screen shows duplicate candidates first so that choice is made
 * with the evidence in view.
 */
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { reserveIdentifier } from "@/lib/id-generator";
import { normalizeEmail, normalizePhoneE164 } from "@/lib/crm/phone";
import { extractDomain } from "@/lib/crm/duplicates";
import { ensureDefaultPipeline, firstOpenStage } from "@/lib/crm/pipelines";

type Tx = Prisma.TransactionClient;

export const convertLeadSchema = z.object({
  /** Reuse this person, or create one from the lead's contact details. */
  personId: z.string().uuid().nullable().optional(),
  personFirstName: z.string().trim().max(120).optional(),
  personLastName: z.string().trim().max(120).optional(),
  /** Reuse this company, or create one. Omit both to leave the deal unattached. */
  clientId: z.string().uuid().nullable().optional(),
  companyName: z.string().trim().max(200).optional(),
  createCompany: z.boolean().optional(),
  dealTitle: z.string().trim().min(1).max(200),
  pipelineId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  value: z.number().finite().nonnegative().nullable().optional(),
  currency: z.string().trim().max(10).optional(),
  expectedCloseDate: z.string().datetime().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  siteId: z.string().uuid().nullable().optional(),
});

export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;

export type ConversionResult = {
  dealId: string;
  dealNo: string;
  personId: string | null;
  clientId: string | null;
  createdPerson: boolean;
  createdCompany: boolean;
};

/** Split a single contact name into first and last, keeping the whole thing if it won't split. */
export function splitName(raw: string | null | undefined): { firstName: string; lastName: string | null } {
  const trimmed = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return { firstName: "Unnamed", lastName: null };
  const parts = trimmed.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

export function buildFullName(firstName: string, lastName?: string | null): string {
  return [firstName.trim(), lastName?.trim()].filter(Boolean).join(" ");
}

/**
 * Convert a lead. Runs entirely inside the caller's transaction so a partial
 * conversion — a person created but no deal — can never be left behind.
 */
export async function convertLead(
  tx: Tx,
  params: {
    companyId: string;
    userId: string;
    leadId: string;
    input: ConvertLeadInput;
  },
): Promise<ConversionResult> {
  const { companyId, userId, leadId, input } = params;

  const lead = await tx.crmLead.findFirst({
    where: { id: leadId, companyId },
    select: {
      id: true,
      leadNo: true,
      title: true,
      clientId: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      estimatedValue: true,
      currency: true,
      services: true,
      source: true,
      sourceChannel: true,
      assignedToId: true,
      convertedAt: true,
      customFields: true,
    },
  });
  if (!lead) throw new Error("Lead not found");
  if (lead.convertedAt) throw new Error("This lead has already been converted");

  // --- Company -------------------------------------------------------------
  let clientId = input.clientId ?? null;
  let createdCompany = false;

  if (!clientId && input.createCompany && input.companyName?.trim()) {
    const clientNo = await reserveIdentifier(tx, { companyId, entity: "CRM_CLIENT" });
    const created = await tx.crmClient.create({
      data: {
        companyId,
        clientNo,
        name: input.companyName.trim(),
        email: lead.contactEmail ?? undefined,
        emailNormalized: normalizeEmail(lead.contactEmail) ?? undefined,
        phone: lead.contactPhone ?? undefined,
        phoneE164: normalizePhoneE164(lead.contactPhone) ?? undefined,
        contactName: lead.contactName ?? undefined,
        assignedToId: input.assignedToId ?? lead.assignedToId ?? undefined,
      },
      select: { id: true },
    });
    clientId = created.id;
    createdCompany = true;
  }
  // Fall back to whatever company the lead was already attached to.
  if (!clientId) clientId = lead.clientId;

  // --- Person --------------------------------------------------------------
  let personId = input.personId ?? null;
  let createdPerson = false;

  if (!personId) {
    const fallback = splitName(lead.contactName);
    const firstName = input.personFirstName?.trim() || fallback.firstName;
    const lastName = input.personLastName?.trim() || fallback.lastName;

    // Only mint a person when there is something to identify them by.
    if (firstName !== "Unnamed" || lead.contactEmail || lead.contactPhone) {
      const personNo = await reserveIdentifier(tx, { companyId, entity: "CRM_PERSON" });
      const created = await tx.crmPerson.create({
        data: {
          companyId,
          personNo,
          firstName,
          lastName: lastName ?? undefined,
          fullName: buildFullName(firstName, lastName),
          email: lead.contactEmail ?? undefined,
          emailNormalized: normalizeEmail(lead.contactEmail) ?? undefined,
          phone: lead.contactPhone ?? undefined,
          phoneE164: normalizePhoneE164(lead.contactPhone) ?? undefined,
          clientId: clientId ?? undefined,
          assignedToId: input.assignedToId ?? lead.assignedToId ?? undefined,
          sourceType: "LEAD_CONVERSION",
          convertedFromLeadId: lead.id,
          createdById: userId,
        },
        select: { id: true },
      });
      personId = created.id;
      createdPerson = true;
    }
  } else if (clientId) {
    // Reusing a person who has no company yet — attach them to this one.
    await tx.crmPerson.updateMany({
      where: { id: personId, companyId, clientId: null },
      data: { clientId },
    });
  }

  // --- Pipeline and stage --------------------------------------------------
  let pipelineId = input.pipelineId ?? null;
  let stageId = input.stageId ?? null;

  if (!pipelineId || !stageId) {
    const pipeline = await ensureDefaultPipeline(tx, companyId);
    pipelineId = pipelineId ?? pipeline.id;
    if (!stageId) {
      const stage = firstOpenStage(pipeline.stages);
      if (!stage) throw new Error("The default pipeline has no open stage to start in");
      stageId = stage.id;
    }
  }

  const stage = await tx.crmPipelineStage.findFirst({
    where: { id: stageId, companyId },
    select: { id: true, pipelineId: true, probability: true },
  });
  if (!stage) throw new Error("Invalid stage");
  if (stage.pipelineId !== pipelineId) throw new Error("That stage belongs to a different pipeline");

  // --- Deal ----------------------------------------------------------------
  const dealNo = await reserveIdentifier(tx, { companyId, entity: "CRM_DEAL" });
  const now = new Date();
  const deal = await tx.crmDeal.create({
    data: {
      companyId,
      dealNo,
      title: input.dealTitle.trim(),
      clientId: clientId ?? undefined,
      primaryContactId: personId ?? undefined,
      siteId: input.siteId ?? undefined,
      pipelineId,
      stageId: stage.id,
      value: input.value ?? lead.estimatedValue ?? undefined,
      currency: input.currency ?? lead.currency,
      probability: stage.probability,
      expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : undefined,
      assignedToId: input.assignedToId ?? lead.assignedToId ?? undefined,
      services: lead.services,
      source: lead.source ?? undefined,
      sourceChannel: lead.sourceChannel,
      // Attribution and any custom values carry across — the deal is the same
      // opportunity, just qualified.
      customFields: (lead.customFields ?? undefined) as Prisma.InputJsonValue | undefined,
      convertedFromLeadId: lead.id,
      stageEnteredAt: now,
      createdById: userId,
    },
    select: { id: true, dealNo: true },
  });

  if (personId) {
    await tx.crmDealContact.create({
      data: { companyId, dealId: deal.id, personId, role: "PRIMARY" },
    });
  }

  // --- Carry the lead's history onto the deal ------------------------------
  // Re-pointing rather than copying keeps one timeline: the calls made before
  // qualification are the same calls, and duplicating them would double-count
  // activity in reporting.
  await tx.crmActivity.updateMany({
    where: { companyId, leadId: lead.id },
    data: { dealId: deal.id, ...(clientId ? { clientId } : {}) },
  });
  await tx.crmFollowUp.updateMany({
    where: { companyId, leadId: lead.id, status: "PENDING" },
    data: { dealId: deal.id },
  });
  await tx.crmAppointment.updateMany({
    where: { companyId, leadId: lead.id },
    data: { dealId: deal.id, ...(input.siteId ? { siteId: input.siteId } : {}) },
  });
  await tx.crmLeadDocument.updateMany({
    where: { companyId, leadId: lead.id },
    data: { dealId: deal.id },
  });

  await tx.crmLead.update({
    where: { id: lead.id },
    data: {
      convertedAt: now,
      convertedById: userId,
      convertedDealId: deal.id,
      convertedPersonId: personId,
      convertedClientId: clientId,
      clientId: clientId ?? undefined,
      stage: "QUALIFIED",
      // Archived in the same breath. Marking a lead converted was never
      // enough on its own: it stayed in the leads list and on the board, so
      // the same opportunity sat in the pipeline twice — once as a lead in
      // Qualified and once as the deal it had just become — and every count
      // that spanned both was wrong. The record is kept, as history always
      // was; it is only out of the working set.
      archivedAt: now,
      archivedById: userId,
    },
  });

  await tx.crmActivity.create({
    data: {
      companyId,
      type: "SYSTEM",
      leadId: lead.id,
      dealId: deal.id,
      clientId: clientId ?? undefined,
      personId: personId ?? undefined,
      subject: `Lead ${lead.leadNo} converted to deal ${deal.dealNo}`,
      metadata: {
        leadId: lead.id,
        dealId: deal.id,
        personId,
        clientId,
        createdPerson,
        createdCompany,
      },
      createdById: userId,
      occurredAt: now,
    },
  });

  return {
    dealId: deal.id,
    dealNo: deal.dealNo,
    personId,
    clientId,
    createdPerson,
    createdCompany,
  };
}

/** Keep websiteDomain in step with website — duplicate detection reads it. */
export function withWebsiteDomain<T extends { website?: string | null }>(input: T) {
  return { ...input, websiteDomain: extractDomain(input.website) };
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canEditRecord } from "@corelithzw/module-crm/permissions";
import { normalizeEmail, normalizePhoneE164 } from "@corelithzw/module-crm/phone";
import { buildFullName } from "@corelithzw/module-crm/conversion";
import {
  buildCustomFieldValues,
  mergeCustomFields,
  type FieldDefinition,
} from "@corelithzw/module-records/custom-fields";
import { recordFieldChanges } from "@corelithzw/module-crm/history";
import { recordMarkFields } from "@corelithzw/module-crm/record-mark";
import { isCompanyUser } from "../../_helpers";
import { recordFieldChanges as recordFieldDiff } from "@corelithzw/module-crm/field-history";

const updatePersonSchema = z.object({
  ...recordMarkFields,
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().max(120).nullable().optional(),
  jobTitle: z.string().trim().max(120).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  additionalEmails: z.array(z.string().trim().email().max(200)).max(10).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  additionalPhones: z.array(z.string().trim().max(40)).max(10).optional(),
  contactType: z
    .enum([
      "CUSTOMER",
      "DECISION_MAKER",
      "SITE_CONTACT",
      "FINANCE_CONTACT",
      "SUPPLIER_CONTACT",
      "REFERRAL_PARTNER",
      "OTHER",
    ])
    .optional(),
  preferredChannel: z.enum(["PHONE", "EMAIL", "WHATSAPP", "SMS", "IN_PERSON"]).nullable().optional(),
  addressLine: z.string().trim().max(300).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  tags: z.array(z.string().trim().max(60)).max(30).optional(),
  clientId: z.string().uuid().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  clearCustomFields: z.array(z.string().trim().max(60)).max(50).optional(),
  archived: z.boolean().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const person = await prisma.crmPerson.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        client: { select: { id: true, name: true, clientNo: true } },
        assignedTo: { select: { id: true, name: true } },
        companyLinks: {
          include: { client: { select: { id: true, name: true, clientNo: true } } },
        },
        dealContacts: {
          include: {
            deal: {
              select: {
                id: true,
                dealNo: true,
                title: true,
                status: true,
                value: true,
                currency: true,
                stage: { select: { id: true, name: true } },
              },
            },
          },
        },
        activities: {
          orderBy: { occurredAt: "desc" },
          take: 50,
          // The history feed names who did it; without this every
          // entry reads as though it happened by itself.
          include: { createdBy: { select: { id: true, name: true } } },
        },
      },
    });
    if (!person) return errorResponse("Person not found", 404);

    // A merged-away record is not an error — point the caller at the survivor.
    if (person.mergedIntoId) {
      return successResponse({ ...person, redirectTo: person.mergedIntoId });
    }

    return successResponse(person);
  } catch (error) {
    console.error("[API] GET /api/v2/crm/people/[id] error:", error);
    return errorResponse("Failed to fetch person");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const existing = await prisma.crmPerson.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        assignedToId: true,
        customFields: true,
        clientId: true,
        jobTitle: true,
        email: true,
        phone: true,
        contactType: true,
        preferredChannel: true,
        city: true,
      },
    });
    if (!existing) return errorResponse("Person not found", 404);
    if (!await canEditRecord(session, existing.assignedToId)) {
      return errorResponse("You can only edit people assigned to you", 403);
    }

    const data = updatePersonSchema.parse(await request.json());

    if (data.clientId) {
      const client = await prisma.crmClient.findFirst({
        where: { id: data.clientId, companyId },
        select: { id: true },
      });
      if (!client) return errorResponse("Invalid company", 400);
    }
    if (!(await isCompanyUser(companyId, data.assignedToId))) {
      return errorResponse("Invalid assignee", 400);
    }

    let customFields: ReturnType<typeof mergeCustomFields> | undefined;
    if (data.customFields || data.clearCustomFields) {
      const definitions = (await prisma.crmFieldDefinition.findMany({
        where: { companyId, entity: "PERSON", archivedAt: null },
        orderBy: { position: "asc" },
      })) as unknown as FieldDefinition[];
      const { values, errors } = buildCustomFieldValues(definitions, data.customFields, {
        partial: true,
      });
      if (errors.length > 0) return errorResponse("Validation failed", 400, errors);
      customFields = mergeCustomFields(existing.customFields, values, data.clearCustomFields ?? []);
    }

    // fullName is denormalised for search and ordering, so it has to be
    // recomputed whenever either half of the name moves.
    const firstName = data.firstName ?? existing.firstName;
    const lastName = data.lastName !== undefined ? data.lastName : existing.lastName;
    const nameChanged = data.firstName !== undefined || data.lastName !== undefined;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.crmPerson.update({
        where: { id },
        data: {
          emoji: data.emoji,
          accent: data.accent,
          avatarUrl: data.avatarUrl,
          firstName: data.firstName,
          lastName: data.lastName,
          ...(nameChanged ? { fullName: buildFullName(firstName, lastName) } : {}),
          jobTitle: data.jobTitle,
          email: data.email,
          ...(data.email !== undefined ? { emailNormalized: normalizeEmail(data.email) } : {}),
          additionalEmails: data.additionalEmails,
          phone: data.phone,
          ...(data.phone !== undefined ? { phoneE164: normalizePhoneE164(data.phone) } : {}),
          additionalPhones: data.additionalPhones,
          contactType: data.contactType,
          preferredChannel: data.preferredChannel,
          addressLine: data.addressLine,
          city: data.city,
          country: data.country,
          notes: data.notes,
          tags: data.tags,
          clientId: data.clientId,
          assignedToId: data.assignedToId,
          ...(customFields !== undefined ? { customFields } : {}),
          ...(data.archived !== undefined
            ? { archivedAt: data.archived ? new Date() : null }
            : {}),
        },
        include: {
          client: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
        },
      });

      // One row per field that actually moved, written with the change it
      // describes. Before, this ran ahead of the update and outside any
      // transaction, so an update that failed still left history behind
      // saying it had happened.
      await recordFieldDiff(tx, {
        companyId,
        entity: "PERSON",
        recordId: id,
        changedById: session.user.id,
        before: existing as Record<string, unknown>,
        update: data as Record<string, unknown>,
      });

      return row;
    });

    await recordFieldChanges(prisma, {
      companyId,
      userId: session.user.id,
      entity: "PERSON",
      recordId: id,
      before: existing,
      after: updated,
      fields: ["firstName", "lastName", "jobTitle", "email", "phone", "contactType", "clientId", "assignedToId"],
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/people/[id] error:", error);
    return errorResponse("Failed to update person");
  }
}

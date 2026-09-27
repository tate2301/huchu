import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { registerGet } from "@/lib/crm/registers/server/route";
import { peopleRegister } from "@/lib/crm/registers/server/people";
import { reserveIdentifier } from "@/lib/id-generator";
import { normalizeEmail, normalizePhoneE164 } from "@/lib/crm/phone";
import { buildFullName } from "@/lib/crm/conversion";
import { findPersonDuplicates } from "@/lib/crm/duplicates";
import { buildCustomFieldValues, type FieldDefinition } from "@/lib/crm/custom-fields";
import { recordMarkFields } from "@/lib/crm/record-mark";
import { isCompanyUser } from "../_helpers";

const createPersonSchema = z.object({
  ...recordMarkFields,
  firstName: z.string().trim().min(1).max(120),
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
  /** Create even though duplicates were flagged. */
  force: z.boolean().optional(),
});

/** The list: see `registerGet` — the page's own query string, paged. */
export async function GET(request: NextRequest) {
  return registerGet(request, peopleRegister);
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const data = createPersonSchema.parse(await request.json());

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

    const fullName = buildFullName(data.firstName, data.lastName);

    // Duplicates warn rather than block: two people really can share a name.
    // The caller confirms with `force` once it has seen the candidates.
    if (!data.force) {
      const duplicates = await findPersonDuplicates(prisma, {
        companyId,
        fullName,
        email: data.email,
        phone: data.phone,
        clientId: data.clientId,
      });
      if (duplicates.length > 0) {
        return NextResponse.json(
          {
            error: "Possible duplicate",
            code: "DUPLICATE_CANDIDATES",
            duplicates,
          },
          { status: 409 },
        );
      }
    }

    const definitions = (await prisma.crmFieldDefinition.findMany({
      where: { companyId, entity: "PERSON", archivedAt: null },
      orderBy: { position: "asc" },
    })) as unknown as FieldDefinition[];
    const { values, errors } = buildCustomFieldValues(definitions, data.customFields);
    if (errors.length > 0) return errorResponse("Validation failed", 400, errors);

    const personNo = await reserveIdentifier(prisma, { companyId, entity: "CRM_PERSON" });
    const person = await prisma.crmPerson.create({
      data: {
        companyId,
        personNo,
        firstName: data.firstName,
        lastName: data.lastName ?? undefined,
        fullName,
        jobTitle: data.jobTitle ?? undefined,
        email: data.email ?? undefined,
        emailNormalized: normalizeEmail(data.email) ?? undefined,
        additionalEmails: data.additionalEmails ?? [],
        phone: data.phone ?? undefined,
        phoneE164: normalizePhoneE164(data.phone) ?? undefined,
        additionalPhones: data.additionalPhones ?? [],
        contactType: data.contactType ?? "CUSTOMER",
        preferredChannel: data.preferredChannel ?? undefined,
        addressLine: data.addressLine ?? undefined,
        city: data.city ?? undefined,
        country: data.country ?? undefined,
        notes: data.notes ?? undefined,
        tags: data.tags ?? [],
        clientId: data.clientId ?? undefined,
        assignedToId: data.assignedToId ?? undefined,
        emoji: data.emoji,
        accent: data.accent,
        avatarUrl: data.avatarUrl,
        customFields: values,
        createdById: session.user.id,
      },
      include: {
        client: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });

    return successResponse(person, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/people error:", error);
    return errorResponse("Failed to create person");
  }
}

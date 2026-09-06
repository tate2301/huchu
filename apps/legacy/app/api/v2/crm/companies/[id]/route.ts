import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canEditRecord } from "@corelithzw/module-crm/permissions";
import { normalizeEmail, normalizePhoneE164 } from "@corelithzw/module-crm/phone";
import { extractDomain } from "@corelithzw/module-crm/duplicates";
import {
  buildCustomFieldValues,
  mergeCustomFields,
  type FieldDefinition,
} from "@corelithzw/module-records/custom-fields";
import { recordFieldChanges } from "@corelithzw/module-crm/history";
import { recordMarkFields } from "@corelithzw/module-crm/record-mark";
import { isCompanyUser } from "../../_helpers";
import { recordFieldChanges as recordFieldDiff } from "@corelithzw/module-crm/field-history";

const updateCompanySchema = z.object({
  ...recordMarkFields,
  name: z.string().trim().min(1).max(200).optional(),
  tradingName: z.string().trim().max(200).nullable().optional(),
  companyType: z.enum(["CUSTOMER", "PROSPECT", "SUPPLIER", "PARTNER", "OTHER"]).optional(),
  registrationNumber: z.string().trim().max(80).nullable().optional(),
  taxNumber: z.string().trim().max(80).nullable().optional(),
  website: z.string().trim().max(300).nullable().optional(),
  industry: z.string().trim().max(120).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  contactName: z.string().trim().max(200).nullable().optional(),
  addressLine: z.string().trim().max(300).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
  billingAddress: z.string().trim().max(500).nullable().optional(),
  accountStatus: z.enum(["ACTIVE", "ON_HOLD", "INACTIVE", "BLACKLISTED"]).optional(),
  parentClientId: z.string().uuid().nullable().optional(),
  parentRelation: z.enum(["HEAD_OFFICE", "BRANCH", "SUBSIDIARY", "DEPARTMENT"]).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  tags: z.array(z.string().trim().max(60)).max(30).optional(),
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

    const company = await prisma.crmClient.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        assignedTo: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true, clientNo: true } },
        children: { select: { id: true, name: true, parentRelation: true } },
        people: {
          take: 50,
          select: { id: true, fullName: true, jobTitle: true, email: true, phone: true },
        },
        deals: {
          take: 50,
          include: { stage: { select: { id: true, name: true, status: true } } },
        },
        sites: { take: 50 },
        activities: {
          orderBy: { occurredAt: "desc" },
          take: 50,
          // The history feed names who did it; without this every
          // entry reads as though it happened by itself.
          include: { createdBy: { select: { id: true, name: true } } },
        },
      },
    });
    if (!company) return errorResponse("Company not found", 404);

    // A merged-away record is not an error — point the caller at the survivor.
    if (company.mergedIntoId) {
      return successResponse({ ...company, redirectTo: company.mergedIntoId });
    }

    return successResponse(company);
  } catch (error) {
    console.error("[API] GET /api/v2/crm/companies/[id] error:", error);
    return errorResponse("Failed to fetch company");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const existing = await prisma.crmClient.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        name: true,
        companyType: true,
        accountStatus: true,
        registrationNumber: true,
        taxNumber: true,
        website: true,
        industry: true,
        parentClientId: true,
        assignedToId: true,
        city: true,
        // The rest of what field history tracks. A field the select leaves out
        // reads as null, so every edit to it looked like a value appearing
        // from nowhere.
        tradingName: true,
        email: true,
        phone: true,
        country: true,
        customFields: true,
      },
    });
    if (!existing) return errorResponse("Company not found", 404);
    if (!await canEditRecord(session, existing.assignedToId)) {
      return errorResponse("You can only edit companies assigned to you", 403);
    }

    const data = updateCompanySchema.parse(await request.json());

    if (data.parentClientId) {
      if (data.parentClientId === id) {
        return errorResponse("A company can't be its own parent", 400);
      }
      const parent = await prisma.crmClient.findFirst({
        where: { id: data.parentClientId, companyId },
        select: { id: true },
      });
      if (!parent) return errorResponse("Invalid parent company", 400);
    }
    if (!(await isCompanyUser(companyId, data.assignedToId))) {
      return errorResponse("Invalid assignee", 400);
    }

    let customFields: ReturnType<typeof mergeCustomFields> | undefined;
    if (data.customFields || data.clearCustomFields) {
      const definitions = (await prisma.crmFieldDefinition.findMany({
        where: { companyId, entity: "COMPANY", archivedAt: null },
        orderBy: { position: "asc" },
      })) as unknown as FieldDefinition[];
      const { values, errors } = buildCustomFieldValues(definitions, data.customFields, {
        partial: true,
      });
      if (errors.length > 0) return errorResponse("Validation failed", 400, errors);
      customFields = mergeCustomFields(existing.customFields, values, data.clearCustomFields ?? []);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.crmClient.update({
        where: { id },
        data: {
          emoji: data.emoji,
          accent: data.accent,
          avatarUrl: data.avatarUrl,
          name: data.name,
          tradingName: data.tradingName,
          companyType: data.companyType,
          registrationNumber: data.registrationNumber,
          taxNumber: data.taxNumber,
          website: data.website,
          // websiteDomain is derived, so it has to follow every website edit.
          ...(data.website !== undefined ? { websiteDomain: extractDomain(data.website) } : {}),
          industry: data.industry,
          email: data.email,
          ...(data.email !== undefined ? { emailNormalized: normalizeEmail(data.email) } : {}),
          phone: data.phone,
          ...(data.phone !== undefined ? { phoneE164: normalizePhoneE164(data.phone) } : {}),
          contactName: data.contactName,
          addressLine: data.addressLine,
          city: data.city,
          country: data.country,
          billingAddress: data.billingAddress,
          accountStatus: data.accountStatus,
          parentClientId: data.parentClientId,
          parentRelation: data.parentRelation,
          notes: data.notes,
          tags: data.tags,
          assignedToId: data.assignedToId,
          ...(customFields !== undefined ? { customFields } : {}),
          ...(data.archived !== undefined
            ? { archivedAt: data.archived ? new Date() : null }
            : {}),
        },
        include: {
          assignedTo: { select: { id: true, name: true } },
          parent: { select: { id: true, name: true } },
        },
      });

      // One row per field that actually moved, written with the change it
      // describes. Outside the transaction, an update that failed still left
      // history behind saying it had happened.
      await recordFieldDiff(tx, {
        companyId,
        entity: "CLIENT",
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
      entity: "COMPANY",
      recordId: id,
      before: existing,
      after: updated,
      fields: [
        "name",
        "companyType",
        "accountStatus",
        "registrationNumber",
        "taxNumber",
        "website",
        "industry",
        "parentClientId",
        "assignedToId",
        "city",
      ],
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/companies/[id] error:", error);
    return errorResponse("Failed to update company");
  }
}

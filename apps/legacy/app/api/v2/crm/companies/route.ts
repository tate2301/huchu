import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { reserveIdentifier } from "@corelithzw/platform/id-generator";
import { normalizeEmail, normalizePhoneE164 } from "@/lib/crm/phone";
import { extractDomain, findCompanyDuplicates } from "@/lib/crm/duplicates";
import { listIdFilter, listRecordIds } from "@/lib/crm/lists";
import { buildCustomFieldValues, type FieldDefinition } from "@/lib/crm/custom-fields";
import { recordMarkFields } from "@/lib/crm/record-mark";
import {
  boolParam,
  buildCompanyWhere,
  buildRecordOrderBy,
  companyFiltersSchema,
  customFieldParams,
  listParam,
  recordSortSchema,
} from "@/lib/crm/records";
import { isCompanyUser } from "../_helpers";

const createCompanySchema = z.object({
  ...recordMarkFields,
  name: z.string().trim().min(1).max(200),
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
  force: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const parsed = companyFiltersSchema.safeParse({
      q: searchParams.get("q") || undefined,
      listId: searchParams.get("listId") || undefined,
      companyTypes: listParam(searchParams, "companyTypes"),
      accountStatuses: listParam(searchParams, "accountStatuses"),
      assignedToIds: listParam(searchParams, "assignedToIds"),
      tags: listParam(searchParams, "tags"),
      parentClientId: searchParams.get("parentClientId") || undefined,
      mineOnly: boolParam(searchParams, "mineOnly"),
      unassigned: boolParam(searchParams, "unassigned"),
      includeArchived: boolParam(searchParams, "includeArchived"),
      customFields: customFieldParams(searchParams),
    });
    const filters = parsed.success ? parsed.data : {};

    const baseWhere = buildCompanyWhere(session.user.companyId, filters, session.user.id);
    // A filter on an empty list must return nothing — ignoring it would show
    // the whole table, which reads as though the filter had failed.
    const listIds = filters.listId
      ? await listRecordIds(prisma, {
          companyId: session.user.companyId,
          userId: session.user.id,
          listId: filters.listId,
        })
      : null;
    const where = { ...baseWhere, ...(listIdFilter(listIds) ?? {}) };
    const sort = recordSortSchema.safeParse({
      field: searchParams.get("sortField"),
      direction: searchParams.get("sortDir"),
    });

    const [companies, total] = await Promise.all([
      prisma.crmClient.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, name: true } },
          parent: { select: { id: true, name: true } },
          _count: { select: { people: true, deals: true, sites: true } },
        },
        orderBy: buildRecordOrderBy("COMPANY", sort.success ? sort.data : undefined),
        skip,
        take: limit,
      }),
      prisma.crmClient.count({ where }),
    ]);

    return successResponse(paginationResponse(companies, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/v2/crm/companies error:", error);
    return errorResponse("Failed to fetch companies");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const data = createCompanySchema.parse(await request.json());

    if (data.parentClientId) {
      const parent = await prisma.crmClient.findFirst({
        where: { id: data.parentClientId, companyId },
        select: { id: true },
      });
      if (!parent) return errorResponse("Invalid parent company", 400);
    }
    if (!(await isCompanyUser(companyId, data.assignedToId))) {
      return errorResponse("Invalid assignee", 400);
    }

    if (!data.force) {
      const duplicates = await findCompanyDuplicates(prisma, {
        companyId,
        name: data.name,
        registrationNumber: data.registrationNumber,
        taxNumber: data.taxNumber,
        website: data.website,
      });
      if (duplicates.length > 0) {
        return NextResponse.json(
          { error: "Possible duplicate", code: "DUPLICATE_CANDIDATES", duplicates },
          { status: 409 },
        );
      }
    }

    const definitions = (await prisma.crmFieldDefinition.findMany({
      where: { companyId, entity: "COMPANY", archivedAt: null },
      orderBy: { position: "asc" },
    })) as unknown as FieldDefinition[];
    const { values, errors } = buildCustomFieldValues(definitions, data.customFields);
    if (errors.length > 0) return errorResponse("Validation failed", 400, errors);

    const clientNo = await reserveIdentifier(prisma, { companyId, entity: "CRM_CLIENT" });
    const created = await prisma.crmClient.create({
      data: {
        companyId,
        clientNo,
        name: data.name,
        tradingName: data.tradingName ?? undefined,
        companyType: data.companyType ?? "CUSTOMER",
        registrationNumber: data.registrationNumber ?? undefined,
        taxNumber: data.taxNumber ?? undefined,
        website: data.website ?? undefined,
        websiteDomain: extractDomain(data.website) ?? undefined,
        industry: data.industry ?? undefined,
        email: data.email ?? undefined,
        emailNormalized: normalizeEmail(data.email) ?? undefined,
        phone: data.phone ?? undefined,
        phoneE164: normalizePhoneE164(data.phone) ?? undefined,
        contactName: data.contactName ?? undefined,
        addressLine: data.addressLine ?? undefined,
        city: data.city ?? undefined,
        country: data.country ?? undefined,
        billingAddress: data.billingAddress ?? undefined,
        accountStatus: data.accountStatus ?? "ACTIVE",
        parentClientId: data.parentClientId ?? undefined,
        parentRelation: data.parentRelation ?? undefined,
        notes: data.notes ?? undefined,
        tags: data.tags ?? [],
        assignedToId: data.assignedToId ?? undefined,
        emoji: data.emoji,
        accent: data.accent,
        avatarUrl: data.avatarUrl,
        customFields: values,
      },
      include: { assignedTo: { select: { id: true, name: true } } },
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/companies error:", error);
    return errorResponse("Failed to create company");
  }
}

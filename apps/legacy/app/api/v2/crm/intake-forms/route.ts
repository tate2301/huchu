import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import {
  crmIntakeFieldsSchema,
  crmIntakeFormConfigSchema,
  crmIntakeServicesSchema,
} from "@/lib/crm/intake-schema";
import { isCompanyUser, requireCrmCapability } from "../_helpers";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  headline: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  successMessage: z.string().trim().max(500).optional(),
  allowPhotos: z.boolean().optional(),
  maxPhotos: z.number().int().min(0).max(20).optional(),
  defaultAssigneeId: z.string().uuid().nullable().optional(),
  fields: crmIntakeFieldsSchema,
  services: crmIntakeServicesSchema,
});

function generatePublicToken(): string {
  return randomBytes(9).toString("base64url");
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const forms = await prisma.crmIntakeForm.findMany({
      where: { companyId: session.user.companyId },
      orderBy: { createdAt: "desc" },
      include: {
        // A form's list entry is useless without its numbers: a link nobody
        // has filled in and one bringing work in every day look identical
        // otherwise.
        _count: { select: { submissions: true } },
        submissions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    const formIds = forms.map((form) => form.id);
    const converted = formIds.length
      ? await prisma.crmIntakeSubmission.groupBy({
          by: ["formId"],
          where: { companyId: session.user.companyId, formId: { in: formIds }, leadId: { not: null } },
          _count: { _all: true },
        })
      : [];
    const convertedByForm = new Map(converted.map((row) => [row.formId, row._count._all]));

    return successResponse({
      data: forms.map(({ _count, submissions, ...form }) => ({
        ...form,
        submissionCount: _count.submissions,
        convertedCount: convertedByForm.get(form.id) ?? 0,
        lastSubmissionAt: submissions[0]?.createdAt ?? null,
      })),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/intake-forms error:", error);
    return errorResponse("Failed to fetch intake forms");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!await requireCrmCapability(session, "settings.manage")) return errorResponse("Manager access required", 403);

    const data = createSchema.parse(await request.json());
    // Cross-field rules (duplicate field keys / service ids).
    crmIntakeFormConfigSchema.parse({ fields: data.fields, services: data.services });
    if (!(await isCompanyUser(session.user.companyId, data.defaultAssigneeId))) {
      return errorResponse("Invalid default assignee", 400);
    }
    const form = await prisma.crmIntakeForm.create({
      data: {
        companyId: session.user.companyId,
        name: data.name,
        publicToken: generatePublicToken(),
        headline: data.headline ?? undefined,
        description: data.description ?? undefined,
        successMessage: data.successMessage ?? undefined,
        allowPhotos: data.allowPhotos ?? true,
        maxPhotos: data.maxPhotos ?? 5,
        defaultAssigneeId: data.defaultAssigneeId ?? undefined,
        fields: data.fields,
        services: data.services,
        createdById: session.user.id,
      },
    });
    return successResponse(form, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/intake-forms error:", error);
    return errorResponse("Failed to create intake form");
  }
}

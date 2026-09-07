import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@corelithzw/db";
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
import { normalizeEmail, normalizePhoneE164 } from "../../../../phone";
import { isCompanyUser } from "../_helpers";

const createClientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  phoneCountry: z.string().trim().max(8).nullable().optional(),
  addressLine: z.string().trim().max(300).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(20).optional(),
  assignedToId: z.string().uuid().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("q")?.trim();
    const { page, limit, skip } = getPaginationParams(request);

    const where: Prisma.CrmClientWhereInput = {
      companyId: session.user.companyId,
      archivedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
              { clientNo: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [clients, total] = await Promise.all([
      prisma.crmClient.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
      prisma.crmClient.count({ where }),
    ]);

    return successResponse(paginationResponse(clients, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/v2/crm/clients error:", error);
    return errorResponse("Failed to fetch clients");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const data = createClientSchema.parse(body);
    if (!(await isCompanyUser(session.user.companyId, data.assignedToId))) {
      return errorResponse("Invalid assignee", 400);
    }

    const clientNo = await reserveIdentifier(prisma, {
      companyId: session.user.companyId,
      entity: "CRM_CLIENT",
    });

    const client = await prisma.crmClient.create({
      data: {
        companyId: session.user.companyId,
        clientNo,
        name: data.name,
        contactName: data.contactName ?? undefined,
        email: data.email ?? undefined,
        emailNormalized: normalizeEmail(data.email) ?? undefined,
        phone: data.phone ?? undefined,
        phoneE164: normalizePhoneE164(data.phone, data.phoneCountry) ?? undefined,
        addressLine: data.addressLine ?? undefined,
        city: data.city ?? undefined,
        country: data.country ?? undefined,
        notes: data.notes ?? undefined,
        tags: data.tags ?? [],
        assignedToId: data.assignedToId ?? undefined,
      },
    });

    return successResponse(client, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/clients error:", error);
    return errorResponse("Failed to create client");
  }
}

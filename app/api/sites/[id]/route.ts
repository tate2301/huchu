import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, hasRole, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const updateSiteSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    code: z.string().trim().min(1).max(20).optional(),
    location: z.string().trim().max(200).nullable().optional(),
    measurementUnit: z.enum(["tonnes", "trips", "wheelbarrows"]).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No fields provided" });

const siteSelect = {
  id: true,
  name: true,
  code: true,
  location: true,
  measurementUnit: true,
  isActive: true,
  companyId: true,
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const site = await prisma.site.findUnique({
      where: { id },
      select: siteSelect,
    });

    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse("Site not found", 404);
    }

    return successResponse(site);
  } catch (error) {
    console.error("[API] GET /api/sites/[id] error:", error);
    return errorResponse("Failed to fetch site");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) {
      return errorResponse("Insufficient permissions to update sites", 403);
    }

    const { id } = await params;
    const body = await request.json();
    const validated = updateSiteSchema.parse(body);

    const existing = await prisma.site.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Site not found", 404);
    }

    const code = validated.code?.trim().toUpperCase();
    if (code) {
      const duplicate = await prisma.site.findFirst({
        where: {
          companyId: session.user.companyId,
          code,
          id: { not: id },
        },
        select: { id: true },
      });
      if (duplicate) {
        return errorResponse("Site code already exists", 409);
      }
    }

    const updated = await prisma.site.update({
      where: { id },
      data: {
        name: validated.name?.trim(),
        code,
        location:
          validated.location === undefined
            ? undefined
            : validated.location === null
              ? null
              : validated.location.trim() || null,
        measurementUnit: validated.measurementUnit,
        isActive: validated.isActive,
      },
      select: siteSelect,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/sites/[id] error:", error);
    return errorResponse("Failed to update site");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) {
      return errorResponse("Insufficient permissions to archive sites", 403);
    }

    const { id } = await params;

    const existing = await prisma.site.findUnique({
      where: { id },
      select: { companyId: true, isActive: true },
    });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Site not found", 404);
    }

    if (!existing.isActive) {
      return successResponse({ success: true, archived: true });
    }

    await prisma.site.update({
      where: { id },
      data: { isActive: false },
    });

    return successResponse({ success: true, archived: true });
  } catch (error) {
    console.error("[API] DELETE /api/sites/[id] error:", error);
    return errorResponse("Failed to archive site");
  }
}

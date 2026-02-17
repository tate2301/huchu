import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  BRANDING_FONT_OPTIONS,
  getBrandingFeatureKeys,
  getEffectiveBrandingForCompany,
  normalizeHexColor,
} from "@/lib/platform/branding";
import { hasFeature } from "@/lib/platform/features";

const FONT_KEY_VALUES = BRANDING_FONT_OPTIONS.map((option) => option.key);

const updateBrandingSchema = z
  .object({
    displayName: z.string().trim().max(80).nullable().optional(),
    primaryColor: z.string().trim().nullable().optional(),
    secondaryColor: z.string().trim().nullable().optional(),
    accentColor: z.string().trim().nullable().optional(),
    fontFamilyKey: z.enum(FONT_KEY_VALUES as [string, ...string[]]).nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, { message: "No fields provided" });

function ensureSuperAdmin(sessionRole: string) {
  return sessionRole === "SUPERADMIN";
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!ensureSuperAdmin(session.user.role)) {
      return errorResponse("Only SUPERADMIN can access branding settings", 403);
    }

    const featureKeys = getBrandingFeatureKeys();
    const manageEnabled = await hasFeature(session.user.companyId, featureKeys.manage);
    if (!manageEnabled) {
      return errorResponse("Branding add-on is not enabled for this company", 403);
    }

    const [company, branding, effective] = await Promise.all([
      prisma.company.findUnique({
        where: { id: session.user.companyId },
        select: { id: true, name: true, slug: true },
      }),
      prisma.companyBranding.findUnique({
        where: { companyId: session.user.companyId },
        select: {
          displayName: true,
          primaryColor: true,
          secondaryColor: true,
          accentColor: true,
          fontFamilyKey: true,
          updatedAt: true,
        },
      }),
      getEffectiveBrandingForCompany(session.user.companyId),
    ]);

    if (!company) {
      return errorResponse("Company not found", 404);
    }

    const domains = await prisma.companyDomain.findMany({
      where: {
        companyId: session.user.companyId,
        status: { in: ["ACTIVE", "VERIFIED", "PENDING_VERIFICATION", "FAILED", "DISABLED"] },
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        hostname: true,
        status: true,
        verificationType: true,
        verificationHost: true,
        verificationValue: true,
        lastCheckedAt: true,
        verifiedAt: true,
        activatedAt: true,
      },
    });
    const statusRank: Record<string, number> = {
      ACTIVE: 0,
      VERIFIED: 1,
      PENDING_VERIFICATION: 2,
      FAILED: 3,
      DISABLED: 4,
    };
    const domain =
      domains
        .slice()
        .sort((a, b) => (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99))[0] ??
      null;

    return successResponse({
      company,
      branding: branding ?? null,
      effective,
      domain,
      fontOptions: BRANDING_FONT_OPTIONS,
    });
  } catch (error) {
    console.error("[API] GET /api/settings/branding error:", error);
    return errorResponse("Failed to fetch branding settings");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!ensureSuperAdmin(session.user.role)) {
      return errorResponse("Only SUPERADMIN can update branding settings", 403);
    }

    const featureKeys = getBrandingFeatureKeys();
    const manageEnabled = await hasFeature(session.user.companyId, featureKeys.manage);
    if (!manageEnabled) {
      return errorResponse("Branding add-on is not enabled for this company", 403);
    }

    const body = await request.json();
    const validated = updateBrandingSchema.parse(body);

    const primaryColor =
      validated.primaryColor === undefined
        ? undefined
        : validated.primaryColor === null
          ? null
          : normalizeHexColor(validated.primaryColor);
    const secondaryColor =
      validated.secondaryColor === undefined
        ? undefined
        : validated.secondaryColor === null
          ? null
          : normalizeHexColor(validated.secondaryColor);
    const accentColor =
      validated.accentColor === undefined
        ? undefined
        : validated.accentColor === null
          ? null
          : normalizeHexColor(validated.accentColor);

    if (validated.primaryColor !== undefined && validated.primaryColor !== null && !primaryColor) {
      return errorResponse("Invalid primary color. Expected #RRGGBB.", 400);
    }
    if (validated.secondaryColor !== undefined && validated.secondaryColor !== null && !secondaryColor) {
      return errorResponse("Invalid secondary color. Expected #RRGGBB.", 400);
    }
    if (validated.accentColor !== undefined && validated.accentColor !== null && !accentColor) {
      return errorResponse("Invalid accent color. Expected #RRGGBB.", 400);
    }

    await prisma.companyBranding.upsert({
      where: { companyId: session.user.companyId },
      update: {
        ...(validated.displayName !== undefined ? { displayName: validated.displayName } : {}),
        ...(validated.fontFamilyKey !== undefined ? { fontFamilyKey: validated.fontFamilyKey } : {}),
        ...(primaryColor !== undefined ? { primaryColor } : {}),
        ...(secondaryColor !== undefined ? { secondaryColor } : {}),
        ...(accentColor !== undefined ? { accentColor } : {}),
      },
      create: {
        companyId: session.user.companyId,
        displayName: validated.displayName ?? null,
        fontFamilyKey: validated.fontFamilyKey ?? null,
        primaryColor: primaryColor ?? null,
        secondaryColor: secondaryColor ?? null,
        accentColor: accentColor ?? null,
      },
    });

    const effective = await getEffectiveBrandingForCompany(session.user.companyId);
    return successResponse({ effective });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PUT /api/settings/branding error:", error);
    return errorResponse("Failed to update branding settings");
  }
}

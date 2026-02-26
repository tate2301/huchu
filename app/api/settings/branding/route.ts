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
    logoUrl: z.string().trim().max(500).nullable().optional(),
    secondaryLogoUrl: z.string().trim().max(500).nullable().optional(),
    signatureUrl: z.string().trim().max(500).nullable().optional(),
    stampUrl: z.string().trim().max(500).nullable().optional(),
    legalName: z.string().trim().max(150).nullable().optional(),
    tradingName: z.string().trim().max(150).nullable().optional(),
    registrationNumber: z.string().trim().max(100).nullable().optional(),
    vatNumber: z.string().trim().max(100).nullable().optional(),
    taxNumber: z.string().trim().max(100).nullable().optional(),
    email: z.string().trim().max(120).nullable().optional(),
    phone: z.string().trim().max(60).nullable().optional(),
    website: z.string().trim().max(200).nullable().optional(),
    physicalAddress: z.string().trim().max(300).nullable().optional(),
    postalAddress: z.string().trim().max(300).nullable().optional(),
    bankName: z.string().trim().max(150).nullable().optional(),
    bankAccountName: z.string().trim().max(150).nullable().optional(),
    bankAccountNumber: z.string().trim().max(100).nullable().optional(),
    bankSwiftCode: z.string().trim().max(60).nullable().optional(),
    bankIban: z.string().trim().max(60).nullable().optional(),
    defaultFooterText: z.string().trim().max(500).nullable().optional(),
    legalDisclaimer: z.string().trim().max(1000).nullable().optional(),
    paymentTerms: z.string().trim().max(1000).nullable().optional(),
    documentLocale: z.string().trim().max(30).nullable().optional(),
    dateFormat: z.string().trim().max(40).nullable().optional(),
    timeFormat: z.string().trim().max(40).nullable().optional(),
    numberFormat: z.string().trim().max(40).nullable().optional(),
    currencyDisplayMode: z.string().trim().max(40).nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, { message: "No fields provided" });

function ensureBrandingManager(sessionRole: string) {
  return sessionRole === "SUPERADMIN" || sessionRole === "MANAGER";
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!ensureBrandingManager(session.user.role)) {
      return errorResponse("Only SUPERADMIN and MANAGER can access branding settings", 403);
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
          logoUrl: true,
          secondaryLogoUrl: true,
          signatureUrl: true,
          stampUrl: true,
          legalName: true,
          tradingName: true,
          registrationNumber: true,
          vatNumber: true,
          taxNumber: true,
          email: true,
          phone: true,
          website: true,
          physicalAddress: true,
          postalAddress: true,
          bankName: true,
          bankAccountName: true,
          bankAccountNumber: true,
          bankSwiftCode: true,
          bankIban: true,
          defaultFooterText: true,
          legalDisclaimer: true,
          paymentTerms: true,
          documentLocale: true,
          dateFormat: true,
          timeFormat: true,
          numberFormat: true,
          currencyDisplayMode: true,
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

    if (!ensureBrandingManager(session.user.role)) {
      return errorResponse("Only SUPERADMIN and MANAGER can update branding settings", 403);
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
        ...(validated.logoUrl !== undefined ? { logoUrl: validated.logoUrl } : {}),
        ...(validated.secondaryLogoUrl !== undefined ? { secondaryLogoUrl: validated.secondaryLogoUrl } : {}),
        ...(validated.signatureUrl !== undefined ? { signatureUrl: validated.signatureUrl } : {}),
        ...(validated.stampUrl !== undefined ? { stampUrl: validated.stampUrl } : {}),
        ...(validated.legalName !== undefined ? { legalName: validated.legalName } : {}),
        ...(validated.tradingName !== undefined ? { tradingName: validated.tradingName } : {}),
        ...(validated.registrationNumber !== undefined ? { registrationNumber: validated.registrationNumber } : {}),
        ...(validated.vatNumber !== undefined ? { vatNumber: validated.vatNumber } : {}),
        ...(validated.taxNumber !== undefined ? { taxNumber: validated.taxNumber } : {}),
        ...(validated.email !== undefined ? { email: validated.email } : {}),
        ...(validated.phone !== undefined ? { phone: validated.phone } : {}),
        ...(validated.website !== undefined ? { website: validated.website } : {}),
        ...(validated.physicalAddress !== undefined ? { physicalAddress: validated.physicalAddress } : {}),
        ...(validated.postalAddress !== undefined ? { postalAddress: validated.postalAddress } : {}),
        ...(validated.bankName !== undefined ? { bankName: validated.bankName } : {}),
        ...(validated.bankAccountName !== undefined ? { bankAccountName: validated.bankAccountName } : {}),
        ...(validated.bankAccountNumber !== undefined ? { bankAccountNumber: validated.bankAccountNumber } : {}),
        ...(validated.bankSwiftCode !== undefined ? { bankSwiftCode: validated.bankSwiftCode } : {}),
        ...(validated.bankIban !== undefined ? { bankIban: validated.bankIban } : {}),
        ...(validated.defaultFooterText !== undefined ? { defaultFooterText: validated.defaultFooterText } : {}),
        ...(validated.legalDisclaimer !== undefined ? { legalDisclaimer: validated.legalDisclaimer } : {}),
        ...(validated.paymentTerms !== undefined ? { paymentTerms: validated.paymentTerms } : {}),
        ...(validated.documentLocale !== undefined ? { documentLocale: validated.documentLocale } : {}),
        ...(validated.dateFormat !== undefined ? { dateFormat: validated.dateFormat } : {}),
        ...(validated.timeFormat !== undefined ? { timeFormat: validated.timeFormat } : {}),
        ...(validated.numberFormat !== undefined ? { numberFormat: validated.numberFormat } : {}),
        ...(validated.currencyDisplayMode !== undefined ? { currencyDisplayMode: validated.currencyDisplayMode } : {}),
      },
      create: {
        companyId: session.user.companyId,
        displayName: validated.displayName ?? null,
        fontFamilyKey: validated.fontFamilyKey ?? null,
        primaryColor: primaryColor ?? null,
        secondaryColor: secondaryColor ?? null,
        accentColor: accentColor ?? null,
        logoUrl: validated.logoUrl ?? null,
        secondaryLogoUrl: validated.secondaryLogoUrl ?? null,
        signatureUrl: validated.signatureUrl ?? null,
        stampUrl: validated.stampUrl ?? null,
        legalName: validated.legalName ?? null,
        tradingName: validated.tradingName ?? null,
        registrationNumber: validated.registrationNumber ?? null,
        vatNumber: validated.vatNumber ?? null,
        taxNumber: validated.taxNumber ?? null,
        email: validated.email ?? null,
        phone: validated.phone ?? null,
        website: validated.website ?? null,
        physicalAddress: validated.physicalAddress ?? null,
        postalAddress: validated.postalAddress ?? null,
        bankName: validated.bankName ?? null,
        bankAccountName: validated.bankAccountName ?? null,
        bankAccountNumber: validated.bankAccountNumber ?? null,
        bankSwiftCode: validated.bankSwiftCode ?? null,
        bankIban: validated.bankIban ?? null,
        defaultFooterText: validated.defaultFooterText ?? null,
        legalDisclaimer: validated.legalDisclaimer ?? null,
        paymentTerms: validated.paymentTerms ?? null,
        documentLocale: validated.documentLocale ?? null,
        dateFormat: validated.dateFormat ?? null,
        timeFormat: validated.timeFormat ?? null,
        numberFormat: validated.numberFormat ?? null,
        currencyDisplayMode: validated.currencyDisplayMode ?? null,
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

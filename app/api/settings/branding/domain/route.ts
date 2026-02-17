import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  getBrandingFeatureKeys,
  isReservedCustomDomain,
  normalizeHostnameInput,
} from "@/lib/platform/branding";
import { hasFeature } from "@/lib/platform/features";

const domainSchema = z.object({
  hostname: z.string().trim().min(3).max(253),
});

function buildVerificationRecord(hostname: string) {
  const token = randomBytes(20).toString("hex");
  return {
    verificationHost: `_huchu-verify.${hostname}`,
    verificationValue: `huchu-verify=${token}`,
  };
}

function ensureSuperAdmin(role: string) {
  return role === "SUPERADMIN";
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!ensureSuperAdmin(session.user.role)) {
      return errorResponse("Only SUPERADMIN can manage custom domains", 403);
    }

    const featureKeys = getBrandingFeatureKeys();
    const domainEnabled = await hasFeature(session.user.companyId, featureKeys.customDomain);
    if (!domainEnabled) {
      return errorResponse("Custom domain add-on is not enabled for this company", 403);
    }

    const body = await request.json();
    const parsed = domainSchema.parse(body);
    const hostname = normalizeHostnameInput(parsed.hostname);
    if (!hostname) {
      return errorResponse("Invalid domain hostname", 400);
    }
    if (isReservedCustomDomain(hostname)) {
      return errorResponse("This domain is reserved and cannot be used", 400);
    }

    const existingForHost = await prisma.companyDomain.findUnique({
      where: { hostname },
      select: { companyId: true },
    });
    if (existingForHost && existingForHost.companyId !== session.user.companyId) {
      return errorResponse("Domain is already linked to another company", 409);
    }

    const verification = buildVerificationRecord(hostname);
    const now = new Date();
    const domain = await prisma.$transaction(async (tx) => {
      await tx.companyDomain.updateMany({
        where: {
          companyId: session.user.companyId,
          hostname: { not: hostname },
          status: { in: ["ACTIVE", "VERIFIED", "PENDING_VERIFICATION"] },
        },
        data: {
          status: "DISABLED",
          lastCheckedAt: now,
        },
      });

      return tx.companyDomain.upsert({
        where: { hostname },
        update: {
          companyId: session.user.companyId,
          status: "PENDING_VERIFICATION",
          verificationType: "TXT",
          verificationHost: verification.verificationHost,
          verificationValue: verification.verificationValue,
          lastCheckedAt: null,
          verifiedAt: null,
          activatedAt: null,
        },
        create: {
          companyId: session.user.companyId,
          hostname,
          status: "PENDING_VERIFICATION",
          verificationType: "TXT",
          verificationHost: verification.verificationHost,
          verificationValue: verification.verificationValue,
        },
        select: {
          hostname: true,
          status: true,
          verificationType: true,
          verificationHost: true,
          verificationValue: true,
          updatedAt: true,
        },
      });
    });

    return successResponse({
      domain,
      instructions: {
        type: "TXT",
        host: domain.verificationHost,
        value: domain.verificationValue,
        note: "Add this TXT record in your DNS provider, wait for propagation, then click Verify.",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/settings/branding/domain error:", error);
    return errorResponse("Failed to save custom domain");
  }
}

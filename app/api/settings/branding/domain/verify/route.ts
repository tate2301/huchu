import dns from "node:dns/promises";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { getBrandingFeatureKeys, normalizeHostnameInput } from "@/lib/platform/branding";
import { hasFeature } from "@/lib/platform/features";

export const runtime = "nodejs";

const verifySchema = z.object({
  hostname: z.string().trim().min(3).max(253),
});

function ensureSuperAdmin(role: string) {
  return role === "SUPERADMIN";
}

function normalizeTxtRecord(parts: string[]): string {
  return parts.join("").trim().replace(/^"|"$/g, "").toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!ensureSuperAdmin(session.user.role)) {
      return errorResponse("Only SUPERADMIN can verify custom domains", 403);
    }

    const featureKeys = getBrandingFeatureKeys();
    const domainEnabled = await hasFeature(session.user.companyId, featureKeys.customDomain);
    if (!domainEnabled) {
      return errorResponse("Custom domain add-on is not enabled for this company", 403);
    }

    const body = await request.json();
    const parsed = verifySchema.parse(body);
    const hostname = normalizeHostnameInput(parsed.hostname);
    if (!hostname) {
      return errorResponse("Invalid domain hostname", 400);
    }

    const domain = await prisma.companyDomain.findFirst({
      where: { companyId: session.user.companyId, hostname },
      select: {
        id: true,
        hostname: true,
        status: true,
        verificationHost: true,
        verificationValue: true,
      },
    });
    if (!domain) {
      return errorResponse("Domain not found for this company", 404);
    }
    if (domain.status === "DISABLED") {
      return errorResponse("Domain is disabled. Re-submit the domain to verify again.", 400);
    }

    let txtRecords: string[] = [];
    try {
      const records = await dns.resolveTxt(domain.verificationHost);
      txtRecords = records.map((entry) => normalizeTxtRecord(entry));
    } catch {
      txtRecords = [];
    }

    const expected = domain.verificationValue.trim().toLowerCase();
    const verified = txtRecords.some((record) => record === expected);
    const now = new Date();

    if (!verified) {
      const failed = await prisma.companyDomain.update({
        where: { id: domain.id },
        data: {
          status: "FAILED",
          lastCheckedAt: now,
        },
        select: {
          hostname: true,
          status: true,
          verificationHost: true,
          verificationValue: true,
          lastCheckedAt: true,
          verifiedAt: true,
          activatedAt: true,
        },
      });

      return successResponse({
        verified: false,
        domain: failed,
        recordsFound: txtRecords,
        message: "Verification TXT record not found yet.",
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.companyDomain.updateMany({
        where: {
          companyId: session.user.companyId,
          id: { not: domain.id },
          status: { in: ["ACTIVE", "VERIFIED"] },
        },
        data: {
          status: "DISABLED",
          lastCheckedAt: now,
        },
      });

      return tx.companyDomain.update({
        where: { id: domain.id },
        data: {
          status: "ACTIVE",
          verifiedAt: now,
          activatedAt: now,
          lastCheckedAt: now,
        },
        select: {
          hostname: true,
          status: true,
          verificationHost: true,
          verificationValue: true,
          lastCheckedAt: true,
          verifiedAt: true,
          activatedAt: true,
        },
      });
    });

    return successResponse({
      verified: true,
      domain: updated,
      recordsFound: txtRecords,
      message: "Domain verification passed and is now active.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/settings/branding/domain/verify error:", error);
    return errorResponse("Failed to verify custom domain");
  }
}

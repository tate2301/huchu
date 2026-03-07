import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as { companyId?: string; role?: string };

    if (!user.companyId) {
      return NextResponse.json({ error: "Company context not found" }, { status: 400 });
    }

    // Only SUPERADMIN and MANAGER roles should see onboarding
    if (user.role !== "SUPERADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({
        needsOnboarding: false,
        reason: "Role not eligible for onboarding",
      });
    }

    // Check if company is already provisioned
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        id: true,
        isProvisioned: true,
        tenantStatus: true,
        _count: {
          select: {
            sites: true,
            departments: true,
          },
        },
      },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // If company is already provisioned, no onboarding needed
    if (company.isProvisioned) {
      return NextResponse.json({
        needsOnboarding: false,
        reason: "Company already provisioned",
      });
    }

    // Check if at least one site exists
    const hasSites = company._count.sites > 0;

    return NextResponse.json({
      needsOnboarding: !hasSites,
      companyId: company.id,
      sitesCount: company._count.sites,
      departmentsCount: company._count.departments,
      reason: hasSites ? "Company has sites" : "No sites configured",
    });
  } catch (error) {
    console.error("Error checking onboarding status:", error);
    return NextResponse.json(
      { error: "Failed to check onboarding status" },
      { status: 500 }
    );
  }
}

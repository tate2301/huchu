import { NextResponse } from "next/server";
import { getCurrentAuthSession } from "../../../auth-core/session";
import { prisma } from "@corelithzw/db/client";

export async function GET() {
  try {
    const session = await getCurrentAuthSession();

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

    // A site is not a universal concept. It came from the mine — a shaft, a
    // pit, a section — and a payroll bureau, a school and an accounting practice
    // all have none. Requiring one meant `isProvisioned: false` plus no site
    // opened a setup dialog over every screen that could not be dismissed until
    // the wizard was finished, so those tenants were locked out of their own
    // product by a mining concept.
    //
    // `isProvisioned` above is the real signal and it is checked first. This is
    // the fallback for a tenant that predates that flag: they need onboarding
    // only if they have nothing at all, and a site is one of several things that
    // count as something.
    const hasAnySetup =
      company._count.sites > 0 || company._count.departments > 0;

    return NextResponse.json({
      needsOnboarding: !hasAnySetup,
      companyId: company.id,
      sitesCount: company._count.sites,
      departmentsCount: company._count.departments,
      reason: hasAnySetup
        ? "Company has been set up"
        : "Nothing configured yet",
    });
  } catch (error) {
    console.error("Error checking onboarding status:", error);
    return NextResponse.json(
      { error: "Failed to check onboarding status" },
      { status: 500 }
    );
  }
}

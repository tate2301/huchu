import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@corelithzw/db/client";

type SiteData = {
  name: string;
  code: string;
  location?: string;
};

type DepartmentData = {
  name: string;
  code: string;
};

type OnboardingPayload = {
  sites: SiteData[];
  departments: DepartmentData[];
  organizationPrefs?: {
    payrollCycle?: "WEEKLY" | "FORTNIGHTLY" | "MONTHLY";
    cashDisbursementOnly?: boolean;
  };
};

function getWorkspaceOnboardingDefaults(workspaceProfile: string | null | undefined) {
  void workspaceProfile;
  return {
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as { companyId?: string; role?: string };

    if (!user.companyId) {
      return NextResponse.json({ error: "Company context not found" }, { status: 400 });
    }

    // Only SUPERADMIN and MANAGER roles can complete onboarding
    if (user.role !== "SUPERADMIN" && user.role !== "MANAGER") {
      return NextResponse.json(
        { error: "Only superusers and managers can complete onboarding" },
        { status: 403 }
      );
    }

    const body = (await request.json()) as OnboardingPayload;

    // Sites are optional. They came from the mine — a shaft, a pit, a section —
    // and a payroll bureau, a school or an accounting practice has none. The
    // wizard used to refuse to finish without one, so the only way out was to
    // invent a fake site, and the tenant then carried it forever.
    const sites = body.sites ?? [];

    // A half-filled site is still an error: it is a typo, not a choice.
    for (const site of sites) {
      if (!site.name || !site.code) {
        return NextResponse.json(
          { error: "A site needs both a name and a code" },
          { status: 400 }
        );
      }
    }

    // Validate department data if provided
    if (body.departments && body.departments.length > 0) {
      for (const dept of body.departments) {
        if (!dept.name || !dept.code) {
          return NextResponse.json(
            { error: "Department name and code are required" },
            { status: 400 }
          );
        }
      }
    }

    // Check if company is already provisioned
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { isProvisioned: true, workspaceProfile: true },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (company.isProvisioned) {
      return NextResponse.json(
        { error: "Company is already provisioned" },
        { status: 400 }
      );
    }

    const onboardingDefaults = getWorkspaceOnboardingDefaults(company.workspaceProfile);

    // Create sites and departments in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create sites
      const createdSites = await Promise.all(
        sites.map((site) =>
          tx.site.create({
            data: {
              name: site.name,
              code: site.code,
              location: site.location || null,
              companyId: user.companyId!,
              isActive: true,
            },
          })
        )
      );

      // Create departments if provided
      let createdDepartments: Array<{ id: string; name: string; code: string }> = [];
      if (body.departments && body.departments.length > 0) {
        createdDepartments = await Promise.all(
          body.departments.map((dept) => {
            const normalizedCode = dept.code.trim().toUpperCase();

            return tx.department.create({
              data: {
                name: dept.name,
                code: normalizedCode,
                companyId: user.companyId!,
                isActive: true,
              },
            });
          })
        );
      }

      // Mark company as provisioned
      await tx.company.update({
        where: { id: user.companyId! },
        data: {
          isProvisioned: true,
          tenantStatus: "ACTIVE",
          payrollCycle: body.organizationPrefs?.payrollCycle ?? "MONTHLY",
          cashDisbursementOnly:
            body.organizationPrefs?.cashDisbursementOnly ?? true,
        },
      });

      return {
        sites: createdSites,
        departments: createdDepartments,
      };
    });

    return NextResponse.json({
      success: true,
      message: "Onboarding completed successfully",
      data: {
        sitesCreated: result.sites.length,
        departmentsCreated: result.departments.length,
      },
    });
  } catch (error) {
    console.error("Error completing onboarding:", error);

    if (error instanceof Error) {
      // Check for unique constraint violations
      if (error.message.includes("Unique constraint")) {
        return NextResponse.json(
          { error: "A site or department with that code already exists" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to complete onboarding" },
      { status: 500 }
    );
  }
}

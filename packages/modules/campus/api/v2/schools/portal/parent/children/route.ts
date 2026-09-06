import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { resolvePortalGuardian } from "../../../../../../portal-identity";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { searchParams } = new URL(request.url);
    const guardianId = searchParams.get("guardianId");

    const resolution = await resolvePortalGuardian(
      {
        companyId,
        userId: session.user.id,
        role: session.user.role,
        requestedId: guardianId,
      },
      {
        select: {
          id: true,
          guardianNo: true,
          firstName: true,
          lastName: true,
        },
      },
    );
    if (resolution.kind === "forbidden") {
      return errorResponse("Parent portal does not allow overriding self scope", 403);
    }
    const guardian = resolution.subject;
    if (!guardian) {
      return successResponse({
        success: true,
        data: {
          resource: "portal-parent-children",
          companyId,
          guardian: null,
          children: [],
        },
      });
    }

    const links = await prisma.schoolStudentGuardian.findMany({
      where: {
        companyId,
        guardianId: guardian.id,
      },
      include: {
        student: {
          select: {
            id: true,
            studentNo: true,
            firstName: true,
            lastName: true,
            status: true,
            isBoarding: true,
            currentClass: { select: { id: true, code: true, name: true } },
            currentStream: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });

    return successResponse({
      success: true,
      data: {
        resource: "portal-parent-children",
        companyId,
        guardian,
        children: links,
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/portal/parent/children error:", error);
    return errorResponse("Failed to fetch parent-linked children");
  }
}


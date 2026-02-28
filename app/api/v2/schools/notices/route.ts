import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

function parseAudience(type: string) {
  const upper = type.toUpperCase();
  if (upper.includes("PARENT")) return "Parents";
  if (upper.includes("STUDENT")) return "Students";
  if (upper.includes("TEACHER")) return "Teachers";
  return "All School Users";
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const now = new Date();
    const recipients = await prisma.notificationRecipient.findMany({
      where: {
        userId: session.user.id,
        isArchived: false,
        notification: {
          companyId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      },
      include: {
        notification: {
          select: {
            id: true,
            type: true,
            title: true,
            summary: true,
            severity: true,
            createdAt: true,
            expiresAt: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
    });

    const data = recipients.map((row) => ({
      id: row.notification.id,
      type: row.notification.type,
      title: row.notification.title,
      summary: row.notification.summary,
      severity: row.notification.severity,
      createdAt: row.notification.createdAt,
      expiresAt: row.notification.expiresAt,
      isRead: row.isRead,
      target: parseAudience(row.notification.type),
    }));

    return successResponse({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/notices error:", error);
    return errorResponse("Failed to fetch school notices");
  }
}


import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@corelithzw/db/client";
import { buildVisitBrief, isBriefExpired } from "../../../../../visit-brief";

/**
 * A site visit, readable by whoever holds the link.
 *
 * No session: the point is the customer expecting a van and the
 * subcontractor with a ladder, neither of whom has an account.
 *
 * The select is the security boundary. It names exactly the columns the
 * brief needs, so a field added to the appointment later — a margin, an
 * internal note — cannot appear on a public page by default. An expired or
 * unshared visit is a 404 rather than a 403: a link that has been revoked
 * should not confirm that it ever existed.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const visit = await prisma.crmAppointment.findUnique({
      where: { briefToken: token },
      select: {
        appointmentNo: true,
        title: true,
        scheduledStart: true,
        scheduledEnd: true,
        location: true,
        latitude: true,
        longitude: true,
        briefExpiresAt: true,
        status: true,
        checklist: true,
        assignedTo: { select: { name: true } },
        site: { select: { name: true, addressLine: true, city: true } },
        client: { select: { name: true } },
      },
    });

    if (!visit || isBriefExpired(visit.briefExpiresAt)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      data: { ...buildVisitBrief(visit), status: visit.status },
    });
  } catch (error) {
    console.error("[API] GET /api/public/crm/visits/[token] error:", error);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@corelithzw/db/client";
import { buildSignOffJob, signOffSubmissionSchema } from "../../../../../sign-off";

/**
 * The job, for the person paying for it.
 *
 * No session. The `select` is the boundary: it names what the client needs to
 * recognise the work and nothing about what it cost or earned — they are
 * confirming the work happened, not auditing the price.
 */
const JOB_SELECT = {
  workOrderNo: true,
  title: true,
  description: true,
  completedAt: true,
  addressLine: true,
  signOffAt: true,
  signOffName: true,
  client: { select: { name: true } },
  site: { select: { name: true, addressLine: true, city: true } },
  items: { select: { description: true }, orderBy: { position: "asc" } },
} as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const job = await prisma.crmWorkOrder.findUnique({
      where: { signOffToken: token },
      select: JOB_SELECT,
    });
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ data: buildSignOffJob(job) });
  } catch (error) {
    console.error("[API] GET /api/public/crm/sign-off/[token] error:", error);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const existing = await prisma.crmWorkOrder.findUnique({
      where: { signOffToken: token },
      select: { id: true, signOffAt: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Once. Letting a link re-answer would mean whoever holds it can rewrite
    // what the client said.
    if (existing.signOffAt) {
      return NextResponse.json({ error: "This job has already been signed off" }, { status: 409 });
    }

    const body = await request.json().catch(() => null);
    const parsed = signOffSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please give the name of whoever is signing", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const job = await prisma.crmWorkOrder.update({
      where: { id: existing.id },
      data: {
        signOffAt: new Date(),
        signOffName: parsed.data.name,
        signOffRating: parsed.data.rating ?? null,
        signOffNotes: parsed.data.notes ?? null,
        // Somebody confirming the work is done is the most reliable signal
        // the job is finished that this system will ever get.
        status: "COMPLETED",
        completedAt: new Date(),
      },
      select: JOB_SELECT,
    });

    return NextResponse.json({ data: buildSignOffJob(job) });
  } catch (error) {
    console.error("[API] POST /api/public/crm/sign-off/[token] error:", error);
    return NextResponse.json({ error: "Could not record the sign-off" }, { status: 400 });
  }
}

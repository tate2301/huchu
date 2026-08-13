/**
 * The end-of-day report: list what a day has, and close a register's day.
 *
 * S-7.2.
 *
 * ── Who may call it ────────────────────────────────────────────────────────
 *
 * `retail.cash-control`, both halves, and it is the only resource that fits.
 * `lib/retail/permissions.ts` defines it as "cash-up: every cashier's shift, its
 * variance, and signing it off — the back-office half of a shift, not the till's
 * half", and that is precisely this document: a Z-report names every cashier's
 * drawer variance for the day and states the shop's takings.
 *
 * The alternatives are wrong for concrete reasons. `retail.reports` is the trading
 * dashboard, a thing you look at; this is a thing you *sign*. `retail.sell` would
 * put the close in a cashier's hands, and a cashier closing the day they were
 * counted against removes the separation the whole cash-control grant exists for.
 * The prototype agrees, by its own gating: the cashier's "My day" screen ends with
 * "Ask a manager to unlock it" behind a manager PIN before it will open the
 * Z-report at all.
 *
 * So CASHIER cannot reach either handler — deliberately — and SUPERADMIN, MANAGER
 * and SHOP_MANAGER can.
 *
 * ── Two verbs, and they mean different things ──────────────────────────────
 *
 * `GET` is a read of what exists: which registers traded on a date, whether each
 * one is closed, and whether its report has already been taken. It creates
 * nothing, so a manager can open the screen all day.
 *
 * `POST` closes the day. It is not idempotent in the "no effect" sense — it may
 * write a row — but it *is* idempotent in the sense that matters: asking twice
 * returns the same document, and `201` versus `200` says which call wrote it. The
 * rule is enforced by a unique constraint rather than by this handler; see
 * `generateRetailZReportTransaction`.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-utils";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { serializeRetailZReport, tradingDayKey } from "@/lib/retail/z-report";
import { prisma } from "@/lib/prisma";
import { requireRetailSession } from "../_helpers";
import {
  generateRetailZReportTransaction,
  listRetailZReportCandidates,
} from "../_services";

const generateSchema = z.object({
  registerCode: z.string().trim().min(1).max(64),
  /**
   * The trading day. A bare date, never an instant — a day has no time and no
   * zone, and accepting a timestamp here is how a shift opened at 22:00 lands on
   * the wrong report.
   */
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPermission(session, "retail.cash-control", "view");
  if (gate) return gate;

  const { searchParams } = new URL(request.url);
  const businessDate = searchParams.get("businessDate")?.trim() || tradingDayKey(new Date());

  try {
    const [candidates, reports] = await Promise.all([
      listRetailZReportCandidates({ companyId: session.user.companyId, businessDate }),
      // The recent ones, so the screen can offer yesterday's report without the
      // manager having to remember which day they are looking for.
      prisma.retailZReport.findMany({
        where: { companyId: session.user.companyId },
        orderBy: [{ businessDate: "desc" }, { registerCode: "asc" }],
        take: 30,
        select: {
          id: true,
          reportNo: true,
          businessDate: true,
          registerCode: true,
          registerName: true,
          currency: true,
          generatedAt: true,
          generatedByName: true,
          grossTakings: true,
          cashVariance: true,
        },
      }),
    ]);

    return successResponse({
      data: {
        businessDate,
        registers: candidates,
      },
      recent: reports.map((report) => ({
        ...report,
        businessDate: tradingDayKey(report.businessDate),
      })),
    });
  } catch (error) {
    if (error instanceof Error && /YYYY-MM-DD|Not a real date/.test(error.message)) {
      return errorResponse(error.message, 400);
    }
    console.error("[API] GET /api/v2/retail/z-reports error:", error);
    return errorResponse("Failed to load end-of-day reports");
  }
}

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // Closing a register's day is the supervisory act, not the till's. See the
  // header on why this is `retail.cash-control` and not `retail.reports`.
  const gate = requireRetailPermission(session, "retail.cash-control", "create");
  if (gate) return gate;

  try {
    const input = generateSchema.parse(await request.json());
    const { report, created } = await generateRetailZReportTransaction({
      actor: {
        companyId: session.user.companyId,
        userId: session.user.id,
        userRole: session.user.role,
        userName: session.user.name,
        userEmail: session.user.email,
      },
      registerCode: input.registerCode,
      businessDate: input.businessDate,
    });

    return successResponse(
      {
        data: serializeRetailZReport(report, report.site?.name ?? null),
        // False on the second ask. The document is the same either way; this is
        // how the till knows to say "already taken" rather than "done".
        created,
      },
      created ? 201 : 200,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/retail/z-reports error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Failed to take the end-of-day report",
      400,
    );
  }
}

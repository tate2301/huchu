import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createOrRefreshVatReturnDraft, transitionVatReturnStatus } from "@/lib/accounting/vat-return";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, canDo, isSuperuser, tierOf } from "@/lib/books/core";
import { taxSettings } from "@/lib/books/core/tax-settings";
import { vatPeriodFor } from "@/lib/books/core/vat-figures";
import { dayOf } from "@/lib/books/format";
import type { VatCurrencyView, VatTab } from "@/lib/books/vat-labels";
import { readVatPage } from "@/lib/books/vat-return-page";
import { prisma } from "@/lib/prisma";

const TABS: VatTab[] = ["draft", "reviewed", "finalised", "filed"];
const VIEWS: VatCurrencyView[] = ["all", "USD", "ZWG"];

/** Books → Tax → VAT returns: the return for a period, every source, the tie-out. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const params = new URL(request.url).searchParams;
    const actor = await booksActor(sessionResult.session);
    return successResponse(
      await readVatPage(prisma, sessionResult.session.user.companyId, {
        tab: TABS.find((value) => value === params.get("tab")) ?? null,
        id: params.get("return"),
        view: VIEWS.find((value) => value === params.get("view")) ?? "all",
        actor,
      }),
    );
  } catch (error) {
    console.error("[API] GET /api/books/vat error:", error);
    return errorResponse("Could not read the VAT returns");
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh"), id: z.string().uuid().nullish(), period: z.string().regex(/^\d{4}-\d{2}$/).nullish() }),
  z.object({ action: z.literal("review"), id: z.string().uuid() }),
  z.object({ action: z.literal("finalise"), id: z.string().uuid(), notes: z.string().trim().max(2000).nullish() }),
  z.object({ action: z.literal("file"), id: z.string().uuid(), reference: z.string().trim().min(2).max(80) }),
  z.object({ action: z.literal("void"), id: z.string().uuid(), reason: z.string().trim().min(3).max(500) }),
]);

/**
 * The return's moves (books-final §4.16): gather or refresh a draft (owner,
 * manager, accountant); review, by another person where two keep the books;
 * finalise (manager or owner), refused on a difference from 2200 and 2210
 * until it is explained; file with the TaRMS reference; void (owner).
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const actor = await booksActor(session);
    const body = schema.parse(await request.json());

    if (body.action === "refresh") {
      const allowed = canDo(actor, "vat.prepare");
      if (!allowed.allowed) return errorResponse(allowed.reason, 403);
      let start: Date;
      let end: Date;
      if (body.id) {
        const ret = await prisma.vatReturn.findFirst({ where: { id: body.id, companyId }, select: { periodStart: true, periodEnd: true } });
        if (!ret) return errorResponse("That return is not in this workspace", 404);
        start = ret.periodStart;
        end = ret.periodEnd;
      } else {
        const settings = await taxSettings(companyId);
        const on = body.period ? new Date(`${body.period}-01T00:00:00Z`) : new Date(`${dayOf(new Date())}T00:00:00Z`);
        ({ start, end } = vatPeriodFor(on, settings.vat));
      }
      const ret = await createOrRefreshVatReturnDraft({ companyId, periodStart: start, periodEnd: end, preparedById: session.user.id });
      return successResponse({ id: ret.id, status: ret.status });
    }

    const current = await prisma.vatReturn.findFirst({ where: { id: body.id, companyId }, select: { id: true, status: true, preparedById: true, notes: true } });
    if (!current) return errorResponse("That return is not in this workspace", 404);

    if (body.action === "review") {
      const allowed = canDo(actor, "vat.prepare");
      if (!allowed.allowed) return errorResponse(allowed.reason, 403);
      // A second person reviews it, where the workspace has one (§4.16).
      if (current.preparedById === session.user.id) {
        const others = await prisma.user.count({ where: { companyId, id: { not: session.user.id }, role: { in: ["SUPERADMIN", "MANAGER", "FINANCE_OFFICER"] }, isActive: true } });
        if (others > 0) return errorResponse("Another person reviews the return you prepared. Send it to them for review.", 409);
      }
      const ret = await transitionVatReturnStatus({ companyId, vatReturnId: current.id, nextStatus: "REVIEWED", actorId: session.user.id });
      return successResponse({ id: ret.id, status: ret.status });
    }

    if (body.action === "finalise" || body.action === "file") {
      const allowed = canDo(actor, "vat.file");
      if (!allowed.allowed) return errorResponse(allowed.reason, 403);
      const ret =
        body.action === "finalise"
          ? await transitionVatReturnStatus({ companyId, vatReturnId: current.id, nextStatus: "FINALIZED", actorId: session.user.id, notes: body.notes ?? null })
          : await transitionVatReturnStatus({ companyId, vatReturnId: current.id, nextStatus: "FILED", actorId: session.user.id, referenceNumber: body.reference });
      return successResponse({ id: ret.id, status: ret.status });
    }

    // Void: the owner's, for a draft, reviewed or finalised return; its documents unlock.
    if (!(tierOf(actor) === "owner" || isSuperuser(actor))) return errorResponse("Only the owner can void a VAT return.", 403);
    const ret = await transitionVatReturnStatus({ companyId, vatReturnId: current.id, nextStatus: "VOIDED", actorId: session.user.id, notes: [current.notes, `Voided: ${body.reason}`].filter(Boolean).join("\n") });
    return successResponse({ id: ret.id, status: ret.status });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Check the return's details", 400, error.issues);
    if (error instanceof Error && /tie|differs|transition|already|Explain/i.test(error.message)) return errorResponse(error.message, 409);
    console.error("[API] POST /api/books/vat error:", error);
    return errorResponse(error instanceof Error ? error.message : "The return was not changed");
  }
}

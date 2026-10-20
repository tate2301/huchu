import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { yearToDate } from "@/lib/books/core/accountant-export";
import { dayOf } from "@/lib/books/format";
import { prisma } from "@/lib/prisma";

/** Management › Accountant export: the year so far, and the exports downloaded before, with who and when. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { refused } = await guardBooks(sessionResult.session, "view", { area: "ledger" });
    if (refused) return refused;
    const companyId = sessionResult.session.user.companyId;
    const [events, settings, first] = await Promise.all([
      prisma.platformAuditEvent.findMany({ where: { companyId, eventType: "books.accountant-export.downloaded" }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, actor: true, createdAt: true, payloadJson: true } }),
      prisma.accountingSettings.findUnique({ where: { companyId }, select: { fiscalYearStartMonth: true, baseCurrency: true } }),
      prisma.journalEntry.findFirst({ where: { companyId, status: "POSTED" }, orderBy: { entryDate: "asc" }, select: { entryDate: true } }),
    ]);
    const users = new Map((await prisma.user.findMany({ where: { id: { in: events.map((event) => event.actor).filter((id): id is string => Boolean(id)) } }, select: { id: true, name: true, image: true } })).map((user) => [user.id, user]));
    const today = dayOf(new Date());
    return successResponse({
      yearToDate: yearToDate(today, settings?.fiscalYearStartMonth ?? 1),
      booksStart: first ? first.entryDate.toISOString().slice(0, 10) : null,
      baseCurrency: settings?.baseCurrency ?? "USD",
      today,
      history: events.map((event) => {
        const payload = event.payloadJson ? (JSON.parse(event.payloadJson) as { from?: string; to?: string }) : {};
        const user = event.actor ? users.get(event.actor) : undefined;
        return { id: event.id, at: event.createdAt.toISOString(), by: user?.name ?? "Someone", image: user?.image ?? null, from: payload.from ?? null, to: payload.to ?? null };
      }),
    });
  } catch (error) {
    console.error("[API] GET /api/books/accountant-export/history error:", error);
    return errorResponse("Could not read the exports");
  }
}

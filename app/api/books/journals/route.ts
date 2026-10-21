import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, canDo, guardBooks } from "@/lib/books/core";
import { JournalRefused, saveManualJournal } from "@/lib/books/core/manual-journals";
import { journalQuerySchema, journalsCsv, readJournals } from "@/lib/books/journals";
import { prisma } from "@/lib/prisma";

/** Books → Ledger → Journals: the list by state, with the drafts and the ones waiting for a second person. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { refused } = await guardBooks(sessionResult.session, "view", { area: "ledger" });
    if (refused) return refused;
    const params = new URL(request.url).searchParams;
    const query = journalQuerySchema.parse(Object.fromEntries(["tab", "q", "sort", "source", "period", "by", "page"].map((key) => [key, params.get(key) ?? undefined])));
    const companyId = sessionResult.session.user.companyId;
    if (params.get("format") === "csv") {
      return new NextResponse(await journalsCsv(prisma, companyId, query), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="journals.csv"' },
      });
    }
    // What the page offers this person, from the one matrix (books-final §2.2).
    const actor = await booksActor(sessionResult.session);
    const can = {
      create: canDo(actor, "draft.create", { kind: "journal" }).allowed,
      post: canDo(actor, "journal.post", { kind: "journal" }).allowed,
      deleteDraft: canDo(actor, "draft.delete", { kind: "journal" }).allowed,
      reverse: canDo(actor, "void", { kind: "journal" }).allowed,
    };
    return successResponse(await readJournals(prisma, companyId, query, can));
  } catch (error) {
    console.error("[API] GET /api/books/journals error:", error);
    return errorResponse("Could not read the journals");
  }
}

const money = z.number().min(0).max(1_000_000_000);
const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memo: z.string().trim().min(1).max(500),
  currency: z.string().trim().max(3).nullish(),
  post: z.boolean(),
  periodOverrideReason: z.string().max(500).nullish(),
  attachment: z.object({ url: z.string().url(), name: z.string().max(200), contentType: z.string().max(100), size: z.number().int().min(0) }).nullish(),
  lines: z.array(z.object({ accountId: z.string().uuid(), costCenterId: z.string().uuid().nullish(), debit: money, credit: money, memo: z.string().max(500).nullish() })).min(2).max(200),
});

/** New journal: a draft, posted, or sent to a second person when it is over the limit (books-final §4.14). */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "draft.create", { kind: "journal" });
    if (refused) return refused;
    const body = schema.parse(await request.json());
    return successResponse(await saveManualJournal(actor, body), 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Fill in the date, the memo and two lines or more", 400, error.issues);
    if (error instanceof JournalRefused) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/books/journals error:", error);
    return errorResponse("The journal was not saved");
  }
}

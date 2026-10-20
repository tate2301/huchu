import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, deleteDocument, isUndoKind, reviseDocument, undoChoices, UNDO_NOUN, voidDocument } from "@/lib/books/core";
import { refusedResponse } from "@/lib/books/core/refused";
import { REASON_MAX } from "@/lib/books/core/undo-rules";

/**
 * Undo on one posted money document (books-final §4.1, §2.5; P4), whatever
 * module it belongs to: gated on the person's role, not the plan (§1.2).
 *
 * - GET: which of Void, Revise and Delete this person may press, and why not;
 *   who voided it and why; what replaced it.
 * - POST `{ action: "void" | "revise", reason }`.
 * - DELETE `{ reason, confirm }`: a draft goes at once; anything posted is
 *   the owner's, with a reason and its number typed.
 */

type Params = { params: Promise<{ kind: string; id: string }> };

const moveSchema = z.object({ action: z.enum(["void", "revise"]), reason: z.string().max(REASON_MAX) });
const deleteSchema = z.object({ reason: z.string().max(REASON_MAX).optional(), confirm: z.string().max(80).optional() });

async function read(params: Params["params"]) {
  const { kind, id } = await params;
  return isUndoKind(kind) ? { kind, id } : null;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const target = await read(params);
    if (!target) return errorResponse("There is no such kind of document.", 404);
    const choices = await undoChoices(await booksActor(sessionResult.session), target.kind, target.id);
    if (!choices) return errorResponse(`That ${UNDO_NOUN[target.kind].noun} is not here any more.`, 404);
    return successResponse(choices);
  } catch (error) {
    console.error("[API] GET /api/books/core/[kind]/[id] error:", error);
    return errorResponse("Could not read what can be undone");
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const target = await read(params);
    if (!target) return errorResponse("There is no such kind of document.", 404);
    const body = moveSchema.parse(await request.json().catch(() => null));
    const actor = await booksActor(sessionResult.session);
    return successResponse(body.action === "void" ? await voidDocument(actor, target.kind, target.id, { reason: body.reason }) : await reviseDocument(actor, target.kind, target.id, { reason: body.reason }));
  } catch (error) {
    const refusal = refusedResponse(error, "Say why, in a few words");
    if (refusal) return refusal;
    console.error("[API] POST /api/books/core/[kind]/[id] error:", error);
    return errorResponse("Nothing was changed");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const target = await read(params);
    if (!target) return errorResponse("There is no such kind of document.", 404);
    const body = deleteSchema.parse((await request.json().catch(() => ({}))) ?? {});
    const actor = await booksActor(sessionResult.session);
    const choices = await undoChoices(actor, target.kind, target.id);
    if (!choices) return errorResponse(`That ${UNDO_NOUN[target.kind].noun} is not here any more.`, 404);
    // Anything posted goes for good: its number is typed to confirm, as the owner's dialog asks.
    if (choices.delete.permanent && (body.confirm ?? "").trim().toUpperCase() !== choices.label.toUpperCase()) {
      return errorResponse(`Type ${choices.label} to delete it.`, 400);
    }
    return successResponse(await deleteDocument(actor, target.kind, target.id, { reason: body.reason }));
  } catch (error) {
    const refusal = refusedResponse(error);
    if (refusal) return refusal;
    console.error("[API] DELETE /api/books/core/[kind]/[id] error:", error);
    return errorResponse("Nothing was deleted");
  }
}

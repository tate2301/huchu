import type { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-utils";
import type { AuthenticatedSession } from "@/lib/auth-core/types";

import { booksActor, canDo, type BooksAction, type BooksActor, type BooksDoc } from "./can-do";

/**
 * `canDo` at a route's door: the person as Books sees them, and the 403 with
 * the reason in plain words when the matrix (books-final §2.2) says no.
 */
export async function guardBooks(
  session: AuthenticatedSession,
  action: BooksAction,
  doc: BooksDoc = {},
): Promise<{ actor: BooksActor; refused: NextResponse | null }> {
  const actor = await booksActor(session);
  const decision = canDo(actor, action, doc);
  return { actor, refused: decision.allowed ? null : errorResponse(decision.reason, 403) };
}

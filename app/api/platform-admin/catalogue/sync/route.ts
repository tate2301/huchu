import { NextResponse } from "next/server";

import { syncCatalogue, syncWords } from "@/lib/admin/catalogue";
import { getSignedInOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";

/** Catalogue › Sync from code: every feature, bundle and plan in code written to the database. Owners only. */
export async function POST() {
  const operator = await getSignedInOperator();
  if (!operator) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  if (!operatorCan(operator.role, "operator.manage")) return NextResponse.json({ error: "Only an owner can sync the catalogue." }, { status: 403 });
  const outcome = await syncCatalogue(operator);
  return NextResponse.json({ ...outcome, message: syncWords(outcome) });
}

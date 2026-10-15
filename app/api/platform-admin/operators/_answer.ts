import { NextResponse } from "next/server";

import { AdminRefusal } from "@/lib/admin/refusal";
import { getSignedInOperator, OperatorRefusal, type SignedInOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";

/** An owner's request about one operator: a refusal is a 400 with its sentence, for the sheet to show. */
export async function ownerAnswer(work: (owner: SignedInOperator) => Promise<unknown>) {
  const owner = await getSignedInOperator();
  if (!owner) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  if (!operatorCan(owner.role, "operator.manage")) return NextResponse.json({ error: "Only owners keep the portal's operators." }, { status: 403 });
  try {
    return NextResponse.json(await work(owner), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AdminRefusal || error instanceof OperatorRefusal) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

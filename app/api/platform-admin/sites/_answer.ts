import { NextResponse } from "next/server";

import { AdminRefusal } from "@/lib/admin/refusal";
import { SiteFieldRefusal } from "@/lib/admin/sites";
import { getSignedInOperator, OperatorRefusal, type SignedInOperator } from "@/lib/operators/guards";
import { operatorCan, type OperatorAction } from "@/lib/operators/roles";

/**
 * One site's request: the operator, the permission, then `work`. A refusal is
 * a 400 with its sentence, and the field it belongs to when it has one, for
 * the sheet to put it under that field.
 */
export async function siteAnswer(action: OperatorAction, work: (operator: SignedInOperator) => Promise<unknown>) {
  const operator = await getSignedInOperator();
  if (!operator) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  if (!operatorCan(operator.role, action)) return NextResponse.json({ error: "Your role cannot do that." }, { status: 403 });
  try {
    return NextResponse.json(await work(operator), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SiteFieldRefusal) return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
    if (error instanceof AdminRefusal || error instanceof OperatorRefusal) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

import { NextResponse } from "next/server";

import { markActivityFailed } from "@/lib/activity/context";
import { errorResponse } from "@/lib/api-response";
import { FiscalRefused } from "@/lib/retail/fiscal-settings";

/** A Fiscal device action's refusal as HTTP: its status, and its code when it has one (409 `FISCAL_DAY_OPEN`). */
export function fiscalRefusal(error: FiscalRefused) {
  if (!error.code) return errorResponse(error.message, error.status);
  markActivityFailed();
  return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
}

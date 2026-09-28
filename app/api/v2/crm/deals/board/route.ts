import type { NextRequest } from "next/server";

import { dealsRegister } from "@/lib/crm/registers/server/deals";
import { registerBoardGet } from "@/lib/crm/registers/server/route";

/**
 * One pipeline's board — the pipeline filter's, or the default — read with
 * the same query string as the deals list, so the board and the table agree
 * about which deals a filter selects.
 */
export function GET(request: NextRequest) {
  return registerBoardGet(request, dealsRegister);
}

import type { NextRequest } from "next/server";

import { leadsRegister } from "@/lib/crm/registers/server/leads";
import { registerBoardGet } from "@/lib/crm/registers/server/route";

/**
 * The leads board — a column per stage — read with the same query string as
 * the leads list, so the board and the table agree about which leads a filter
 * selects. A stage filter chooses the columns.
 */
export function GET(request: NextRequest) {
  return registerBoardGet(request, leadsRegister);
}

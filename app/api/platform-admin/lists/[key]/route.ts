import { NextResponse, type NextRequest } from "next/server";

import { adminListIds, adminListPage } from "@/lib/admin/lists/engine";
import { getSignedInOperator } from "@/lib/operators/guards";
import { parseListQuery } from "@/lib/reports/list-query";

/**
 * One page of an admin list (`?page=`), or with `idsOnly=1` every matching id
 * for "Select all" — the workspace's `/api/v2/reports/[key]` list mode, for an
 * operator. 401 without a signed-in operator, 403 when the role may not read it.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const operator = await getSignedInOperator();
  if (!operator) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  const { key } = await params;
  const search = request.nextUrl.searchParams;
  const query = parseListQuery(search);
  const answer =
    search.get("idsOnly") === "1"
      ? await adminListIds(operator, key, query, (search.get("pick") ?? "").split(",").filter(Boolean))
      : await adminListPage(operator, key, query);
  if ("error" in answer) return NextResponse.json({ error: answer.error }, { status: answer.status });
  return NextResponse.json(answer, { headers: { "Cache-Control": "no-store" } });
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { AdminRefusal } from "@/lib/admin/refusal";
import { previewRows } from "@/lib/library/preview";
import { OperatorRefusal, requireOperatorFor } from "@/lib/operators/guards";
import { MAX_SOURCES } from "@/lib/reports/custom/source-rows";

const body = z.object({
  workspace: z.string().min(1).max(64),
  keys: z.array(z.string().min(1).max(64)).min(1).max(MAX_SOURCES),
  params: z.record(z.string(), z.string().max(40)).default({}),
});

/**
 * Library › preview: the rows of the sources a library item reads, in the
 * workspace the operator chose, read as its owner reads them. Rows only:
 * the item's SQL runs in the operator's browser after the guard passes it.
 */
export async function POST(request: Request) {
  try {
    const operator = await requireOperatorFor("library.manage");
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
    return NextResponse.json(await previewRows(operator, parsed.data.workspace, parsed.data.keys, parsed.data.params));
  } catch (error) {
    if (error instanceof OperatorRefusal) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof AdminRefusal) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[API] POST /api/platform-admin/library/preview/rows error:", error);
    return NextResponse.json({ error: "The rows could not be read." }, { status: 500 });
  }
}

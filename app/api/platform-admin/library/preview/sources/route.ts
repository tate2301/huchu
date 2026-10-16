import { NextResponse } from "next/server";

import { AdminRefusal } from "@/lib/admin/refusal";
import { previewSources } from "@/lib/library/preview";
import { OperatorRefusal, requireOperatorFor } from "@/lib/operators/guards";

/**
 * Library › preview: every report source with its columns, what a library
 * item's SQL is written against, and — with `?workspace=` — the ones that
 * workspace's owner reads.
 */
export async function GET(request: Request) {
  try {
    await requireOperatorFor("library.manage");
    const workspace = new URL(request.url).searchParams.get("workspace");
    return NextResponse.json(await previewSources(workspace && workspace.length <= 64 ? workspace : null));
  } catch (error) {
    if (error instanceof OperatorRefusal) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof AdminRefusal) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[API] GET /api/platform-admin/library/preview/sources error:", error);
    return NextResponse.json({ error: "The sources could not be read." }, { status: 500 });
  }
}

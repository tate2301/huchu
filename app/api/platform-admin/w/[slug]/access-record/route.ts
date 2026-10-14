import { NextResponse } from "next/server";

import { AdminRefusal } from "@/lib/admin/refusal";
import { accessRecordCsv } from "@/lib/admin/workspace-settings";
import { workspaceWrite } from "@/lib/admin/workspace-context";
import { OperatorRefusal } from "@/lib/operators/guards";

/** The access record as CSV: who signed in, and when Corelith staff signed in as whom, and why. */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const { operator, workspace } = await workspaceWrite(slug, "workspace.export");
    const csv = await accessRecordCsv(operator, workspace);
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${workspace.slug}-access-record-${day}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AdminRefusal || error instanceof OperatorRefusal) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}

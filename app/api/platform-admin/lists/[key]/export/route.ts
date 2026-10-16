import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { adminListExport } from "@/lib/admin/lists/engine";
import { recordOperatorEvent } from "@/lib/operators/audit";
import { getSignedInOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";
import { exportFileName, exportRows } from "@/lib/reports/export";
import { buildWorkbook } from "@/lib/reports/export-xlsx";
import type { ReportView } from "@/lib/reports/types";

const bodySchema = z.object({
  format: z.enum(["csv", "xlsx"]),
  query: z.object({
    tab: z.string().max(64).nullish().transform((value) => value ?? undefined),
    q: z.string().max(200).optional(),
    sort: z.string().max(80).optional(),
    group: z.string().max(64).optional(),
    page: z.number().int().min(1).default(1),
    size: z.number().int().default(50),
    filters: z.record(z.string().max(64), z.string().max(100)).default({}),
    hidden: z.array(z.string().max(64)).max(80).optional(),
  }),
  rowIds: z.array(z.string()).max(5000).optional(),
});

/**
 * An admin list as a file, fetched again here through the same engine and the
 * same role check the page used. Exporting is `workspace.export`; each file is
 * written to the operators' audit log.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const operator = await getSignedInOperator();
  if (!operator) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  if (!operatorCan(operator.role, "workspace.export")) {
    return NextResponse.json({ error: "Your role cannot export lists." }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That export request could not be read." }, { status: 400 });
  const { key } = await params;
  const { format, query, rowIds } = parsed.data;

  const found = await adminListExport(operator, key, query, rowIds);
  if ("error" in found) return NextResponse.json({ error: found.error }, { status: found.status });

  const view: ReportView = {
    ...found.view,
    columns: found.meta.columns.map((column) => ({ key: column.key, hidden: found.resolved.hidden.includes(column.key) })),
    conditions: [],
    search: found.resolved.q,
  };
  const fileName = exportFileName(found.meta, {}, format);
  const body =
    format === "csv"
      ? Buffer.from(exportRows(found.applied, view), "utf8")
      : await buildWorkbook({ meta: found.meta, params: {}, applied: found.applied, view, selected: Boolean(rowIds), generatedAt: new Date() });

  await recordOperatorEvent({
    operatorId: operator.id,
    eventType: "operator.list.exported",
    entityType: "list",
    entityId: key,
    payload: { format, rows: found.ordered.length, selected: Boolean(rowIds) },
  });

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

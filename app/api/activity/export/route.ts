import { NextRequest, NextResponse } from "next/server";

import { humanizeField, humanizeModel } from "@/lib/activity/describe";
import { listActivity, parseActivityFilters } from "@/lib/activity/query";
import { errorResponse, validateSession } from "@/lib/api-utils";
import { isOrgAdminRole } from "@/lib/preferences/nav";

/** An export is a report, not a backup: past this, narrow the filters. */
const MAX_ROWS = 5000;

function cell(value: string | null | undefined) {
  const text = value ?? "";
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The filtered log as CSV — the same filters as `GET /api/activity`, every page of them. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!isOrgAdminRole(session.user.role)) {
      return errorResponse("Only managers can review the activity log", 403);
    }

    const filters = parseActivityFilters(request.nextUrl.searchParams);
    const lines = [["Time", "Person", "Module", "Change", "Record", "Event", "Details"].join(",")];
    let cursor: string | null = null;
    let rows = 0;

    do {
      const page = await listActivity({
        companyId: session.user.companyId,
        filters,
        cursor,
        limit: 500,
      });
      for (const entry of page.entries) {
        const details = entry.changes
          .map((change) => {
            const fields = (change.fields ?? [])
              .map((field) => `${humanizeField(field.name)}: ${field.value ?? "changed"}`)
              .join("; ");
            const head = `${change.action} ${humanizeModel(change.model).toLowerCase()}${
              change.label ? ` ${change.label}` : ""
            }`;
            return fields ? `${head} (${fields})` : head;
          })
          .join(" | ");
        lines.push(
          [
            entry.createdAt,
            entry.actor?.name,
            entry.moduleLabel,
            entry.summary,
            entry.recordLabel,
            entry.eventType,
            details || entry.reason,
          ]
            .map(cell)
            .join(","),
        );
      }
      rows += page.entries.length;
      cursor = page.nextCursor;
    } while (cursor && rows < MAX_ROWS);

    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="activity-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error("[API] GET /api/activity/export error:", error);
    return errorResponse("Failed to export activity");
  }
}

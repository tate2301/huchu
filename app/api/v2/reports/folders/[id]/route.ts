import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { readerOf } from "@/lib/reports/custom/sources";
import { deleteReportFolder, folderNameSchema, renameReportFolder, type FolderOutcome } from "@/lib/reports/folders";

type Params = { params: Promise<{ id: string }> };

const NOT_YOURS = "Only whoever made this folder, or a manager, can change it";

function refused(outcome: Extract<FolderOutcome<unknown>, { error: string }>, name?: string) {
  if (outcome.error === "missing") return errorResponse("Folder not found", 404);
  if (outcome.error === "taken") return errorResponse(`There is already a folder called ${name ?? "that"}`, 409);
  return errorResponse(NOT_YOURS, 403);
}

/** Rename a folder. */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    const parsed = folderNameSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Name the folder", 400);
    const outcome = await renameReportFolder(readerOf(sessionResult.session), id, parsed.data.name);
    if ("error" in outcome) return refused(outcome, parsed.data.name);
    return successResponse({ folder: outcome.ok });
  } catch (error) {
    console.error("[API] PATCH /api/v2/reports/folders/[id] error:", error);
    return errorResponse("Could not rename the folder");
  }
}

/** Delete a folder; its reports go back to no folder. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    const outcome = await deleteReportFolder(readerOf(sessionResult.session), id);
    if ("error" in outcome) return refused(outcome);
    return successResponse({ deleted: outcome.ok.id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/reports/folders/[id] error:", error);
    return errorResponse("Could not delete the folder");
  }
}

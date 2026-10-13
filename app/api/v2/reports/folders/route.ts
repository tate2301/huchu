import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { readerOf } from "@/lib/reports/custom/sources";
import { createReportFolder, folderNameSchema, listReportFolders } from "@/lib/reports/folders";

/** The workspace's report folders. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    return successResponse({ folders: await listReportFolders(readerOf(sessionResult.session)) });
  } catch (error) {
    console.error("[API] GET /api/v2/reports/folders error:", error);
    return errorResponse("Could not list the folders");
  }
}

/** A new folder, in this person's company. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const parsed = folderNameSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Name the folder", 400);
    const outcome = await createReportFolder(readerOf(sessionResult.session), parsed.data.name);
    if ("error" in outcome) return errorResponse(`There is already a folder called ${parsed.data.name}`, 409);
    return successResponse({ folder: outcome.ok }, 201);
  } catch (error) {
    console.error("[API] POST /api/v2/reports/folders error:", error);
    return errorResponse("Could not make the folder");
  }
}

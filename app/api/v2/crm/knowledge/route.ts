/**
 * The CRM's knowledge base (CRM → Knowledge). Anybody in the CRM reads it;
 * Vane answers and quotes from it. Adding a document is a settings change.
 */
import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { KNOWLEDGE_TYPES, knowledgeExtension, KnowledgeRefused, readKnowledgeFile } from "@/lib/crm/knowledge/read";
import { addKnowledgeDoc, listKnowledge } from "@/lib/crm/knowledge/store";
import { prisma } from "@/lib/prisma";
import { UploadStorageMissing, UploadValidationError, uploadFileToBlob } from "@/lib/uploads/upload-file";

import { requireCrmCapability } from "../_helpers";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    return successResponse({
      data: await listKnowledge(prisma, session.user.companyId),
      canEdit: await requireCrmCapability(session, "settings.manage"),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/knowledge error:", error);
    return errorResponse("Could not read the knowledge base");
  }
}

/** Uploads one document: it is stored, read for its words (and a spreadsheet for its prices), and filed. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!(await requireCrmCapability(session, "settings.manage"))) return errorResponse("Adding to the knowledge base is a CRM settings change", 403);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return errorResponse("Choose a file to upload", 400);
    const ext = knowledgeExtension(file.name);
    if (!ext) return errorResponse("Upload a PDF, a Word document (.docx), a spreadsheet (.xlsx or .csv) or a text file.", 400);
    const title = String(form.get("title") ?? "").trim() || file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();

    const bytes = Buffer.from(await file.arrayBuffer());
    // Read before it is stored, so a file that cannot be read is not kept.
    const read = await readKnowledgeFile(bytes, file.name);
    // Its type from its name: browsers disagree about spreadsheets.
    const typed = new File([bytes], file.name, { type: KNOWLEDGE_TYPES[ext] });
    const stored = await uploadFileToBlob({ file: typed, context: "crm-knowledge", companyId: session.user.companyId });
    const doc = await addKnowledgeDoc(
      prisma,
      { companyId: session.user.companyId, userId: session.user.id },
      { title: title.slice(0, 200), fileName: file.name.slice(0, 255), contentType: stored.contentType, size: stored.size, url: stored.url, pathname: stored.pathname },
      read,
    );
    return successResponse(doc, 201);
  } catch (error) {
    if (error instanceof KnowledgeRefused) return errorResponse(error.message, error.status);
    if (error instanceof UploadValidationError) return errorResponse(error.message, error.status);
    if (error instanceof UploadStorageMissing) return errorResponse("File storage is not set up on this server, so nothing can be uploaded.", 503);
    console.error("[API] POST /api/v2/crm/knowledge error:", error);
    return errorResponse("Could not add it to the knowledge base");
  }
}

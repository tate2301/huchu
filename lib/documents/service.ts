import { createHash } from "crypto";
import { del, put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { renderCsv } from "@/lib/documents/csv-renderer";
import { renderDocumentHtml } from "@/lib/documents/html-renderer";
import { renderPdfFromHtml } from "@/lib/documents/pdf-renderer";
import {
  resolveSourcePayload,
  summarizeSource,
  type SourceContext,
  type SourceResolutionInput,
} from "@/lib/documents/source-registry";
import { resolveTemplate } from "@/lib/documents/template-resolver";
import { getDocumentBranding } from "@/lib/documents/branding-snapshot";
import { renderXlsx } from "@/lib/documents/xlsx-renderer";

export type RenderFormat = "pdf" | "csv" | "xlsx";

export const RENDER_CONTENT_TYPES: Record<RenderFormat, string> = {
  pdf: "application/pdf",
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/**
 * How many rows each format hands back straight away, and how many a
 * background job will take on. A spreadsheet of five thousand rows is a
 * second's work; a PDF of that many is a hundred pages of Chromium, so it
 * goes to a job much sooner and stops much earlier.
 */
export const ROW_LIMITS: Record<RenderFormat, { direct: number; job: number }> = {
  pdf: { direct: 400, job: 2_000 },
  csv: { direct: 5_000, job: 50_000 },
  xlsx: { direct: 5_000, job: 50_000 },
};

/**
 * How long a finished export stays downloadable. An export is made to be
 * fetched once, straight away; one that lingers is a copy of the company's
 * records sitting at a URL, so it is deleted a day later.
 */
export const ARTIFACT_TTL_MS = 24 * 60 * 60 * 1000;

export type DocumentRenderRequest = SourceResolutionInput & {
  format: RenderFormat;
  mode?: "SYNC" | "ASYNC";
  templateId?: string;
  templateVersionId?: string;
  idempotencyKey?: string;
};

export type SyncRenderResult = {
  data: Buffer;
  fileName: string;
  contentType: string;
};

function normalizeFileName(fileName: string, format: RenderFormat): string {
  const trimmed = fileName.trim() || "document";
  const withoutExt = trimmed.replace(/\.(pdf|csv|xlsx)$/i, "");
  return `${withoutExt}.${format}`;
}

function shouldQueueJob(input: DocumentRenderRequest, rowCount: number): boolean {
  if (input.mode === "ASYNC") return true;
  if (input.mode === "SYNC") return false;
  return rowCount > ROW_LIMITS[input.format].direct;
}

/**
 * `Content-Disposition` for a download, with the name in both forms: a plain
 * one for old clients and an encoded one, so "Kwekwe — sites.xlsx" arrives
 * with its dash rather than as a header the browser refuses.
 */
export function attachmentDisposition(fileName: string): string {
  const plain = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function renderDocumentSync(
  companyId: string,
  input: DocumentRenderRequest,
  context: SourceContext = { actorId: null },
): Promise<SyncRenderResult> {
  const source = await resolveSourcePayload(companyId, input, context);
  const rows = source.rowsForCsv ?? source.payload.list?.rows ?? [];
  const template = await resolveTemplate({
    companyId,
    documentType: source.documentType,
    targetType: source.targetType,
    sourceKey: source.sourceKey,
    templateId: input.templateId,
    templateVersionId: input.templateVersionId,
  });

  const fileName = normalizeFileName(source.payload.fileName || source.fileName, input.format);

  const columns = source.payload.list?.columns ?? source.payload.record?.lineColumns;

  if (input.format === "csv") {
    return {
      data: Buffer.from(renderCsv(rows, columns), "utf8"),
      fileName,
      contentType: RENDER_CONTENT_TYPES.csv,
    };
  }

  if (input.format === "xlsx") {
    return {
      data: await renderXlsx({ title: source.payload.title, columns: columns ?? [], rows }),
      fileName,
      contentType: RENDER_CONTENT_TYPES.xlsx,
    };
  }

  const branding = await getDocumentBranding(companyId);
  const html = renderDocumentHtml({
    payload: source.payload,
    branding,
    template: template.templateSchema,
  });

  const pdf = await renderPdfFromHtml({ html, template: template.templateSchema });
  return {
    data: pdf,
    fileName,
    contentType: RENDER_CONTENT_TYPES.pdf,
  };
}

/** An export past what its format will take, refused with a sentence that says so. */
export class ExportTooLargeError extends Error {
  readonly status = 422;
}

export async function enqueueDocumentRenderJob(
  companyId: string,
  requestedById: string,
  input: DocumentRenderRequest,
) {
  const source = await summarizeSource(companyId, input, { actorId: requestedById });
  const limit = ROW_LIMITS[input.format].job;
  if (source.rowCount > limit) {
    const noun = source.noun ?? { one: "row", many: "rows" };
    throw new ExportTooLargeError(
      `That is ${source.rowCount.toLocaleString("en-US")} ${noun.many}. ` +
        `${input.format === "pdf" ? "A PDF stops" : "Exports stop"} at ${limit.toLocaleString("en-US")} — ` +
        "narrow the list and export again.",
    );
  }

  const renderMode = shouldQueueJob(input, source.rowCount) ? "ASYNC" : "SYNC";

  if (renderMode === "SYNC") {
    return { mode: "SYNC" as const, rowCount: source.rowCount };
  }

  if (input.idempotencyKey) {
    const existing = await prisma.documentRenderJob.findFirst({
      where: {
        companyId,
        idempotencyKey: input.idempotencyKey,
        status: { in: ["QUEUED", "RUNNING", "SUCCEEDED"] },
      },
      orderBy: [{ createdAt: "desc" }],
      select: { id: true, status: true },
    });
    if (existing) {
      return {
        mode: "ASYNC" as const,
        jobId: existing.id,
        status: existing.status,
        reused: true,
        rowCount: source.rowCount,
      };
    }
  }

  const template = await resolveTemplate({
    companyId,
    documentType: source.documentType,
    targetType: source.targetType,
    sourceKey: source.sourceKey,
    templateId: input.templateId,
    templateVersionId: input.templateVersionId,
  });

  const job = await prisma.documentRenderJob.create({
    data: {
      companyId,
      templateId: template.templateId,
      templateVersionId: template.templateVersionId,
      documentType: source.documentType,
      targetType: source.targetType,
      sourceKey: source.sourceKey,
      sourceEntityId: input.recordId,
      renderMode: "ASYNC",
      status: "QUEUED",
      payloadJson: JSON.stringify({ input }),
      filtersJson: input.filters ? JSON.stringify(input.filters) : null,
      idempotencyKey: input.idempotencyKey,
      requestedById,
      queuedAt: new Date(),
    },
    select: { id: true, status: true },
  });

  return {
    mode: "ASYNC" as const,
    jobId: job.id,
    status: job.status,
    reused: false,
    rowCount: source.rowCount,
  };
}

function calcRetryDate(attemptCount: number): Date {
  const delays = [5, 15, 60, 180, 720];
  const minutes = delays[Math.min(attemptCount, delays.length - 1)];
  return new Date(Date.now() + minutes * 60 * 1000);
}

async function uploadArtifact(companyId: string, fileName: string, data: Buffer, contentType: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const safeCompany = companyId.replace(/[^a-zA-Z0-9-]/g, "-");
  const path = `companies/${safeCompany}/exports/${yyyy}/${mm}/${Date.now()}-${fileName}`;

  const bytes = Uint8Array.from(data);
  const uploaded = await put(path, new Blob([bytes], { type: contentType }), {
    access: "public",
    addRandomSuffix: true,
    contentType,
  });

  const sha256 = createHash("sha256").update(data).digest("hex");

  return {
    blobUrl: uploaded.url,
    byteSize: data.byteLength,
    sha256,
  };
}

export async function processDocumentRenderJob(jobId: string) {
  const queued = await prisma.documentRenderJob.findUnique({
    where: { id: jobId },
  });

  if (!queued) {
    return { processed: false, reason: "not_found" as const };
  }

  if (queued.status !== "QUEUED" && queued.status !== "FAILED") {
    return { processed: false, reason: "invalid_state" as const };
  }

  const now = new Date();
  if (queued.nextRetryAt && queued.nextRetryAt > now) {
    return { processed: false, reason: "not_ready" as const };
  }

  const claim = await prisma.documentRenderJob.updateMany({
    where: {
      id: jobId,
      status: { in: ["QUEUED", "FAILED"] },
    },
    data: {
      status: "RUNNING",
      startedAt: now,
      attemptCount: { increment: 1 },
      lastError: null,
    },
  });

  if (claim.count === 0) {
    return { processed: false, reason: "already_claimed" as const };
  }

  const running = await prisma.documentRenderJob.findUnique({ where: { id: jobId } });
  if (!running) {
    return { processed: false, reason: "not_found_after_claim" as const };
  }

  try {
    const parsed = JSON.parse(running.payloadJson) as { input: DocumentRenderRequest };
    // As whoever asked for it, so a job that waited while their access was
    // taken away fails rather than exporting what they can no longer read.
    const rendered = await renderDocumentSync(
      running.companyId,
      { ...parsed.input, mode: "SYNC" },
      { actorId: running.requestedById },
    );

    const uploaded = await uploadArtifact(
      running.companyId,
      rendered.fileName,
      rendered.data,
      rendered.contentType,
    );

    const expiresAt = new Date(Date.now() + ARTIFACT_TTL_MS);
    await prisma.$transaction(async (tx) => {
      await tx.documentArtifact.upsert({
        where: { jobId: running.id },
        update: {
          mimeType: rendered.contentType,
          fileName: rendered.fileName,
          blobUrl: uploaded.blobUrl,
          byteSize: uploaded.byteSize,
          sha256: uploaded.sha256,
          expiresAt,
        },
        create: {
          jobId: running.id,
          companyId: running.companyId,
          mimeType: rendered.contentType,
          fileName: rendered.fileName,
          blobUrl: uploaded.blobUrl,
          byteSize: uploaded.byteSize,
          sha256: uploaded.sha256,
          expiresAt,
        },
      });

      await tx.documentRenderJob.update({
        where: { id: running.id },
        data: {
          status: "SUCCEEDED",
          finishedAt: new Date(),
          nextRetryAt: null,
          lastError: null,
        },
      });
    });

    return { processed: true, status: "SUCCEEDED" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown render failure";
    const shouldRetry = running.attemptCount < running.maxAttempts;

    await prisma.documentRenderJob.update({
      where: { id: running.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        nextRetryAt: shouldRetry ? calcRetryDate(running.attemptCount) : null,
        lastError: message,
      },
    });

    return { processed: true, status: "FAILED" as const, error: message };
  }
}

export async function processNextDocumentRenderJob() {
  const now = new Date();
  const candidate = await prisma.documentRenderJob.findFirst({
    where: {
      status: { in: ["QUEUED", "FAILED"] },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    orderBy: [{ queuedAt: "asc" }],
    select: { id: true },
  });

  if (!candidate) {
    return { processed: false, reason: "empty" as const };
  }

  return processDocumentRenderJob(candidate.id);
}

/**
 * Delete finished exports past their expiry: the stored file first, then the
 * row. A file that will not delete keeps its row, so the next pass tries again
 * rather than losing track of a copy of somebody's records.
 */
export async function purgeExpiredArtifacts(limit = 50) {
  const expired = await prisma.documentArtifact.findMany({
    where: { expiresAt: { lt: new Date() } },
    select: { id: true, blobUrl: true },
    orderBy: { expiresAt: "asc" },
    take: limit,
  });
  if (expired.length === 0) return { purged: 0 };

  const purgeable: string[] = [];
  const canDelete = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
  for (const artifact of expired) {
    if (!canDelete) break;
    try {
      await del(artifact.blobUrl);
      purgeable.push(artifact.id);
    } catch (error) {
      console.error("[documents] could not delete an expired export file:", error);
    }
  }
  if (purgeable.length > 0) {
    await prisma.documentArtifact.deleteMany({ where: { id: { in: purgeable } } });
  }
  return { purged: purgeable.length };
}

export async function processDocumentRenderJobsBatch(limitInput: number) {
  const limit = Math.max(1, Math.min(25, Math.floor(limitInput)));
  const results = [];

  try {
    await purgeExpiredArtifacts();
  } catch (error) {
    console.error("[documents] expired export purge failed:", error);
  }

  for (let index = 0; index < limit; index += 1) {
    const result = await processNextDocumentRenderJob();
    results.push(result);
    if (!result.processed) break;
  }

  const processedCount = results.filter((row) => row.processed).length;
  const failedCount = results.filter((row) => "status" in row && row.status === "FAILED").length;
  const last = results.at(-1);

  return {
    limit,
    processedCount,
    failedCount,
    stopReason: last && !last.processed && "reason" in last ? last.reason : null,
    results,
  };
}

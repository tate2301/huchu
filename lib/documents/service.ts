import { createHash } from "crypto";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { renderCsv } from "@/lib/documents/csv-renderer";
import { renderDocumentHtml } from "@/lib/documents/html-renderer";
import { renderPdfFromHtml } from "@/lib/documents/pdf-renderer";
import { resolveSourcePayload, type SourceResolutionInput } from "@/lib/documents/source-registry";
import { resolveTemplate } from "@/lib/documents/template-resolver";
import { getDocumentBranding } from "@/lib/documents/branding-snapshot";

export type RenderFormat = "pdf" | "csv";

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
  const withoutExt = trimmed.replace(/\.(pdf|csv)$/i, "");
  return `${withoutExt}.${format}`;
}

function shouldQueueJob(input: DocumentRenderRequest, rowCount: number): boolean {
  if (input.mode === "ASYNC") return true;
  if (input.mode === "SYNC") return false;
  return rowCount > 400;
}

export async function renderDocumentSync(
  companyId: string,
  input: DocumentRenderRequest,
): Promise<SyncRenderResult> {
  const source = await resolveSourcePayload(companyId, input);
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

  if (input.format === "csv") {
    const columns = source.payload.list?.columns?.map((column) => column.key);
    const text = renderCsv(rows, columns);
    return {
      data: Buffer.from(text, "utf8"),
      fileName,
      contentType: "text/csv; charset=utf-8",
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
    contentType: "application/pdf",
  };
}

export async function enqueueDocumentRenderJob(
  companyId: string,
  requestedById: string,
  input: DocumentRenderRequest,
) {
  const source = await resolveSourcePayload(companyId, input);
  const rowCount = source.rowsForCsv?.length ?? source.payload.list?.rows?.length ?? 0;
  const renderMode = shouldQueueJob(input, rowCount) ? "ASYNC" : "SYNC";

  if (renderMode === "SYNC") {
    return { mode: "SYNC" as const };
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
    const rendered = await renderDocumentSync(running.companyId, {
      ...parsed.input,
      mode: "SYNC",
    });

    const uploaded = await uploadArtifact(
      running.companyId,
      rendered.fileName,
      rendered.data,
      rendered.contentType,
    );

    await prisma.$transaction(async (tx) => {
      await tx.documentArtifact.upsert({
        where: { jobId: running.id },
        update: {
          mimeType: rendered.contentType,
          fileName: rendered.fileName,
          blobUrl: uploaded.blobUrl,
          byteSize: uploaded.byteSize,
          sha256: uploaded.sha256,
          expiresAt: null,
        },
        create: {
          jobId: running.id,
          companyId: running.companyId,
          mimeType: rendered.contentType,
          fileName: rendered.fileName,
          blobUrl: uploaded.blobUrl,
          byteSize: uploaded.byteSize,
          sha256: uploaded.sha256,
          expiresAt: null,
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

export async function processDocumentRenderJobsBatch(limitInput: number) {
  const limit = Math.max(1, Math.min(25, Math.floor(limitInput)));
  const results = [];

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

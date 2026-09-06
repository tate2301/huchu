"use client";

import type { UniversalDocumentPayload } from "./types";

import { inferTableSourceKey, type TableExportFormat } from "@corelithzw/ui/lib/table-export";

export type DocumentExportFormat = TableExportFormat;

type AsyncRenderResponse = {
  mode: "ASYNC";
  jobId: string;
  status?: string;
};

type RenderRequest = {
  sourceKey: string;
  format: DocumentExportFormat;
  /**
   * The document's content, when the caller has it.
   *
   * Optional since Iteration 5: a school's invoice, receipt, statement or report
   * card is resolved on the server from `recordId`, because the rules about what
   * may be printed live there — a report card is gated on the publish window, and
   * a client that assembled its own payload would be a way around that gate.
   */
  payload?: UniversalDocumentPayload;
  /** RECORD for one document, LIST for a table. Defaults to LIST. */
  target?: "LIST" | "RECORD" | "DASHBOARD";
  /** The record to render, for server-resolved sources. */
  recordId?: string;
  filters?: Record<string, string>;
  templateId?: string;
  templateVersionId?: string;
  mode?: "SYNC" | "ASYNC";
  idempotencyKey?: string;
};

type ExportStatus =
  | "requesting"
  | "queued"
  | "processing"
  | "ready"
  | "downloading"
  | "done";

type RunDocumentExportOptions = {
  pollIntervalMs?: number;
  timeoutMs?: number;
  onStatus?: (status: ExportStatus, detail?: string) => void;
};

type RenderJob = {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  lastError: string | null;
  artifact?: {
    id: string;
    fileName?: string | null;
  } | null;
};

function parseErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  if ("error" in payload && typeof payload.error === "string") return payload.error;
  if ("message" in payload && typeof payload.message === "string") return payload.message;
  return fallback;
}

function parseFileNameFromContentDisposition(value: string | null, fallback: string) {
  if (!value) return fallback;
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const plainMatch = value.match(/filename="?([^"]+)"?/i);
  return plainMatch?.[1] ?? fallback;
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function sleep(ms: number) {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function fetchJob(jobId: string): Promise<RenderJob> {
  const response = await fetch(`/api/documents/render-jobs/${jobId}`, {
    method: "GET",
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, "Failed to read export job status"));
  }
  return payload as RenderJob;
}

export const inferSourceKeyFromPath = inferTableSourceKey;

export async function runDocumentExport(
  request: RenderRequest,
  options: RunDocumentExportOptions = {},
) {
  const onStatus = options.onStatus;
  const pollIntervalMs = Math.max(500, options.pollIntervalMs ?? 1500);
  const timeoutMs = Math.max(15000, options.timeoutMs ?? 180000);

  onStatus?.("requesting");

  const response = await fetch("/api/documents/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target: request.target ?? "LIST",
      sourceKey: request.sourceKey,
      format: request.format,
      recordId: request.recordId,
      filters: request.filters,
      payload: request.payload,
      templateId: request.templateId,
      templateVersionId: request.templateVersionId,
      mode: request.mode,
      idempotencyKey: request.idempotencyKey,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as unknown;
    throw new Error(parseErrorMessage(payload, "Export request failed"));
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    onStatus?.("downloading");
    const blob = await response.blob();
    // A server-resolved document names itself in Content-Disposition, so the
    // fallback only matters for a caller that supplied its own payload.
    const defaultName = request.payload?.fileName || request.sourceKey.split(".").pop() || "export";
    const suffix = request.format === "csv" ? ".csv" : ".pdf";
    const fileName = parseFileNameFromContentDisposition(
      response.headers.get("Content-Disposition"),
      defaultName.endsWith(suffix) ? defaultName : `${defaultName}${suffix}`,
    );
    triggerBlobDownload(blob, fileName);
    onStatus?.("done");
    return;
  }

  const asyncPayload = (await response.json()) as AsyncRenderResponse;
  if (asyncPayload.mode !== "ASYNC" || !asyncPayload.jobId) {
    throw new Error("Unexpected export response from server");
  }

  onStatus?.("queued", asyncPayload.jobId);

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    onStatus?.("processing");
    const job = await fetchJob(asyncPayload.jobId);

    if (job.status === "FAILED") {
      throw new Error(job.lastError || "Export processing failed");
    }

    if (job.status === "SUCCEEDED") {
      if (!job.artifact?.id) {
        throw new Error("Export finished but artifact is missing");
      }
      onStatus?.("ready", job.artifact.id);
      onStatus?.("downloading");
      window.location.assign(`/api/documents/artifacts/${job.artifact.id}`);
      onStatus?.("done");
      return;
    }

    await sleep(pollIntervalMs);
  }

  throw new Error("Export timed out. Please retry.");
}


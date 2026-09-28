import { after, NextResponse } from "next/server";

import {
  attachmentDisposition,
  enqueueDocumentRenderJob,
  processDocumentRenderJobsBatch,
  renderDocumentSync,
  type DocumentRenderRequest,
} from "@/lib/documents/service";

function inlineBatchLimit() {
  const configured = Number(process.env.PDF_INLINE_BATCH_LIMIT ?? 2);
  if (!Number.isFinite(configured)) return 2;
  return Math.max(1, Math.min(10, Math.floor(configured)));
}

/**
 * Answer a render request: the file itself when it is small enough to make
 * now, or a job to poll when it is not. Shared by every route that hands the
 * documents pipeline a request, so a list export and a printed invoice queue,
 * poll and download the same way.
 *
 * `onQueued` sees the decision before anything is sent — the place to write
 * down that an export was asked for, with how many rows it had.
 */
export async function respondWithRender(
  user: { id: string; companyId: string },
  input: DocumentRenderRequest,
  onQueued?: (decision: Awaited<ReturnType<typeof enqueueDocumentRenderJob>>) => Promise<void>,
): Promise<Response> {
  const queued = await enqueueDocumentRenderJob(user.companyId, user.id, input);
  await onQueued?.(queued);

  if (queued.mode === "ASYNC") {
    const limit = inlineBatchLimit();
    after(async () => {
      try {
        await processDocumentRenderJobsBatch(limit);
      } catch (error) {
        console.error("[documents] inline async render dispatch error:", error);
      }
    });
    return NextResponse.json({
      mode: "ASYNC",
      jobId: queued.jobId,
      status: queued.status,
      reused: queued.reused,
    });
  }

  const rendered = await renderDocumentSync(user.companyId, input, { actorId: user.id });
  return new Response(new Uint8Array(rendered.data), {
    headers: {
      "Content-Type": rendered.contentType,
      "Content-Disposition": attachmentDisposition(rendered.fileName),
      "Cache-Control": "no-store",
    },
  });
}

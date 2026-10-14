import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { chatHistory, chatTurn, type ChatEvent } from "@/lib/vane/chat";

export const runtime = "nodejs";
/** A turn runs while the person waits: up to 90 s of Vane, and the writing either side. */
export const maxDuration = 120;

const turnSchema = z.object({
  text: z.string().trim().min(1, "Say what you would like Vane to do").max(4000, "Keep it to 4,000 characters"),
  /** The module the person is in ("books"), for the answer's bearings. */
  module: z.string().max(40).nullable().optional(),
  /** The page they have open, so "this deal" means the one on screen. */
  path: z.string().max(300).regex(/^\/[^\s]*$/).nullable().optional(),
});

/** This person's conversation with Vane, oldest first. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    return successResponse({ messages: await chatHistory(prisma, { companyId: session.user.companyId, userId: session.user.id }) });
  } catch (error) {
    console.error("[API] GET /api/vane/chat error:", error);
    return errorResponse("Could not read your conversation with Vane");
  }
}

/**
 * One turn of the chat, answered while the person waits. The response is a
 * stream of JSON lines: `working` with what Vane is doing, then the `answer`
 * (with any actions it proposes) or the `error` that stopped it.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const body = turnSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return errorResponse(body.error.issues[0]?.message ?? "Say what you would like Vane to do", 400);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: ChatEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        try {
          await chatTurn(
            prisma,
            { companyId: session.user.companyId, userId: session.user.id, role: session.user.role, name: session.user.name ?? null },
            { text: body.data.text, module: body.data.module, path: body.data.path },
            { onEvent: send },
          );
        } catch (error) {
          console.error("[API] POST /api/vane/chat turn error:", error);
          send({ type: "error", error: "Vane could not finish that." });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache, no-transform" } });
  } catch (error) {
    console.error("[API] POST /api/vane/chat error:", error);
    return errorResponse("Could not ask Vane");
  }
}

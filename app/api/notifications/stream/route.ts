import { NextRequest, NextResponse } from "next/server"

import { errorResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

function encodeEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const userId = session.user.id
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      start(controller) {
        let closed = false
        let lastSignature = ""
        let pollTimer: NodeJS.Timeout | null = null
        let heartbeatTimer: NodeJS.Timeout | null = null

        const send = (event: string, data: unknown) => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(encodeEvent(event, data)))
          } catch {
            closed = true
          }
        }

        const stop = () => {
          if (closed) return
          closed = true
          if (pollTimer) clearInterval(pollTimer)
          if (heartbeatTimer) clearInterval(heartbeatTimer)
          try {
            controller.close()
          } catch {
            // no-op
          }
        }

        const poll = async () => {
          try {
            const [unreadCount, totalCount, latest] = await Promise.all([
              prisma.notificationRecipient.count({
                where: { userId, isArchived: false, isRead: false },
              }),
              prisma.notificationRecipient.count({
                where: { userId, isArchived: false },
              }),
              prisma.notificationRecipient.findFirst({
                where: { userId, isArchived: false },
                orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
                select: {
                  updatedAt: true,
                  notification: { select: { createdAt: true } },
                },
              }),
            ])

            const latestAt =
              latest?.updatedAt?.toISOString() ??
              latest?.notification.createdAt.toISOString() ??
              null
            const signature = `${unreadCount}:${totalCount}:${latestAt ?? "none"}`
            if (signature !== lastSignature) {
              lastSignature = signature
              send("snapshot", {
                unreadCount,
                totalCount,
                latestAt,
                timestamp: new Date().toISOString(),
              })
            }
          } catch (error) {
            send("error", {
              message: "Failed to poll notifications",
              detail: error instanceof Error ? error.message : "unknown",
            })
          }
        }

        send("ready", { timestamp: new Date().toISOString() })
        void poll()
        pollTimer = setInterval(() => void poll(), 5000)
        heartbeatTimer = setInterval(() => {
          send("heartbeat", { timestamp: new Date().toISOString() })
        }, 15000)

        request.signal.addEventListener("abort", stop)
      },
      cancel() {
        // stream teardown handled by abort listener
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    console.error("[API] GET /api/notifications/stream error:", error)
    return errorResponse("Failed to establish notification stream")
  }
}

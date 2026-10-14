import { NextRequest, NextResponse } from "next/server"

import { errorResponse, validateSession } from "@/lib/api-utils"
import { isRouteAllowedForRole } from "@/lib/auth-core/role-routes"
import { canAccessCapabilityWithToken } from "@/lib/platform/gating/token-check"
import { prisma } from "@/lib/prisma"
import { vaneSignature } from "@/lib/vane/live"

export const runtime = "nodejs"

function encodeEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

/**
 * The workspace's one live channel (server-sent events). Every five seconds
 * it looks for change and says what changed:
 *
 * - `notifications`: this person's unread and total counts or newest
 *   notification moved. Only with the notification centre.
 * - `vane`: Vane raised, moved or set aside a card, a job moved on, a plan's
 *   step was ticked, or Vane was paused (`vaneSignature`). Only for a role
 *   that may open Vane.
 *
 * The page reads its data again on each; nothing else travels here.
 * `heartbeat` every fifteen seconds keeps proxies from closing it.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const userId = session.user.id
    const companyId = session.user.companyId
    const watchNotifications = canAccessCapabilityWithToken(
      "notification.center.stream",
      session.user.enabledFeatures,
    ).allowed
    const watchVane = Boolean(companyId) && isRouteAllowedForRole(session.user.role, "/vane")
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      start(controller) {
        let closed = false
        let lastNotifications = ""
        let lastVane = ""
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

        const pollNotifications = async () => {
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
            latest?.updatedAt?.toISOString() ?? latest?.notification.createdAt.toISOString() ?? null
          const signature = `${unreadCount}:${totalCount}:${latestAt ?? "none"}`
          if (signature !== lastNotifications) {
            lastNotifications = signature
            send("notifications", { unreadCount, totalCount, latestAt, timestamp: new Date().toISOString() })
          }
        }

        const pollVane = async () => {
          const signature = await vaneSignature(prisma, companyId)
          if (signature !== lastVane) {
            // The first answer is where the page already is; only a change is news.
            if (lastVane) send("vane", { timestamp: new Date().toISOString() })
            lastVane = signature
          }
        }

        const poll = async () => {
          const results = await Promise.allSettled([
            watchNotifications ? pollNotifications() : Promise.resolve(),
            watchVane ? pollVane() : Promise.resolve(),
          ])
          const failed = results.find((result) => result.status === "rejected")
          if (failed && failed.status === "rejected") {
            send("error", {
              message: "Failed to look for changes",
              detail: failed.reason instanceof Error ? failed.reason.message : "unknown",
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
    console.error("[API] GET /api/live error:", error)
    return errorResponse("Failed to open the live stream")
  }
}

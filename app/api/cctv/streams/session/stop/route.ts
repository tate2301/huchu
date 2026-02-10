import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { StreamSessionStatus } from "@prisma/client"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { calculateDurationSeconds, isManagerRole } from "@/app/api/cctv/_helpers"

/**
 * POST /api/cctv/streams/session/stop
 * Stop an active stream session.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { sessionId } = body

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 })
    }

    const existing = await prisma.streamSession.findFirst({
      where: {
        id: sessionId,
        camera: {
          site: {
            companyId: session.user.companyId,
          },
        },
      },
      include: {
        camera: {
          select: {
            id: true,
            name: true,
            site: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    if (existing.userId !== session.user.id && !isManagerRole(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (existing.status !== StreamSessionStatus.ACTIVE) {
      return NextResponse.json({ session: existing })
    }

    const endedAt = new Date()
    const updatedSession = await prisma.streamSession.update({
      where: { id: existing.id },
      data: {
        status: StreamSessionStatus.STOPPED,
        endedAt,
      },
      include: {
        camera: {
          select: {
            id: true,
            name: true,
            area: true,
            site: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    })

    const activeLog = await prisma.cameraAccessLog.findFirst({
      where: {
        cameraId: existing.cameraId,
        userId: existing.userId,
        accessType: "LIVE_VIEW",
        endTime: null,
      },
      orderBy: { startTime: "desc" },
    })

    if (activeLog) {
      const duration = calculateDurationSeconds(activeLog.startTime, endedAt)
      await prisma.cameraAccessLog.update({
        where: { id: activeLog.id },
        data: {
          endTime: endedAt,
          duration,
          notes: activeLog.notes ? `${activeLog.notes}\nSession ${existing.id} stopped` : `Session ${existing.id} stopped`,
        },
      })
    }

    return NextResponse.json({ session: updatedSession })
  } catch (error) {
    console.error("Error stopping stream session:", error)
    return NextResponse.json({ error: "Failed to stop stream session" }, { status: 500 })
  }
}

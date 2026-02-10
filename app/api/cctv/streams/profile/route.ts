import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { StreamType } from "@/lib/cctv-types"
import { generateRTSPUrl, generateStreamToken } from "@/lib/cctv-utils"
import {
  isManagerRole,
  isValidStreamType,
  resolvePlaybackUrls,
  VALID_STREAM_TYPES,
} from "@/app/api/cctv/_helpers"

/**
 * POST /api/cctv/streams/profile
 * Switch stream profile for an active session.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { sessionId, streamType, preferredProtocol = "WEBRTC" } = body

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 })
    }

    if (!streamType || !isValidStreamType(streamType)) {
      return NextResponse.json(
        { error: `Invalid streamType. Expected one of: ${VALID_STREAM_TYPES.join(", ")}` },
        { status: 400 },
      )
    }

    const existingSession = await prisma.streamSession.findFirst({
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
          include: {
            nvr: true,
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

    if (!existingSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    if (existingSession.userId !== session.user.id && !isManagerRole(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (existingSession.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Only active sessions can switch stream profile" },
        { status: 409 },
      )
    }

    const tokenData = generateStreamToken(existingSession.cameraId, streamType as StreamType, 15)
    const rtspUrl = generateRTSPUrl(
      {
        host: existingSession.camera.nvr.ipAddress,
        port: existingSession.camera.nvr.rtspPort,
        username: existingSession.camera.nvr.username,
        password: existingSession.camera.nvr.password,
      },
      existingSession.camera.channelNumber,
      streamType as StreamType,
      false,
    )

    const playback = resolvePlaybackUrls({
      cameraId: existingSession.cameraId,
      streamType,
      token: tokenData.token,
      preferredProtocol,
    })

    const updatedSession = await prisma.streamSession.update({
      where: { id: existingSession.id },
      data: {
        streamType,
        protocol: playback.protocol,
        playUrl: playback.playUrl,
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

    return NextResponse.json({
      session: updatedSession,
      token: tokenData.token,
      rtspUrl,
      playUrl: playback.playUrl,
      fallbackPlayUrl: playback.fallbackPlayUrl,
      protocol: playback.protocol,
      expiresAt: tokenData.expiresAt,
    })
  } catch (error) {
    console.error("Error switching stream profile:", error)
    return NextResponse.json({ error: "Failed to switch stream profile" }, { status: 500 })
  }
}

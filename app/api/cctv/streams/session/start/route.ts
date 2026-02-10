import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { StreamSessionStatus } from "@prisma/client"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { StreamType } from "@/lib/cctv-types"
import { generateRTSPUrl, generateStreamToken } from "@/lib/cctv-utils"
import {
  isValidStreamType,
  normalizeIp,
  resolvePlaybackUrls,
  VALID_STREAM_TYPES,
} from "@/app/api/cctv/_helpers"

/**
 * POST /api/cctv/streams/session/start
 * Start a trackable live-view session for a camera.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      cameraId,
      streamType = "sub",
      preferredProtocol = "WEBRTC",
      purpose,
      clientMeta,
      expiresInMinutes = 15,
    } = body

    if (!cameraId) {
      return NextResponse.json({ error: "cameraId is required" }, { status: 400 })
    }

    if (!isValidStreamType(streamType)) {
      return NextResponse.json(
        { error: `Invalid stream type. Expected one of: ${VALID_STREAM_TYPES.join(", ")}` },
        { status: 400 },
      )
    }

    const camera = await prisma.camera.findFirst({
      where: {
        id: cameraId,
        isActive: true,
        site: {
          companyId: session.user.companyId,
        },
      },
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
    })

    if (!camera) {
      return NextResponse.json({ error: "Camera not found" }, { status: 404 })
    }

    if (!camera.nvr.isActive) {
      return NextResponse.json({ error: "NVR is inactive" }, { status: 400 })
    }

    if (!camera.nvr.isOnline || !camera.isOnline) {
      return NextResponse.json(
        { error: "Camera or NVR is offline. Bring both online before starting a live session." },
        { status: 503 },
      )
    }

    const tokenData = generateStreamToken(camera.id, streamType as StreamType, expiresInMinutes)
    const rtspUrl = generateRTSPUrl(
      {
        host: camera.nvr.ipAddress,
        port: camera.nvr.rtspPort,
        username: camera.nvr.username,
        password: camera.nvr.password,
      },
      camera.channelNumber,
      streamType as StreamType,
      false,
    )

    const playback = resolvePlaybackUrls({
      cameraId: camera.id,
      streamType,
      token: tokenData.token,
      preferredProtocol,
    })

    const existingSession = await prisma.streamSession.findFirst({
      where: {
        cameraId: camera.id,
        userId: session.user.id,
        status: StreamSessionStatus.ACTIVE,
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
            nvr: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { startedAt: "desc" },
    })

    if (existingSession) {
      return NextResponse.json({
        session: existingSession,
        token: tokenData.token,
        rtspUrl,
        expiresAt: tokenData.expiresAt,
        protocol: existingSession.protocol,
        playUrl: existingSession.playUrl,
        fallbackPlayUrl: playback.fallbackPlayUrl,
        gatewayConfigured: playback.gatewayConfigured,
      })
    }

    const streamSession = await prisma.streamSession.create({
      data: {
        cameraId: camera.id,
        siteId: camera.siteId,
        userId: session.user.id,
        streamType,
        protocol: playback.protocol,
        status: StreamSessionStatus.ACTIVE,
        playUrl: playback.playUrl,
        purpose: purpose || "Live monitoring",
        clientMeta: clientMeta ? JSON.stringify(clientMeta) : null,
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
            nvr: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    })

    await prisma.cameraAccessLog.create({
      data: {
        cameraId: camera.id,
        userId: session.user.id,
        accessType: "LIVE_VIEW",
        startTime: new Date(),
        ipAddress: normalizeIp(request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip")),
        purpose: purpose || "Live monitoring",
        notes: `Session ${streamSession.id} started`,
      },
    })

    return NextResponse.json({
      session: streamSession,
      token: tokenData.token,
      rtspUrl,
      expiresAt: tokenData.expiresAt,
      protocol: playback.protocol,
      playUrl: playback.playUrl,
      fallbackPlayUrl: playback.fallbackPlayUrl,
      gatewayConfigured: playback.gatewayConfigured,
    })
  } catch (error) {
    console.error("Error starting stream session:", error)
    return NextResponse.json({ error: "Failed to start stream session" }, { status: 500 })
  }
}

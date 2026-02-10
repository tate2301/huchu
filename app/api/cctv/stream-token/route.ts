import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { StreamProtocol } from "@prisma/client"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateRTSPUrl, generateStreamToken } from "@/lib/cctv-utils"
import { StreamType } from "@/lib/cctv-types"
import {
  isValidStreamType,
  normalizeIp,
  resolvePlaybackUrls,
  VALID_STREAM_TYPES,
} from "@/app/api/cctv/_helpers"

/**
 * POST /api/cctv/stream-token
 * Generate a short-lived token and stream metadata
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
      expiresInMinutes = 15,
      preferredProtocol = "WEBRTC",
      purpose,
    } = body

    if (!cameraId) {
      return NextResponse.json({ error: "cameraId is required" }, { status: 400 })
    }

    if (!isValidStreamType(streamType)) {
      return NextResponse.json(
        {
          error: `Invalid stream type. Expected one of: ${VALID_STREAM_TYPES.join(", ")}`,
        },
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

    if (!camera.nvr.isOnline) {
      return NextResponse.json({ error: "NVR is offline" }, { status: 503 })
    }

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

    const tokenData = generateStreamToken(camera.id, streamType as StreamType, expiresInMinutes)
    const playback = resolvePlaybackUrls({
      cameraId: camera.id,
      streamType,
      token: tokenData.token,
      preferredProtocol:
        preferredProtocol === "HLS" ? StreamProtocol.HLS : StreamProtocol.WEBRTC,
    })

    await prisma.cameraAccessLog.create({
      data: {
        cameraId: camera.id,
        userId: session.user.id,
        accessType: "LIVE_VIEW",
        startTime: new Date(),
        ipAddress: normalizeIp(request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip")),
        purpose: purpose || "Live monitoring",
        notes: `Stream token generated (${streamType})`,
      },
    })

    return NextResponse.json({
      token: tokenData.token,
      rtspUrl,
      expiresAt: tokenData.expiresAt,
      protocol: playback.protocol,
      playUrl: playback.playUrl,
      fallbackPlayUrl: playback.fallbackPlayUrl,
      gatewayConfigured: playback.gatewayConfigured,
      camera: {
        id: camera.id,
        name: camera.name,
        area: camera.area,
        channelNumber: camera.channelNumber,
        site: camera.site,
        nvr: {
          id: camera.nvr.id,
          name: camera.nvr.name,
        },
      },
      streamInfo: {
        streamType,
        resolution: streamType === "main" ? "1920x1080" : "704x576",
        recommended: streamType === "sub" ? "Use for grid view" : "Use for fullscreen",
      },
    })
  } catch (error) {
    console.error("Error generating stream token:", error)
    return NextResponse.json({ error: "Failed to generate stream token" }, { status: 500 })
  }
}

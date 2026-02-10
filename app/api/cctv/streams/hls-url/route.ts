import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { StreamType } from "@/lib/cctv-types"
import { generateStreamToken } from "@/lib/cctv-utils"
import { isValidStreamType, resolvePlaybackUrls, VALID_STREAM_TYPES } from "@/app/api/cctv/_helpers"

/**
 * GET /api/cctv/streams/hls-url
 * Returns browser-compatible HLS URL metadata for a camera stream.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const cameraId = searchParams.get("cameraId")
    const streamType = searchParams.get("streamType") || "sub"

    if (!cameraId) {
      return NextResponse.json({ error: "cameraId is required" }, { status: 400 })
    }

    if (!isValidStreamType(streamType)) {
      return NextResponse.json(
        { error: `Invalid streamType. Expected one of: ${VALID_STREAM_TYPES.join(", ")}` },
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
      select: {
        id: true,
        name: true,
        area: true,
        channelNumber: true,
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

    const tokenData = generateStreamToken(camera.id, streamType as StreamType, 15)
    const playback = resolvePlaybackUrls({
      cameraId: camera.id,
      streamType,
      token: tokenData.token,
      preferredProtocol: "HLS",
    })

    if (!playback.playUrl) {
      return NextResponse.json(
        { error: "HLS URL could not be generated. Configure CCTV_HLS_BASE_URL or CCTV_GATEWAY_URL." },
        { status: 503 },
      )
    }

    return NextResponse.json({
      url: playback.playUrl,
      protocol: playback.protocol,
      token: tokenData.token,
      expiresAt: tokenData.expiresAt,
      camera,
      streamType,
      fallbackPlayUrl: playback.fallbackPlayUrl,
    })
  } catch (error) {
    console.error("Error generating HLS URL:", error)
    return NextResponse.json({ error: "Failed to generate HLS URL" }, { status: 500 })
  }
}

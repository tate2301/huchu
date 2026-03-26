import { NextRequest, NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import {
  applySeekToPlaybackUri,
  buildPlaybackRecordStreamPath,
  clampPlaybackSeekTime,
} from "@/lib/cctv-playback"
import { parsePlaybackToken as parsePlaybackSessionToken } from "@/lib/cctv-utils"

/**
 * POST /api/cctv/playback/config
 * Internal endpoint for the gateway to resolve a playback record into a
 * credentialed RTSP playback URL.
 */
export async function POST(request: NextRequest) {
  try {
    const gatewayKey = request.headers.get("x-gateway-key")
    const expectedKey = process.env.GATEWAY_KEY || "your-secret-key"

    if (gatewayKey !== expectedKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const {
      playbackRecordId,
      token,
      seekTime,
      seekAt,
      streamPath,
      playbackSessionId,
    } = await request.json()

    if (!token) {
      return NextResponse.json(
        { error: "token is required" },
        { status: 400 },
      )
    }

    const tokenData = parsePlaybackSessionToken(token)
    if (!tokenData) {
      return NextResponse.json(
        { error: "Invalid or expired playback token" },
        { status: 403 },
      )
    }

    const resolvedPlaybackRecordId = playbackRecordId || tokenData.playbackRecordId
    if (resolvedPlaybackRecordId !== tokenData.playbackRecordId) {
      return NextResponse.json(
        { error: "Playback record does not match token" },
        { status: 403 },
      )
    }

    const record = await prisma.playbackRecord.findUnique({
      where: { id: resolvedPlaybackRecordId },
      include: {
        camera: {
          include: {
            nvr: true,
          },
        },
      },
    })

    if (!record || !record.camera?.nvr || !record.playbackUri) {
      return NextResponse.json({ error: "Playback record not found" }, { status: 404 })
    }

    const resolvedSeekTime = clampPlaybackSeekTime(
      typeof seekAt === "string"
        ? seekAt
        : typeof seekTime === "string"
          ? seekTime
          : undefined,
      record.startTime.toISOString(),
      record.endTime.toISOString(),
    )

    const rtspUrl = applySeekToPlaybackUri({
      playbackUri: record.playbackUri,
      clipStartTime: record.startTime.toISOString(),
      clipEndTime: record.endTime.toISOString(),
      seekTime: resolvedSeekTime,
      nvr: {
        host: record.camera.nvr.ipAddress,
        rtspPort: record.camera.nvr.rtspPort,
        username: record.camera.nvr.username,
        password: record.camera.nvr.password,
      },
    })

    return NextResponse.json({
      playbackRecordId: record.id,
      cameraId: record.cameraId,
      startTime: record.startTime,
      endTime: record.endTime,
      seekTime: resolvedSeekTime,
      streamPath:
        typeof streamPath === "string" && streamPath.length > 0
          ? streamPath
          : buildPlaybackRecordStreamPath(record.id),
      playbackSessionId:
        typeof playbackSessionId === "string" && playbackSessionId.length > 0
          ? playbackSessionId
          : null,
      playbackUri: record.playbackUri,
      rtspUrl,
    })
  } catch (error) {
    console.error("Error resolving playback config:", error)
    return NextResponse.json({ error: "Failed to resolve playback config" }, { status: 500 })
  }
}

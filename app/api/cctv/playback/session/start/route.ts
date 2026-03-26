import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { StreamProtocol } from "@prisma/client"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  generatePlaybackToken,
  parsePlaybackToken,
} from "@/lib/cctv-utils"
import { normalizeIp } from "@/app/api/cctv/_helpers"

const VALID_PROTOCOLS = new Set<StreamProtocol | "WEBRTC" | "HLS">(["WEBRTC", "HLS"])

/**
 * POST /api/cctv/playback/session/start
 * Returns tokenized public playback URLs for a stored playback clip and
 * optionally restarts playback from a seek position.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      playbackRecordId,
      token,
      seekTime,
      preferredProtocol = "HLS",
      purpose,
    } = body

    if (!playbackRecordId && !token) {
      return NextResponse.json(
        { error: "playbackRecordId or token is required" },
        { status: 400 },
      )
    }

    if (!VALID_PROTOCOLS.has(preferredProtocol)) {
      return NextResponse.json(
        { error: "preferredProtocol must be WEBRTC or HLS" },
        { status: 400 },
      )
    }

    const parsedToken = typeof token === "string" ? parsePlaybackToken(token) : null
    if (token && !parsedToken) {
      return NextResponse.json({ error: "Invalid or expired playback token" }, { status: 403 })
    }

    const resolvedPlaybackRecordId = playbackRecordId || parsedToken?.playbackRecordId
    if (!resolvedPlaybackRecordId) {
      return NextResponse.json({ error: "Playback record not found" }, { status: 404 })
    }

    const record = await prisma.playbackRecord.findFirst({
      where: {
        id: resolvedPlaybackRecordId,
        camera: {
          isActive: true,
          site: {
            companyId: session.user.companyId,
          },
        },
      },
      include: {
        camera: {
          include: {
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

    if (!record) {
      return NextResponse.json({ error: "Playback record not found" }, { status: 404 })
    }

    if (parsedToken && parsedToken.cameraId !== record.cameraId) {
      return NextResponse.json({ error: "Playback token does not match clip" }, { status: 403 })
    }

    const tokenData =
      parsedToken && parsedToken.playbackRecordId === record.id
        ? { token, ...parsedToken }
        : generatePlaybackToken(record.id, record.cameraId, 60)

    const gatewayBase = process.env.CCTV_GATEWAY_URL?.trim().replace(/\/+$/, "")
    if (!gatewayBase) {
      return NextResponse.json(
        { error: "Playback gateway is not configured. Set CCTV_GATEWAY_URL." },
        { status: 503 },
      )
    }

    const gatewayResponse = await fetch(`${gatewayBase}/api/playback/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-gateway-key": process.env.GATEWAY_KEY || "your-secret-key",
      },
      body: JSON.stringify({
        playbackRecordId: record.id,
        playbackSessionId: randomUUID(),
        seekAt: typeof seekTime === "string" ? seekTime : undefined,
        token: tokenData.token,
      }),
      cache: "no-store",
    })

    if (!gatewayResponse.ok) {
      const details = await gatewayResponse.text()
      return NextResponse.json(
        {
          error: "Gateway playback session failed",
          details: details || `Gateway responded with ${gatewayResponse.status}`,
        },
        { status: 502 },
      )
    }

    const playback = (await gatewayResponse.json()) as {
      streamPath: string
      whepUrl: string | null
      hlsUrl: string | null
    }
    const resolvedProtocol =
      preferredProtocol === "WEBRTC" && playback.whepUrl ? "WEBRTC" : "HLS"
    const playUrl =
      resolvedProtocol === "WEBRTC"
        ? playback.whepUrl
        : playback.hlsUrl || playback.whepUrl
    const fallbackPlayUrl =
      resolvedProtocol === "WEBRTC"
        ? playback.hlsUrl
        : playback.whepUrl

    await prisma.cameraAccessLog.create({
      data: {
        cameraId: record.cameraId,
        userId: session.user.id,
        accessType: "PLAYBACK",
        startTime: new Date(),
        ipAddress: normalizeIp(request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip")),
        purpose: purpose || "Playback session",
        notes:
          typeof seekTime === "string"
            ? `Playback session restarted from ${seekTime}`
            : `Playback session started for record ${record.id}`,
      },
    })

    return NextResponse.json({
      playbackRecord: {
        id: record.id,
        cameraId: record.cameraId,
        startTime: record.startTime.toISOString(),
        endTime: record.endTime.toISOString(),
        duration: record.duration ?? 0,
        fileSize: record.fileSize ?? 0,
        playbackUri: record.playbackUri,
        recordingType: record.recordingType,
        camera: {
          id: record.camera.id,
          name: record.camera.name,
          area: record.camera.area,
          site: record.camera.site,
        },
      },
      token: tokenData.token,
      expiresAt: tokenData.expiresAt,
      protocol: resolvedProtocol,
      playUrl,
      fallbackPlayUrl,
      streamPath: playback.streamPath,
      gatewayConfigured: true,
      seekTime: typeof seekTime === "string" ? seekTime : null,
    })
  } catch (error) {
    console.error("Error starting playback session:", error)
    return NextResponse.json({ error: "Failed to start playback session" }, { status: 500 })
  }
}

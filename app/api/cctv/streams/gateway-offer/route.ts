import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { StreamType } from "@/lib/cctv-types"
import { generateStreamToken } from "@/lib/cctv-utils"
import {
  isValidStreamType,
  resolvePlaybackUrls,
  VALID_STREAM_TYPES,
} from "@/app/api/cctv/_helpers"

/**
 * POST /api/cctv/streams/gateway-offer
 * Optional WebRTC signaling proxy with automatic HLS fallback metadata.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { cameraId, streamType = "sub", offer } = body

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
      preferredProtocol: "WEBRTC",
    })

    if (!playback.gatewayConfigured || !playback.playUrl) {
      return NextResponse.json({
        protocol: "HLS",
        downgraded: true,
        reason: "Gateway not configured for WebRTC signaling",
        playUrl: playback.fallbackPlayUrl,
        fallbackPlayUrl: playback.fallbackPlayUrl,
        token: tokenData.token,
        expiresAt: tokenData.expiresAt,
      })
    }

    const gatewayBase = process.env.CCTV_GATEWAY_URL?.trim().replace(/\/+$/, "")
    if (!gatewayBase) {
      return NextResponse.json({ error: "Gateway URL not configured" }, { status: 503 })
    }

    if (!offer) {
      return NextResponse.json({
        protocol: "WEBRTC",
        playUrl: playback.playUrl,
        token: tokenData.token,
        expiresAt: tokenData.expiresAt,
        note: "No offer provided. Use playUrl directly if your gateway supports tokenized pull.",
      })
    }

    const gatewayResponse = await fetch(`${gatewayBase}/api/stream/webrtc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cameraId: camera.id,
        streamType,
        offer,
        token: tokenData.token,
      }),
    })

    if (!gatewayResponse.ok) {
      const fallback = resolvePlaybackUrls({
        cameraId: camera.id,
        streamType,
        token: tokenData.token,
        preferredProtocol: "HLS",
      })

      return NextResponse.json({
        protocol: "HLS",
        downgraded: true,
        reason: `Gateway signaling failed (${gatewayResponse.status})`,
        playUrl: fallback.playUrl,
        fallbackPlayUrl: fallback.fallbackPlayUrl,
        token: tokenData.token,
        expiresAt: tokenData.expiresAt,
      })
    }

    const payload = await gatewayResponse.json()
    return NextResponse.json({
      protocol: "WEBRTC",
      playUrl: playback.playUrl,
      token: tokenData.token,
      expiresAt: tokenData.expiresAt,
      gateway: payload,
    })
  } catch (error) {
    console.error("Error negotiating gateway offer:", error)
    return NextResponse.json({ error: "Failed to negotiate gateway offer" }, { status: 500 })
  }
}

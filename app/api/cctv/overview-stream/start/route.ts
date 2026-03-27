import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { StreamProtocol } from "@prisma/client"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  generateOverviewRTSPUrl,
  generateOverviewToken,
} from "@/lib/cctv-utils"
import { resolveOverviewPlaybackUrls } from "@/app/api/cctv/_helpers"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      nvrId,
      preferredProtocol = "WEBRTC",
      expiresInMinutes = 15,
    } = body

    if (!nvrId) {
      return NextResponse.json({ error: "nvrId is required" }, { status: 400 })
    }

    const nvr = await prisma.nVR.findFirst({
      where: {
        id: nvrId,
        isActive: true,
        site: {
          companyId: session.user.companyId,
        },
      },
      include: {
        site: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    })

    if (!nvr) {
      return NextResponse.json({ error: "NVR not found" }, { status: 404 })
    }

    if (!nvr.isOnline) {
      return NextResponse.json({ error: "NVR is offline" }, { status: 503 })
    }

    const tokenData = generateOverviewToken(nvr.id, expiresInMinutes)
    const rtspUrl = generateOverviewRTSPUrl({
      host: nvr.ipAddress,
      port: nvr.rtspPort,
      username: nvr.username,
      password: nvr.password,
    })

    const playback = resolveOverviewPlaybackUrls({
      nvrId: nvr.id,
      token: tokenData.token,
      preferredProtocol: preferredProtocol as StreamProtocol | "WEBRTC" | "HLS",
    })

    return NextResponse.json({
      token: tokenData.token,
      rtspUrl,
      expiresAt: tokenData.expiresAt,
      protocol: playback.protocol,
      playUrl: playback.playUrl,
      fallbackPlayUrl: playback.fallbackPlayUrl,
      snapshotUrl: playback.snapshotUrl,
      gatewayConfigured: playback.gatewayConfigured,
      nvr: {
        id: nvr.id,
        name: nvr.name,
        site: nvr.site,
      },
    })
  } catch (error) {
    console.error("Error starting overview stream:", error)
    return NextResponse.json(
      { error: "Failed to start overview stream" },
      { status: 500 },
    )
  }
}

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generatePlaybackSearchXML, generatePlaybackToken } from "@/lib/cctv-utils"
import { buildPlaybackRelayUrls } from "@/lib/cctv-playback"
import {
  normalizeIp,
  parsePagination,
} from "@/app/api/cctv/_helpers"

type GatewayPlaybackClip = {
  startTime: string
  endTime: string
  duration: number
  fileSize: number
  playbackUri: string
  recordingType: string
}

/**
 * POST /api/cctv/playback/search
 * Search recorded clips on the NVR via the local playback gateway.
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
      startTime,
      endTime,
      recordType = "all",
      purpose,
      page = 1,
      limit = 20,
    } = body

    if (!cameraId || !startTime || !endTime) {
      return NextResponse.json(
        { error: "cameraId, startTime, and endTime are required" },
        { status: 400 },
      )
    }

    const start = new Date(startTime)
    const end = new Date(endTime)

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid datetime format" }, { status: 400 })
    }

    if (start >= end) {
      return NextResponse.json({ error: "startTime must be before endTime" }, { status: 400 })
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

    if (!camera.nvr.isapiEnabled) {
      return NextResponse.json(
        { error: "Playback search requires ISAPI to be enabled on the NVR." },
        { status: 400 },
      )
    }

    const gatewayBase = process.env.CCTV_GATEWAY_URL?.trim().replace(/\/+$/, "")
    if (!gatewayBase) {
      return NextResponse.json(
        { error: "Playback gateway is not configured. Set CCTV_GATEWAY_URL." },
        { status: 503 },
      )
    }

    const gatewayResponse = await fetch(`${gatewayBase}/api/playback/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-gateway-key": process.env.GATEWAY_KEY || "default-key",
      },
      body: JSON.stringify({
        cameraId: camera.id,
        channelNumber: camera.channelNumber,
        startTime,
        endTime,
        recordType,
        nvr: {
          ipAddress: camera.nvr.ipAddress,
          httpPort: camera.nvr.httpPort,
          rtspPort: camera.nvr.rtspPort,
          username: camera.nvr.username,
          password: camera.nvr.password,
        },
      }),
      cache: "no-store",
    })

    if (!gatewayResponse.ok) {
      const details = await gatewayResponse.text()
      return NextResponse.json(
        {
          error: "Gateway playback search failed",
          details: details || `Gateway responded with ${gatewayResponse.status}`,
        },
        { status: 502 },
      )
    }

    const gatewayPayload = (await gatewayResponse.json()) as {
      clips: GatewayPlaybackClip[]
      searchXml?: string
    }

    const paginationParams = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    })
    const { page: parsedPage, limit: parsedLimit, skip } = parsePagination(paginationParams)
    const pagedClips = gatewayPayload.clips.slice(skip, skip + parsedLimit)

    await prisma.cameraAccessLog.create({
      data: {
        cameraId: camera.id,
        userId: session.user.id,
        accessType: "PLAYBACK",
        startTime: new Date(),
        ipAddress: normalizeIp(request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip")),
        purpose: purpose || "Playback search",
        notes: `Playback search from ${start.toISOString()} to ${end.toISOString()}`,
      },
    })

    const clipRecords = await Promise.all(
      pagedClips.map((clip) =>
        prisma.playbackRecord.create({
          data: {
            cameraId: camera.id,
            startTime: new Date(clip.startTime),
            endTime: new Date(clip.endTime),
            fileSize: clip.fileSize || null,
            playbackUri: clip.playbackUri,
            recordingType: clip.recordingType.toUpperCase(),
            duration: clip.duration,
            requestedBy: session.user.email || session.user.id,
            purpose: purpose || "Playback search",
          },
        }),
      ),
    )

    const clipResponse = clipRecords.map((record, index) => {
      const tokenData = generatePlaybackToken(record.id, record.cameraId, 60)
      const playback = buildPlaybackRelayUrls({
        playbackRecordId: record.id,
        cameraId: record.cameraId,
        clipStartTime: record.startTime.toISOString(),
        clipEndTime: record.endTime.toISOString(),
        token: tokenData.token,
        preferredProtocol: "HLS",
      })

      return {
        id: record.id,
        startTime: record.startTime.toISOString(),
        endTime: record.endTime.toISOString(),
        duration: record.duration ?? pagedClips[index]?.duration ?? 0,
        fileSize: record.fileSize ?? pagedClips[index]?.fileSize ?? 0,
        playbackUri: record.playbackUri || pagedClips[index]?.playbackUri || "",
        recordingType: record.recordingType,
        playUrl: playback.playUrl,
        fallbackPlayUrl: playback.fallbackPlayUrl,
        protocol: playback.protocol,
        streamPath: playback.streamPath,
        gatewayConfigured: playback.gatewayConfigured,
        token: tokenData.token,
        expiresAt: tokenData.expiresAt,
      }
    })

    return NextResponse.json({
      clips: clipResponse,
      totalClips: gatewayPayload.clips.length,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: gatewayPayload.clips.length,
        pages: Math.ceil(gatewayPayload.clips.length / parsedLimit),
        hasMore: skip + pagedClips.length < gatewayPayload.clips.length,
      },
      camera: {
        id: camera.id,
        name: camera.name,
        area: camera.area,
        site: camera.site,
      },
      searchParams: {
        startTime,
        endTime,
        recordType,
      },
      isapiSearchXML:
        gatewayPayload.searchXml ||
        generatePlaybackSearchXML(camera.channelNumber, startTime, endTime, recordType),
      note: "Playback results loaded from the local gateway and NVR.",
    })
  } catch (error) {
    console.error("Error searching playback:", error)
    return NextResponse.json({ error: "Failed to search playback" }, { status: 500 })
  }
}

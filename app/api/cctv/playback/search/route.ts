import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generatePlaybackSearchXML } from "@/lib/cctv-utils"
import { normalizeIp, parsePagination } from "@/app/api/cctv/_helpers"

/**
 * POST /api/cctv/playback/search
 * Search for recorded video clips in a time range.
 *
 * This endpoint currently returns generated mock clips with realistic shape.
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

    const searchXML = generatePlaybackSearchXML(camera.channelNumber, startTime, endTime, recordType)
    const allClips = generateMockPlaybackClips(camera, start, end)

    const paginationParams = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    })
    const { page: parsedPage, limit: parsedLimit, skip } = parsePagination(paginationParams)
    const pagedClips = allClips.slice(skip, skip + parsedLimit)

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

    if (allClips.length > 0) {
      await prisma.playbackRecord.create({
        data: {
          cameraId: camera.id,
          startTime: start,
          endTime: end,
          recordingType: String(recordType).toUpperCase(),
          requestedBy: session.user.email || "unknown",
          purpose: purpose || "Playback search",
        },
      })
    }

    return NextResponse.json({
      clips: pagedClips,
      totalClips: allClips.length,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: allClips.length,
        pages: Math.ceil(allClips.length / parsedLimit),
        hasMore: skip + pagedClips.length < allClips.length,
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
      isapiSearchXML: searchXML,
      note: "Mock clip data. Integrate ISAPI ContentMgmt/search for production recording retrieval.",
    })
  } catch (error) {
    console.error("Error searching playback:", error)
    return NextResponse.json({ error: "Failed to search playback" }, { status: 500 })
  }
}

function generateMockPlaybackClips(
  camera: {
    nvr: { ipAddress: string; rtspPort: number }
    channelNumber: number
  },
  start: Date,
  end: Date,
): Array<{
  startTime: string
  endTime: string
  duration: number
  fileSize: number
  playbackUri: string
  recordingType: string
}> {
  const clips: Array<{
    startTime: string
    endTime: string
    duration: number
    fileSize: number
    playbackUri: string
    recordingType: string
  }> = []

  let currentTime = new Date(start)

  while (currentTime < end) {
    const clipEnd = new Date(Math.min(currentTime.getTime() + 3600000, end.getTime()))
    const duration = Math.floor((clipEnd.getTime() - currentTime.getTime()) / 1000)
    const playbackUri = `rtsp://${camera.nvr.ipAddress}:${camera.nvr.rtspPort}/Streaming/channels/${camera.channelNumber}01?starttime=${currentTime.toISOString()}&endtime=${clipEnd.toISOString()}`

    clips.push({
      startTime: currentTime.toISOString(),
      endTime: clipEnd.toISOString(),
      duration,
      fileSize: Math.floor(duration * 0.5),
      playbackUri,
      recordingType: "CONTINUOUS",
    })

    currentTime = clipEnd
  }

  return clips
}

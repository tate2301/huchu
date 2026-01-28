import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generatePlaybackSearchXML } from "@/lib/cctv-utils"

/**
 * POST /api/cctv/playback/search
 * Search for recorded video clips in a time range
 * 
 * Body:
 * - cameraId: Camera ID
 * - startTime: ISO 8601 datetime string
 * - endTime: ISO 8601 datetime string
 * - recordType: "all" | "motion" | "alarm" (optional, default: "all")
 * - purpose: Reason for playback request (optional)
 * 
 * Response:
 * - clips: Array of recording clips with playback URIs
 * - totalClips: Total number of clips found
 * - camera: Camera details
 * 
 * Note: This API returns mock data. In production, this should query
 * the NVR via ISAPI ContentMgmt endpoint to get actual recordings.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { cameraId, startTime, endTime, recordType = "all", purpose } = body

    // Validate required fields
    if (!cameraId || !startTime || !endTime) {
      return NextResponse.json(
        { error: "cameraId, startTime, and endTime are required" },
        { status: 400 }
      )
    }

    // Validate datetime format
    const start = new Date(startTime)
    const end = new Date(endTime)
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        { error: "Invalid datetime format" },
        { status: 400 }
      )
    }

    if (start >= end) {
      return NextResponse.json(
        { error: "startTime must be before endTime" },
        { status: 400 }
      )
    }

    // Fetch camera with NVR details
    const camera = await prisma.camera.findUnique({
      where: { id: cameraId },
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
      return NextResponse.json(
        { error: "Camera not found" },
        { status: 404 }
      )
    }

    // Generate ISAPI search XML (for documentation purposes)
    const searchXML = generatePlaybackSearchXML(
      camera.channelNumber,
      startTime,
      endTime,
      recordType
    )

    // In production, you would:
    // 1. Send HTTP POST to: http://{nvr.ipAddress}:{nvr.httpPort}/ISAPI/ContentMgmt/search
    // 2. Parse the XML response to get playback URIs
    // 3. Store the playback records in the database
    
    // For now, return mock data with proper structure
    const mockClips = generateMockPlaybackClips(camera, start, end)

    // Log playback access
    await prisma.cameraAccessLog.create({
      data: {
        cameraId,
        userId: session.user.id,
        accessType: "PLAYBACK",
        startTime: new Date(),
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
        purpose: purpose || "Playback search",
      },
    })

    // Store playback record
    if (mockClips.length > 0) {
      await prisma.playbackRecord.create({
        data: {
          cameraId,
          startTime: start,
          endTime: end,
          recordingType: recordType.toUpperCase(),
          requestedBy: session.user.email || "unknown",
          purpose: purpose || "Playback search",
        },
      })
    }

    return NextResponse.json({
      clips: mockClips,
      totalClips: mockClips.length,
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
      isapiSearchXML: searchXML, // For reference/documentation
      note: "This is mock data. In production, integrate with ISAPI ContentMgmt/search endpoint",
    })
  } catch (error) {
    console.error("Error searching playback:", error)
    return NextResponse.json(
      { error: "Failed to search playback" },
      { status: 500 }
    )
  }
}

/**
 * Generate mock playback clips for demonstration
 */
function generateMockPlaybackClips(
  camera: any,
  start: Date,
  end: Date
): Array<{
  startTime: string
  endTime: string
  duration: number
  fileSize: number
  playbackUri: string
  recordingType: string
}> {
  const clips = []
  
  // Generate clips in 1-hour segments (typical DVR segment size)
  let currentTime = new Date(start)
  
  while (currentTime < end) {
    const clipEnd = new Date(Math.min(
      currentTime.getTime() + 3600000, // 1 hour
      end.getTime()
    ))
    
    const duration = Math.floor((clipEnd.getTime() - currentTime.getTime()) / 1000)
    
    // Mock playback URI (in production, this comes from ISAPI response)
    const playbackUri = `rtsp://${camera.nvr.ipAddress}:${camera.nvr.rtspPort}/Streaming/channels/${camera.channelNumber}01?starttime=${currentTime.toISOString()}&endtime=${clipEnd.toISOString()}`
    
    clips.push({
      startTime: currentTime.toISOString(),
      endTime: clipEnd.toISOString(),
      duration,
      fileSize: Math.floor(duration * 0.5), // ~0.5 MB per second (estimate)
      playbackUri,
      recordingType: "CONTINUOUS",
    })
    
    currentTime = clipEnd
  }
  
  return clips
}

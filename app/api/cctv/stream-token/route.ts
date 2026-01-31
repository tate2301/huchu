import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateRTSPUrl, generateStreamToken, StreamType } from "@/lib/cctv-utils"

/**
 * POST /api/cctv/stream-token
 * Generate a short-lived token and RTSP URL for streaming
 * 
 * Body:
 * - cameraId: Camera ID
 * - streamType: "main" | "sub" | "third" (optional, default: "sub")
 * - expiresInMinutes: Token expiration time (optional, default: 15)
 * 
 * Response:
 * - token: Short-lived token for conversion server
 * - rtspUrl: RTSP URL for the stream
 * - expiresAt: Token expiration timestamp
 * - camera: Camera details
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { cameraId, streamType = "sub", expiresInMinutes = 15 } = body

    if (!cameraId) {
      return NextResponse.json(
        { error: "cameraId is required" },
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

    // Validate stream type
    const validStreamTypes = ["main", "sub", "third"]
    if (!validStreamTypes.includes(streamType)) {
      return NextResponse.json(
        { error: "Invalid stream type" },
        { status: 400 }
      )
    }

    // Check if NVR is online
    if (!camera.nvr.isOnline) {
      return NextResponse.json(
        { error: "NVR is offline" },
        { status: 503 }
      )
    }

    // Generate RTSP URL
    const rtspUrl = generateRTSPUrl(
      {
        host: camera.nvr.ipAddress,
        port: camera.nvr.rtspPort,
        username: camera.nvr.username,
        password: camera.nvr.password,
      },
      camera.channelNumber,
      streamType as StreamType,
      false // Use standard RTSP format
    )

    // Generate token
    const tokenData = generateStreamToken(
      cameraId,
      streamType as StreamType,
      expiresInMinutes
    )

    // Log camera access
    await prisma.cameraAccessLog.create({
      data: {
        cameraId,
        userId: session.user.id,
        accessType: "LIVE_VIEW",
        startTime: new Date(),
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
      },
    })

    return NextResponse.json({
      token: tokenData.token,
      rtspUrl,
      expiresAt: tokenData.expiresAt,
      camera: {
        id: camera.id,
        name: camera.name,
        area: camera.area,
        channelNumber: camera.channelNumber,
        site: camera.site,
      },
      streamInfo: {
        streamType,
        resolution: streamType === "main" ? "1920x1080" : "704x576",
        recommended: streamType === "sub" ? "Use for grid view" : "Use for fullscreen",
      },
    })
  } catch (error) {
    console.error("Error generating stream token:", error)
    return NextResponse.json(
      { error: "Failed to generate stream token" },
      { status: 500 }
    )
  }
}

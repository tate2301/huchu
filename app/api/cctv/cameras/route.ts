import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/cctv/cameras
 * List all cameras with status and filtering
 * 
 * Query params:
 * - siteId: Filter by site
 * - area: Filter by area (e.g., "Gate", "Gold Room")
 * - isOnline: Filter by online status
 * - nvrId: Filter by NVR
 * - isHighSecurity: Filter high-security cameras
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get("siteId") || undefined
    const area = searchParams.get("area") || undefined
    const isOnline = searchParams.get("isOnline")
    const nvrId = searchParams.get("nvrId") || undefined
    const isHighSecurity = searchParams.get("isHighSecurity")
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = parseInt(searchParams.get("limit") || "50", 10)

    const skip = (page - 1) * limit

    // Build filter
    const where: any = {}
    if (siteId) where.siteId = siteId
    if (area) where.area = area
    if (isOnline !== null && isOnline !== undefined) {
      where.isOnline = isOnline === "true"
    }
    if (nvrId) where.nvrId = nvrId
    if (isHighSecurity !== null && isHighSecurity !== undefined) {
      where.isHighSecurity = isHighSecurity === "true"
    }

    const [cameras, total] = await Promise.all([
      prisma.camera.findMany({
        where,
        include: {
          nvr: {
            select: {
              id: true,
              name: true,
              ipAddress: true,
              isOnline: true,
            },
          },
          site: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        orderBy: [{ area: "asc" }, { name: "asc" }],
        skip,
        take: limit,
      }),
      prisma.camera.count({ where }),
    ])

    return NextResponse.json({
      data: cameras,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + cameras.length < total,
      },
    })
  } catch (error) {
    console.error("Error fetching cameras:", error)
    return NextResponse.json(
      { error: "Failed to fetch cameras" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/cctv/cameras
 * Create a new camera
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is SUPERADMIN or MANAGER
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { role: true },
    })

    if (!user || (user.role !== "SUPERADMIN" && user.role !== "MANAGER")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const {
      name,
      channelNumber,
      nvrId,
      siteId,
      area,
      description,
      hasPTZ,
      hasAudio,
      hasMotionDetect,
      hasLineDetect,
      isHighSecurity,
    } = body

    // Validate required fields
    if (!name || !channelNumber || !nvrId || !siteId || !area) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Check for duplicate channel on same NVR
    const existing = await prisma.camera.findUnique({
      where: {
        nvrId_channelNumber: {
          nvrId,
          channelNumber,
        },
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: "Camera with this channel number already exists on this NVR" },
        { status: 409 }
      )
    }

    const camera = await prisma.camera.create({
      data: {
        name,
        channelNumber,
        nvrId,
        siteId,
        area,
        description,
        hasPTZ: hasPTZ || false,
        hasAudio: hasAudio || false,
        hasMotionDetect: hasMotionDetect !== false, // Default true
        hasLineDetect: hasLineDetect || false,
        isHighSecurity: isHighSecurity || false,
      },
      include: {
        nvr: {
          select: {
            name: true,
            ipAddress: true,
          },
        },
        site: {
          select: {
            name: true,
            code: true,
          },
        },
      },
    })

    return NextResponse.json(camera, { status: 201 })
  } catch (error) {
    console.error("Error creating camera:", error)
    return NextResponse.json(
      { error: "Failed to create camera" },
      { status: 500 }
    )
  }
}

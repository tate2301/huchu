import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { validateNVRConfig } from "@/lib/cctv-utils"

/**
 * GET /api/cctv/nvrs
 * List all NVRs with status
 * 
 * Query params:
 * - siteId: Filter by site
 * - isOnline: Filter by online status
 * - page: Page number
 * - limit: Items per page
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get("siteId") || undefined
    const isOnline = searchParams.get("isOnline")
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = parseInt(searchParams.get("limit") || "20", 10)

    const skip = (page - 1) * limit

    // Build filter
    const where: any = {}
    if (siteId) where.siteId = siteId
    if (isOnline !== null && isOnline !== undefined) {
      where.isOnline = isOnline === "true"
    }

    const [nvrs, total] = await Promise.all([
      prisma.nVR.findMany({
        where,
        include: {
          site: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          _count: {
            select: {
              cameras: true,
            },
          },
        },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      prisma.nVR.count({ where }),
    ])

    // Hide passwords in response
    const sanitizedNVRs = nvrs.map((nvr) => ({
      ...nvr,
      password: "***",
    }))

    return NextResponse.json({
      data: sanitizedNVRs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + nvrs.length < total,
      },
    })
  } catch (error) {
    console.error("Error fetching NVRs:", error)
    return NextResponse.json(
      { error: "Failed to fetch NVRs" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/cctv/nvrs
 * Create a new NVR
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
      ipAddress,
      port = 554,
      httpPort = 80,
      username,
      password,
      siteId,
      manufacturer = "Hikvision",
      model,
      firmware,
      rtspPort = 554,
      isapiEnabled = true,
      onvifEnabled = false,
    } = body

    // Validate required fields
    if (!name || !ipAddress || !username || !password || !siteId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Validate NVR configuration
    const validation = validateNVRConfig({
      host: ipAddress,
      port: rtspPort,
      username,
      password,
    })

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    // Check for duplicate IP address
    const existing = await prisma.nVR.findFirst({
      where: {
        ipAddress,
        siteId,
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: "NVR with this IP address already exists for this site" },
        { status: 409 }
      )
    }

    const nvr = await prisma.nVR.create({
      data: {
        name,
        ipAddress,
        port,
        httpPort,
        username,
        password, // In production, encrypt this!
        siteId,
        manufacturer,
        model: model || null,
        firmware: firmware || null,
        rtspPort,
        isapiEnabled,
        onvifEnabled,
      },
      include: {
        site: {
          select: {
            name: true,
            code: true,
          },
        },
      },
    })

    // Hide password in response
    return NextResponse.json(
      {
        ...nvr,
        password: "***",
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Error creating NVR:", error)
    return NextResponse.json(
      { error: "Failed to create NVR" },
      { status: 500 }
    )
  }
}

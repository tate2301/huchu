import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { Prisma } from "@prisma/client"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { validateNVRConfig } from "@/lib/cctv-utils"
import { isManagerRole, parsePagination, sanitizeNVRPassword } from "@/app/api/cctv/_helpers"

/**
 * GET /api/cctv/nvrs
 * List NVRs with filtering
 *
 * Query params:
 * - siteId: Filter by site
 * - isOnline: Filter by online status
 * - includeInactive: Include deactivated records
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
    const includeInactive = searchParams.get("includeInactive") === "true"
    const { page, limit, skip } = parsePagination(searchParams, { page: 1, limit: 20 })

    const where: Prisma.NVRWhereInput = {
      site: {
        companyId: session.user.companyId,
      },
      ...(siteId ? { siteId } : {}),
      ...(isOnline !== null && isOnline !== undefined ? { isOnline: isOnline === "true" } : {}),
      ...(includeInactive ? {} : { isActive: true }),
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
        orderBy: [{ name: "asc" }],
        skip,
        take: limit,
      }),
      prisma.nVR.count({ where }),
    ])

    return NextResponse.json({
      data: nvrs.map((nvr) => sanitizeNVRPassword(nvr)),
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
    return NextResponse.json({ error: "Failed to fetch NVRs" }, { status: 500 })
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

    if (!isManagerRole(session.user.role)) {
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
      isOnline = false,
    } = body

    if (!name || !ipAddress || !username || !password || !siteId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        companyId: session.user.companyId,
      },
      select: { id: true },
    })

    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 })
    }

    const validation = validateNVRConfig({
      host: ipAddress,
      port: rtspPort,
      username,
      password,
    })

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const existing = await prisma.nVR.findFirst({
      where: {
        ipAddress,
        siteId,
        isActive: true,
      },
      select: { id: true },
    })

    if (existing) {
      return NextResponse.json(
        { error: "NVR with this IP address already exists for this site" },
        { status: 409 },
      )
    }

    const nvr = await prisma.nVR.create({
      data: {
        name,
        ipAddress,
        port,
        httpPort,
        username,
        password,
        siteId,
        manufacturer,
        model: model || null,
        firmware: firmware || null,
        rtspPort,
        isapiEnabled,
        onvifEnabled,
        isOnline,
      },
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
    })

    return NextResponse.json(sanitizeNVRPassword(nvr), { status: 201 })
  } catch (error) {
    console.error("Error creating NVR:", error)
    return NextResponse.json({ error: "Failed to create NVR" }, { status: 500 })
  }
}

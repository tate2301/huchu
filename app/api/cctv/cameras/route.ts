import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { Prisma } from "@prisma/client"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isManagerRole, parsePagination } from "@/app/api/cctv/_helpers"

/**
 * GET /api/cctv/cameras
 * List cameras with status and filtering
 *
 * Query params:
 * - siteId: Filter by site
 * - area: Filter by area (e.g., "Gate", "Gold Room")
 * - isOnline: Filter by online status
 * - nvrId: Filter by NVR
 * - isHighSecurity: Filter high-security cameras
 * - includeInactive: Include deactivated records
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
    const includeInactive = searchParams.get("includeInactive") === "true"
    const { page, limit, skip } = parsePagination(searchParams, { page: 1, limit: 50 })

    const where: Prisma.CameraWhereInput = {
      site: {
        companyId: session.user.companyId,
      },
      ...(siteId ? { siteId } : {}),
      ...(area ? { area } : {}),
      ...(isOnline !== null && isOnline !== undefined ? { isOnline: isOnline === "true" } : {}),
      ...(nvrId ? { nvrId } : {}),
      ...(isHighSecurity !== null && isHighSecurity !== undefined
        ? { isHighSecurity: isHighSecurity === "true" }
        : {}),
      ...(includeInactive ? {} : { isActive: true }),
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
              isActive: true,
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
    return NextResponse.json({ error: "Failed to fetch cameras" }, { status: 500 })
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

    if (!isManagerRole(session.user.role)) {
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
      isOnline = false,
      isRecording = true,
    } = body

    if (!name || !channelNumber || !nvrId || !siteId || !area) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const [site, nvr] = await Promise.all([
      prisma.site.findFirst({
        where: {
          id: siteId,
          companyId: session.user.companyId,
        },
        select: { id: true },
      }),
      prisma.nVR.findFirst({
        where: {
          id: nvrId,
          site: {
            companyId: session.user.companyId,
          },
          isActive: true,
        },
        select: { id: true, siteId: true },
      }),
    ])

    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 })
    }

    if (!nvr) {
      return NextResponse.json({ error: "NVR not found" }, { status: 404 })
    }

    if (nvr.siteId !== siteId) {
      return NextResponse.json(
        { error: "Camera site must match the selected NVR site" },
        { status: 400 },
      )
    }

    const existing = await prisma.camera.findUnique({
      where: {
        nvrId_channelNumber: {
          nvrId,
          channelNumber,
        },
      },
      select: { id: true, isActive: true },
    })

    if (existing && existing.isActive) {
      return NextResponse.json(
        { error: "Camera with this channel number already exists on this NVR" },
        { status: 409 },
      )
    }

    const camera = existing
      ? await prisma.camera.update({
          where: { id: existing.id },
          data: {
            name,
            channelNumber,
            nvrId,
            siteId,
            area,
            description: description || null,
            hasPTZ: Boolean(hasPTZ),
            hasAudio: Boolean(hasAudio),
            hasMotionDetect: hasMotionDetect !== false,
            hasLineDetect: Boolean(hasLineDetect),
            isHighSecurity: Boolean(isHighSecurity),
            isOnline: Boolean(isOnline),
            isRecording: Boolean(isRecording),
            isActive: true,
          },
          include: {
            nvr: {
              select: {
                id: true,
                name: true,
                ipAddress: true,
                isOnline: true,
                isActive: true,
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
        })
      : await prisma.camera.create({
          data: {
            name,
            channelNumber,
            nvrId,
            siteId,
            area,
            description: description || null,
            hasPTZ: Boolean(hasPTZ),
            hasAudio: Boolean(hasAudio),
            hasMotionDetect: hasMotionDetect !== false,
            hasLineDetect: Boolean(hasLineDetect),
            isHighSecurity: Boolean(isHighSecurity),
            isOnline: Boolean(isOnline),
            isRecording: Boolean(isRecording),
          },
          include: {
            nvr: {
              select: {
                id: true,
                name: true,
                ipAddress: true,
                isOnline: true,
                isActive: true,
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
        })

    return NextResponse.json(camera, { status: 201 })
  } catch (error) {
    console.error("Error creating camera:", error)
    return NextResponse.json({ error: "Failed to create camera" }, { status: 500 })
  }
}

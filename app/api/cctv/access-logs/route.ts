import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { Prisma } from "@prisma/client"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parsePagination } from "@/app/api/cctv/_helpers"

/**
 * GET /api/cctv/access-logs
 * List live and playback access logs with tenant scoping.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get("siteId") || undefined
    const cameraId = searchParams.get("cameraId") || undefined
    const accessType = searchParams.get("accessType") || undefined
    const userId = searchParams.get("userId") || undefined
    const startDate = searchParams.get("startDate") || undefined
    const endDate = searchParams.get("endDate") || undefined
    const { page, limit, skip } = parsePagination(searchParams, { page: 1, limit: 50 })

    const where: Prisma.CameraAccessLogWhereInput = {
      camera: {
        site: {
          companyId: session.user.companyId,
        },
      },
      ...(siteId
        ? {
            camera: {
              siteId,
              site: {
                companyId: session.user.companyId,
              },
            },
          }
        : {}),
      ...(cameraId ? { cameraId } : {}),
      ...(accessType ? { accessType } : {}),
      ...(userId ? { userId } : {}),
    }

    if (startDate || endDate) {
      where.startTime = {}
      if (startDate) {
        where.startTime.gte = new Date(startDate)
      }
      if (endDate) {
        where.startTime.lte = new Date(endDate)
      }
    }

    const [logs, total] = await Promise.all([
      prisma.cameraAccessLog.findMany({
        where,
        include: {
          camera: {
            select: {
              id: true,
              name: true,
              area: true,
              site: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
        orderBy: { startTime: "desc" },
        skip,
        take: limit,
      }),
      prisma.cameraAccessLog.count({ where }),
    ])

    const userIds = Array.from(
      new Set(logs.map((log) => log.userId).filter((id): id is string => Boolean(id))),
    )

    const users = userIds.length
      ? await prisma.user.findMany({
          where: {
            id: { in: userIds },
            companyId: session.user.companyId,
          },
          select: {
            id: true,
            name: true,
            email: true,
          },
        })
      : []

    const userMap = new Map(users.map((user) => [user.id, user]))

    return NextResponse.json({
      data: logs.map((log) => ({
        ...log,
        user: log.userId ? userMap.get(log.userId) || null : null,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + logs.length < total,
      },
    })
  } catch (error) {
    console.error("Error fetching CCTV access logs:", error)
    return NextResponse.json({ error: "Failed to fetch access logs" }, { status: 500 })
  }
}

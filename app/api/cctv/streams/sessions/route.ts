import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { Prisma, StreamSessionStatus } from "@prisma/client"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parsePagination } from "@/app/api/cctv/_helpers"

/**
 * GET /api/cctv/streams/sessions
 * List stream sessions for the authenticated tenant.
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
    const status = searchParams.get("status") || undefined
    const { page, limit, skip } = parsePagination(searchParams, { page: 1, limit: 50 })

    const where: Prisma.StreamSessionWhereInput = {
      camera: {
        site: {
          companyId: session.user.companyId,
        },
      },
      ...(siteId ? { siteId } : {}),
      ...(cameraId ? { cameraId } : {}),
      ...(status ? { status: status as StreamSessionStatus } : {}),
    }

    const [sessions, total] = await Promise.all([
      prisma.streamSession.findMany({
        where,
        include: {
          camera: {
            select: {
              id: true,
              name: true,
              area: true,
              isOnline: true,
              nvr: {
                select: {
                  id: true,
                  name: true,
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
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { startedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.streamSession.count({ where }),
    ])

    return NextResponse.json({
      data: sessions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + sessions.length < total,
      },
    })
  } catch (error) {
    console.error("Error fetching stream sessions:", error)
    return NextResponse.json({ error: "Failed to fetch stream sessions" }, { status: 500 })
  }
}

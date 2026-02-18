import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { CCTVEventType, EventSeverity, Prisma } from "@prisma/client"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parsePagination } from "@/app/api/cctv/_helpers"

/**
 * GET /api/cctv/events
 * List CCTV events (motion, alarms, etc.)
 *
 * Query params:
 * - siteId: Filter by site
 * - cameraId: Filter by camera
 * - eventType: Filter by event type
 * - severity: Filter by severity
 * - isAcknowledged: Filter by acknowledgment status
 * - startDate: Filter events from this date
 * - endDate: Filter events to this date
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
    const cameraId = searchParams.get("cameraId") || undefined
    const eventType = searchParams.get("eventType") || undefined
    const severity = searchParams.get("severity") || undefined
    const isAcknowledged = searchParams.get("isAcknowledged")
    const startDate = searchParams.get("startDate") || undefined
    const endDate = searchParams.get("endDate") || undefined
    const search = searchParams.get("search")?.trim()
    const { page, limit, skip } = parsePagination(searchParams, { page: 1, limit: 50 })

    const tenantWhere: Prisma.CCTVEventWhereInput = {
      OR: [
        {
          camera: {
            site: {
              companyId: session.user.companyId,
            },
          },
        },
        {
          nvr: {
            site: {
              companyId: session.user.companyId,
            },
          },
        },
      ],
    }

    const filterWhere: Prisma.CCTVEventWhereInput = {
      ...(cameraId ? { cameraId } : {}),
      ...(eventType ? { eventType: eventType as CCTVEventType } : {}),
      ...(severity ? { severity: severity as EventSeverity } : {}),
      ...(isAcknowledged !== null && isAcknowledged !== undefined
        ? { isAcknowledged: isAcknowledged === "true" }
        : {}),
    }

    const andFilters: Prisma.CCTVEventWhereInput[] = []
    if (siteId) {
      andFilters.push({
        OR: [
          {
            camera: {
              siteId,
            },
          },
          {
            nvr: {
              siteId,
            },
          },
        ],
      })
    }

    if (search) {
      andFilters.push({
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { camera: { name: { contains: search, mode: "insensitive" } } },
          { camera: { area: { contains: search, mode: "insensitive" } } },
          { camera: { site: { name: { contains: search, mode: "insensitive" } } } },
          { camera: { site: { code: { contains: search, mode: "insensitive" } } } },
          { nvr: { name: { contains: search, mode: "insensitive" } } },
        ],
      })
    }

    if (startDate || endDate) {
      filterWhere.eventTime = {}
      if (startDate) {
        filterWhere.eventTime.gte = new Date(startDate)
      }
      if (endDate) {
        filterWhere.eventTime.lte = new Date(endDate)
      }
    }
    if (andFilters.length > 0) {
      filterWhere.AND = andFilters
    }

    const where: Prisma.CCTVEventWhereInput = {
      AND: [tenantWhere, filterWhere],
    }

    const [events, total] = await Promise.all([
      prisma.cCTVEvent.findMany({
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
          nvr: {
            select: {
              id: true,
              name: true,
              siteId: true,
            },
          },
        },
        orderBy: { eventTime: "desc" },
        skip,
        take: limit,
      }),
      prisma.cCTVEvent.count({ where }),
    ])

    return NextResponse.json({
      data: events,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + events.length < total,
      },
    })
  } catch (error) {
    console.error("Error fetching CCTV events:", error)
    return NextResponse.json({ error: "Failed to fetch CCTV events" }, { status: 500 })
  }
}

/**
 * POST /api/cctv/events
 * Create a new CCTV event
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
      nvrId,
      eventType,
      severity = "MEDIUM",
      title,
      description,
      snapshotUrl,
      eventTime,
    } = body

    if (!eventType || !title) {
      return NextResponse.json({ error: "eventType and title are required" }, { status: 400 })
    }

    if (!cameraId && !nvrId) {
      return NextResponse.json({ error: "Either cameraId or nvrId is required" }, { status: 400 })
    }

    if (cameraId) {
      const camera = await prisma.camera.findFirst({
        where: {
          id: cameraId,
          site: {
            companyId: session.user.companyId,
          },
          isActive: true,
        },
        select: { id: true, nvrId: true },
      })
      if (!camera) {
        return NextResponse.json({ error: "Camera not found" }, { status: 404 })
      }
    }

    if (nvrId) {
      const nvr = await prisma.nVR.findFirst({
        where: {
          id: nvrId,
          site: {
            companyId: session.user.companyId,
          },
          isActive: true,
        },
        select: { id: true },
      })
      if (!nvr) {
        return NextResponse.json({ error: "NVR not found" }, { status: 404 })
      }
    }

    const event = await prisma.cCTVEvent.create({
      data: {
        cameraId: cameraId || null,
        nvrId: nvrId || null,
        eventType,
        severity,
        title,
        description: description || null,
        snapshotUrl: snapshotUrl || null,
        eventTime: eventTime ? new Date(eventTime) : new Date(),
      },
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
        nvr: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    console.error("Error creating CCTV event:", error)
    return NextResponse.json({ error: "Failed to create CCTV event" }, { status: 500 })
  }
}

/**
 * PATCH /api/cctv/events
 * Update event state
 *
 * Body:
 * - eventId: Event ID
 * - action: "acknowledge" | "escalate" (default "acknowledge")
 * - notes: Optional notes
 * - linkedIncidentId: Optional incident link for escalate action
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { eventId, action = "acknowledge", notes, linkedIncidentId } = body

    if (!eventId) {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 })
    }

    const existing = await prisma.cCTVEvent.findFirst({
      where: {
        id: eventId,
        OR: [
          {
            camera: {
              site: {
                companyId: session.user.companyId,
              },
            },
          },
          {
            nvr: {
              site: {
                companyId: session.user.companyId,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        severity: true,
        notes: true,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 })
    }

    const updateData: Prisma.CCTVEventUpdateInput = {}

    if (action === "escalate") {
      const escalatedSeverity =
        existing.severity === EventSeverity.CRITICAL ? EventSeverity.CRITICAL : EventSeverity.HIGH

      updateData.severity = escalatedSeverity
      updateData.linkedIncidentId = linkedIncidentId || undefined
      updateData.notes = [existing.notes, notes ? `Escalated: ${notes}` : "Escalated by operator"]
        .filter(Boolean)
        .join("\n")
    } else {
      updateData.isAcknowledged = true
      updateData.acknowledgedBy = session.user.email
      updateData.acknowledgedAt = new Date()
      updateData.notes = notes || null
    }

    const event = await prisma.cCTVEvent.update({
      where: { id: existing.id },
      data: updateData,
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
    })

    return NextResponse.json(event)
  } catch (error) {
    console.error("Error updating CCTV event:", error)
    return NextResponse.json({ error: "Failed to update CCTV event" }, { status: 500 })
  }
}

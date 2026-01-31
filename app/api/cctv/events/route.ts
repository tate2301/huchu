import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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
    const cameraId = searchParams.get("cameraId") || undefined
    const eventType = searchParams.get("eventType") || undefined
    const severity = searchParams.get("severity") || undefined
    const isAcknowledged = searchParams.get("isAcknowledged")
    const startDate = searchParams.get("startDate") || undefined
    const endDate = searchParams.get("endDate") || undefined
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = parseInt(searchParams.get("limit") || "50", 10)

    const skip = (page - 1) * limit

    // Build filter
    const where: any = {}
    if (cameraId) where.cameraId = cameraId
    if (eventType) where.eventType = eventType
    if (severity) where.severity = severity
    if (isAcknowledged !== null && isAcknowledged !== undefined) {
      where.isAcknowledged = isAcknowledged === "true"
    }
    if (startDate || endDate) {
      where.eventTime = {}
      if (startDate) where.eventTime.gte = new Date(startDate)
      if (endDate) where.eventTime.lte = new Date(endDate)
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
    return NextResponse.json(
      { error: "Failed to fetch CCTV events" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/cctv/events
 * Create a new CCTV event (webhook endpoint for NVR)
 * 
 * This endpoint can be called by the NVR or conversion server
 * when an event is detected (motion, alarm, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    // For webhook, you might want different auth (API key, etc.)
    // For now, using session auth
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

    // Validate required fields
    if (!eventType || !title) {
      return NextResponse.json(
        { error: "eventType and title are required" },
        { status: 400 }
      )
    }

    if (!cameraId && !nvrId) {
      return NextResponse.json(
        { error: "Either cameraId or nvrId is required" },
        { status: 400 }
      )
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
            name: true,
            area: true,
          },
        },
        nvr: {
          select: {
            name: true,
          },
        },
      },
    })

    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    console.error("Error creating CCTV event:", error)
    return NextResponse.json(
      { error: "Failed to create CCTV event" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/cctv/events
 * Acknowledge an event
 * 
 * Body:
 * - eventId: Event ID
 * - notes: Acknowledgment notes (optional)
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { eventId, notes } = body

    if (!eventId) {
      return NextResponse.json(
        { error: "eventId is required" },
        { status: 400 }
      )
    }

    const event = await prisma.cCTVEvent.update({
      where: { id: eventId },
      data: {
        isAcknowledged: true,
        acknowledgedBy: session.user.email,
        acknowledgedAt: new Date(),
        notes: notes || null,
      },
      include: {
        camera: {
          select: {
            name: true,
            area: true,
          },
        },
      },
    })

    return NextResponse.json(event)
  } catch (error) {
    console.error("Error acknowledging event:", error)
    return NextResponse.json(
      { error: "Failed to acknowledge event" },
      { status: 500 }
    )
  }
}

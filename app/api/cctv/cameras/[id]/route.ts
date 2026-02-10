import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isManagerRole } from "@/app/api/cctv/_helpers"

type Params = {
  params: Promise<{ id: string }>
}

async function getCameraForCompany(id: string, companyId: string) {
  const camera = await prisma.camera.findFirst({
    where: {
      id,
      site: {
        companyId,
      },
    },
    include: {
      nvr: {
        select: {
          id: true,
          name: true,
          ipAddress: true,
          isOnline: true,
          isActive: true,
          siteId: true,
        },
      },
      site: {
        select: {
          id: true,
          name: true,
          code: true,
          companyId: true,
        },
      },
    },
  })

  if (!camera || camera.site.companyId !== companyId) {
    return null
  }

  return camera
}

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const camera = await getCameraForCompany(id, session.user.companyId)
    if (!camera) {
      return NextResponse.json({ error: "Camera not found" }, { status: 404 })
    }

    return NextResponse.json(camera)
  } catch (error) {
    console.error("Error fetching camera:", error)
    return NextResponse.json({ error: "Failed to fetch camera" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!isManagerRole(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await params
    const existing = await getCameraForCompany(id, session.user.companyId)
    if (!existing) {
      return NextResponse.json({ error: "Camera not found" }, { status: 404 })
    }

    const body = await request.json()

    const nextSiteId = body.siteId ?? existing.siteId
    const nextNvrId = body.nvrId ?? existing.nvrId
    const nextChannelNumber = body.channelNumber ?? existing.channelNumber

    if (body.siteId && body.siteId !== existing.siteId) {
      const site = await prisma.site.findFirst({
        where: {
          id: body.siteId,
          companyId: session.user.companyId,
        },
        select: { id: true },
      })
      if (!site) {
        return NextResponse.json({ error: "Site not found" }, { status: 404 })
      }
    }

    if (body.nvrId && body.nvrId !== existing.nvrId) {
      const nvr = await prisma.nVR.findFirst({
        where: {
          id: body.nvrId,
          site: {
            companyId: session.user.companyId,
          },
          isActive: true,
        },
        select: { id: true, siteId: true },
      })
      if (!nvr) {
        return NextResponse.json({ error: "NVR not found" }, { status: 404 })
      }
      if (nvr.siteId !== nextSiteId) {
        return NextResponse.json(
          { error: "Camera site must match the selected NVR site" },
          { status: 400 },
        )
      }
    }

    const duplicate = await prisma.camera.findFirst({
      where: {
        id: { not: existing.id },
        nvrId: nextNvrId,
        channelNumber: nextChannelNumber,
        isActive: true,
      },
      select: { id: true },
    })

    if (duplicate) {
      return NextResponse.json(
        { error: "Another active camera already uses this NVR channel" },
        { status: 409 },
      )
    }

    const camera = await prisma.camera.update({
      where: { id: existing.id },
      data: {
        name: body.name ?? existing.name,
        channelNumber: nextChannelNumber,
        nvrId: nextNvrId,
        siteId: nextSiteId,
        area: body.area ?? existing.area,
        description: body.description ?? existing.description,
        hasPTZ: body.hasPTZ ?? existing.hasPTZ,
        hasAudio: body.hasAudio ?? existing.hasAudio,
        hasMotionDetect: body.hasMotionDetect ?? existing.hasMotionDetect,
        hasLineDetect: body.hasLineDetect ?? existing.hasLineDetect,
        isOnline: body.isOnline ?? existing.isOnline,
        isRecording: body.isRecording ?? existing.isRecording,
        isHighSecurity: body.isHighSecurity ?? existing.isHighSecurity,
        isActive: body.isActive ?? existing.isActive,
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

    return NextResponse.json(camera)
  } catch (error) {
    console.error("Error updating camera:", error)
    return NextResponse.json({ error: "Failed to update camera" }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!isManagerRole(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await params
    const existing = await getCameraForCompany(id, session.user.companyId)
    if (!existing) {
      return NextResponse.json({ error: "Camera not found" }, { status: 404 })
    }

    const camera = await prisma.camera.update({
      where: { id: existing.id },
      data: {
        isActive: false,
        isOnline: false,
        isRecording: false,
      },
      include: {
        nvr: {
          select: {
            id: true,
            name: true,
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

    return NextResponse.json({
      message: "Camera deactivated",
      data: camera,
    })
  } catch (error) {
    console.error("Error deactivating camera:", error)
    return NextResponse.json({ error: "Failed to deactivate camera" }, { status: 500 })
  }
}

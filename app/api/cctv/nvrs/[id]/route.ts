import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { validateNVRConfig } from "@/lib/cctv-utils"
import { isManagerRole, sanitizeNVRPassword } from "@/app/api/cctv/_helpers"

type Params = {
  params: Promise<{ id: string }>
}

async function getNVRForCompany(id: string, companyId: string) {
  const nvr = await prisma.nVR.findFirst({
    where: {
      id,
      site: {
        companyId,
      },
    },
    include: {
      site: {
        select: {
          id: true,
          name: true,
          code: true,
          companyId: true,
        },
      },
      _count: {
        select: {
          cameras: true,
        },
      },
    },
  })

  if (!nvr || nvr.site.companyId !== companyId) {
    return null
  }

  return nvr
}

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const nvr = await getNVRForCompany(id, session.user.companyId)
    if (!nvr) {
      return NextResponse.json({ error: "NVR not found" }, { status: 404 })
    }

    return NextResponse.json(sanitizeNVRPassword(nvr))
  } catch (error) {
    console.error("Error fetching NVR:", error)
    return NextResponse.json({ error: "Failed to fetch NVR" }, { status: 500 })
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
    const existing = await getNVRForCompany(id, session.user.companyId)
    if (!existing) {
      return NextResponse.json({ error: "NVR not found" }, { status: 404 })
    }

    const body = await request.json()

    const nextSiteId = body.siteId ?? existing.siteId
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

    const nextConfig = {
      host: body.ipAddress ?? existing.ipAddress,
      port: body.rtspPort ?? existing.rtspPort,
      username: body.username ?? existing.username,
      password: body.password || existing.password,
    }

    const validation = validateNVRConfig(nextConfig)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const nextIpAddress = body.ipAddress ?? existing.ipAddress
    const duplicate = await prisma.nVR.findFirst({
      where: {
        id: { not: existing.id },
        siteId: nextSiteId,
        ipAddress: nextIpAddress,
        isActive: true,
      },
      select: { id: true },
    })

    if (duplicate) {
      return NextResponse.json(
        { error: "Another active NVR already uses this IP address on the selected site" },
        { status: 409 },
      )
    }

    const nvr = await prisma.nVR.update({
      where: { id: existing.id },
      data: {
        name: body.name ?? existing.name,
        ipAddress: nextIpAddress,
        port: body.port ?? existing.port,
        httpPort: body.httpPort ?? existing.httpPort,
        username: body.username ?? existing.username,
        password: body.password || existing.password,
        siteId: nextSiteId,
        manufacturer: body.manufacturer ?? existing.manufacturer,
        model: body.model ?? existing.model,
        firmware: body.firmware ?? existing.firmware,
        rtspPort: body.rtspPort ?? existing.rtspPort,
        isapiEnabled: body.isapiEnabled ?? existing.isapiEnabled,
        onvifEnabled: body.onvifEnabled ?? existing.onvifEnabled,
        isOnline: body.isOnline ?? existing.isOnline,
        isActive: body.isActive ?? existing.isActive,
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

    return NextResponse.json(sanitizeNVRPassword(nvr))
  } catch (error) {
    console.error("Error updating NVR:", error)
    return NextResponse.json({ error: "Failed to update NVR" }, { status: 500 })
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
    const existing = await getNVRForCompany(id, session.user.companyId)
    if (!existing) {
      return NextResponse.json({ error: "NVR not found" }, { status: 404 })
    }

    const activeCameraCount = await prisma.camera.count({
      where: {
        nvrId: existing.id,
        isActive: true,
      },
    })

    if (activeCameraCount > 0) {
      return NextResponse.json(
        { error: "Deactivate cameras linked to this NVR before deactivating the NVR" },
        { status: 409 },
      )
    }

    const nvr = await prisma.nVR.update({
      where: { id: existing.id },
      data: {
        isActive: false,
        isOnline: false,
      },
      include: {
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
      message: "NVR deactivated",
      data: sanitizeNVRPassword(nvr),
    })
  } catch (error) {
    console.error("Error deactivating NVR:", error)
    return NextResponse.json({ error: "Failed to deactivate NVR" }, { status: 500 })
  }
}

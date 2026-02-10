import { StreamProtocol } from "@prisma/client"

export const VALID_STREAM_TYPES = ["main", "sub", "third"] as const

export type CCTVStreamType = (typeof VALID_STREAM_TYPES)[number]

export function isManagerRole(role: string | undefined) {
  return role === "SUPERADMIN" || role === "MANAGER"
}

export function isValidStreamType(value: string): value is CCTVStreamType {
  return VALID_STREAM_TYPES.includes(value as CCTVStreamType)
}

export function sanitizeNVRPassword<T extends { password?: string }>(nvr: T) {
  return {
    ...nvr,
    ...(Object.prototype.hasOwnProperty.call(nvr, "password") ? { password: "***" } : {}),
  }
}

export function parsePagination(searchParams: URLSearchParams, defaults?: { page?: number; limit?: number }) {
  const page = Math.max(1, parseInt(searchParams.get("page") || String(defaults?.page ?? 1), 10))
  const limit = Math.max(1, parseInt(searchParams.get("limit") || String(defaults?.limit ?? 20), 10))
  const skip = (page - 1) * limit
  return { page, limit, skip }
}

export function normalizeIp(ip: string | null) {
  return ip || "unknown"
}

type PlayUrlInput = {
  cameraId: string
  streamType: CCTVStreamType
  token: string
  preferredProtocol?: StreamProtocol | "WEBRTC" | "HLS"
}

export function resolvePlaybackUrls({
  cameraId,
  streamType,
  token,
  preferredProtocol = "WEBRTC",
}: PlayUrlInput): {
  protocol: StreamProtocol
  playUrl: string | null
  fallbackPlayUrl: string | null
  gatewayConfigured: boolean
} {
  const gatewayBase = process.env.CCTV_GATEWAY_URL?.trim().replace(/\/+$/, "")
  const hlsBase =
    process.env.CCTV_HLS_BASE_URL?.trim().replace(/\/+$/, "") ||
    (gatewayBase ? `${gatewayBase}/hls` : null)
  const gatewayConfigured = Boolean(gatewayBase)
  const hlsUrl = hlsBase ? `${hlsBase}/${cameraId}/${streamType}/index.m3u8?token=${encodeURIComponent(token)}` : null
  const webrtcUrl = gatewayBase ? `${gatewayBase}/webrtc?token=${encodeURIComponent(token)}` : null

  if (preferredProtocol === "WEBRTC" && webrtcUrl) {
    return {
      protocol: StreamProtocol.WEBRTC,
      playUrl: webrtcUrl,
      fallbackPlayUrl: hlsUrl,
      gatewayConfigured,
    }
  }

  if (hlsUrl) {
    return {
      protocol: StreamProtocol.HLS,
      playUrl: hlsUrl,
      fallbackPlayUrl: webrtcUrl,
      gatewayConfigured,
    }
  }

  return {
    protocol: StreamProtocol.WEBRTC,
    playUrl: webrtcUrl,
    fallbackPlayUrl: null,
    gatewayConfigured,
  }
}

export function calculateDurationSeconds(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000))
}

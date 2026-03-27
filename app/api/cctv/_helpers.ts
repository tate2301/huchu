import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { StreamProtocol } from "@prisma/client"
import { enforceFeatureForCompany } from "@/lib/platform/feature-gate";

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

type PlaybackClipUrlInput = {
  playbackRecordId: string
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
  snapshotUrl: string | null
  gatewayConfigured: boolean
} {
  const gatewayUrl = process.env.CCTV_GATEWAY_URL?.trim().replace(/\/+$/, "") ?? null
  const webrtcBase = process.env.CCTV_WEBRTC_URL?.trim().replace(/\/+$/, "") ?? null
  const hlsBase = process.env.CCTV_HLS_BASE_URL?.trim().replace(/\/+$/, "") ?? null
  
  const gatewayConfigured = Boolean(gatewayUrl)
  
  // HLS URL (MediaMTX format: base/path/index.m3u8)
  const hlsUrl = hlsBase 
    ? `${hlsBase}/camera-${cameraId}-${streamType}/index.m3u8?token=${encodeURIComponent(token)}` 
    : null
    
  // WebRTC URL (MediaMTX format: base/path/whep)
  // We prioritize the Gateway (port 8888) for the initial WHEP request
  // so that it can "prime" the path in MediaMTX.
  const webrtcUrl = gatewayUrl
    ? `${gatewayUrl}/whep/camera-${cameraId}-${streamType}?token=${encodeURIComponent(token)}`
    : webrtcBase 
      ? `${webrtcBase}/camera-${cameraId}-${streamType}/whep?token=${encodeURIComponent(token)}` 
      : null
  const snapshotUrl = gatewayUrl
    ? `${gatewayUrl}/snapshot/camera-${cameraId}-${streamType}?token=${encodeURIComponent(token)}`
    : null
  if (preferredProtocol === "WEBRTC" && (webrtcUrl || gatewayConfigured)) {
    return {
      protocol: StreamProtocol.WEBRTC,
      playUrl: webrtcUrl || gatewayUrl, // Use gateway for signaling if direct WebRTC URL isn't enough
      fallbackPlayUrl: hlsUrl,
      snapshotUrl,
      gatewayConfigured,
    }
  }

  return {
    protocol: hlsUrl ? StreamProtocol.HLS : StreamProtocol.WEBRTC,
    playUrl: hlsUrl || webrtcUrl || gatewayUrl,
    fallbackPlayUrl: hlsUrl ? webrtcUrl : null,
    snapshotUrl,
    gatewayConfigured,
  }
}

export function resolvePlaybackClipUrls({
  playbackRecordId,
  token,
  preferredProtocol = "HLS",
}: PlaybackClipUrlInput): {
  protocol: StreamProtocol
  playUrl: string | null
  fallbackPlayUrl: string | null
  gatewayConfigured: boolean
} {
  const gatewayUrl = process.env.CCTV_GATEWAY_URL?.trim().replace(/\/+$/, "") ?? null

  if (!gatewayUrl) {
    return {
      protocol: StreamProtocol.HLS,
      playUrl: null,
      fallbackPlayUrl: null,
      gatewayConfigured: false,
    }
  }

  const hlsUrl = `${gatewayUrl}/playback/hls/${playbackRecordId}?token=${encodeURIComponent(token)}`
  const whepUrl = `${gatewayUrl}/playback/whep/${playbackRecordId}?token=${encodeURIComponent(token)}`

  if (preferredProtocol === "WEBRTC") {
    return {
      protocol: StreamProtocol.WEBRTC,
      playUrl: whepUrl,
      fallbackPlayUrl: hlsUrl,
      gatewayConfigured: true,
    }
  }

  return {
    protocol: StreamProtocol.HLS,
    playUrl: hlsUrl,
    fallbackPlayUrl: whepUrl,
    gatewayConfigured: true,
  }
}

export function calculateDurationSeconds(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000))
}

export async function enforceCctvFeatureGate(request: NextRequest, companyId: string | undefined) {
  const gate = await enforceFeatureForCompany(companyId, new URL(request.url).pathname);
  if (!gate) return null;

  if (gate.status === 403) {
    return NextResponse.json({ error: "CCTV feature disabled for your subscription." }, { status: 403 });
  }
  return gate;
}

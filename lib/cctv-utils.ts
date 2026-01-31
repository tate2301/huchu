/**
 * Hikvision ISAPI/RTSP Core Utilities
 * 
 * This module provides core functionality for interacting with Hikvision NVRs:
 * - RTSP stream URL generation
 * - ISAPI endpoint URL construction
 * - Stream configuration helpers
 * 
 * Note: This does NOT include the actual HTTP client or streaming server.
 * Those should be implemented in the conversion server (see CCTV_CONVERSION_SERVER.md)
 */

import { StreamType } from "./cctv-types"

/**
 * Hikvision RTSP stream URL format configuration
 */
export interface RTSPConfig {
  host: string
  port: number
  username: string
  password: string
}

/**
 * Generate RTSP URL for Hikvision camera stream
 * 
 * Hikvision supports two RTSP URL formats:
 * 1. /Streaming/channels/<channelID>
 *    where channelID = channelNo * 100 + streamType
 *    streamType: 1=main, 2=sub, 3=third
 * 
 * 2. /ISAPI/Streaming/channels/<channelID>
 *    Same channelID calculation
 * 
 * @param config RTSP connection configuration
 * @param channelNumber Camera channel number (1-based)
 * @param streamType Stream type (main/sub/third)
 * @param useISAPI Use ISAPI-style URL (default: false)
 * @returns Complete RTSP URL with credentials
 */
export function generateRTSPUrl(
  config: RTSPConfig,
  channelNumber: number,
  streamType: StreamType = StreamType.MAIN,
  useISAPI: boolean = false
): string {
  // Calculate channel ID: channelNo * 100 + streamType
  const streamTypeCode = streamType === StreamType.MAIN ? 1 : streamType === StreamType.SUB ? 2 : 3
  const channelId = channelNumber * 100 + streamTypeCode

  const path = useISAPI 
    ? `/ISAPI/Streaming/channels/${channelId}`
    : `/Streaming/channels/${channelId}`

  // Build URL with credentials
  const url = `rtsp://${config.username}:${config.password}@${config.host}:${config.port}${path}`
  
  return url
}

/**
 * Generate ISAPI HTTP endpoint URL
 * 
 * Common ISAPI endpoints:
 * - /ISAPI/System/deviceInfo - Device information
 * - /ISAPI/System/status - System status
 * - /ISAPI/ContentMgmt/record/tracks - List recording tracks
 * - /ISAPI/ContentMgmt/search - Search recordings
 * - /ISAPI/Event/notification/alertStream - Event stream
 * 
 * @param host NVR IP address or hostname
 * @param port HTTP/ISAPI port (default: 80)
 * @param endpoint ISAPI endpoint path
 * @param useHttps Use HTTPS instead of HTTP
 * @returns Complete ISAPI URL
 */
export function generateISAPIUrl(
  host: string,
  port: number = 80,
  endpoint: string,
  useHttps: boolean = false
): string {
  const protocol = useHttps ? "https" : "http"
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`
  return `${protocol}://${host}:${port}${cleanEndpoint}`
}

/**
 * Parse channel number from stream ID
 * 
 * Hikvision stream IDs are in format: channelNo * 100 + streamType
 * Examples: 101 = channel 1 main, 102 = channel 1 sub, 201 = channel 2 main
 * 
 * @param streamId Hikvision stream ID
 * @returns Object with channel number and stream type
 */
export function parseStreamId(streamId: string | number): {
  channelNumber: number
  streamType: StreamType
} {
  const id = typeof streamId === "string" ? parseInt(streamId, 10) : streamId
  
  const channelNumber = Math.floor(id / 100)
  const streamTypeCode = id % 100
  
  let streamType: StreamType
  switch (streamTypeCode) {
    case 1:
      streamType = StreamType.MAIN
      break
    case 2:
      streamType = StreamType.SUB
      break
    case 3:
      streamType = StreamType.THIRD
      break
    default:
      streamType = StreamType.MAIN
  }
  
  return { channelNumber, streamType }
}

/**
 * Generate stream ID from channel number and type
 * 
 * @param channelNumber Camera channel (1-based)
 * @param streamType Stream type
 * @returns Hikvision stream ID
 */
export function generateStreamId(channelNumber: number, streamType: StreamType): string {
  const streamTypeCode = streamType === StreamType.MAIN ? 1 : streamType === StreamType.SUB ? 2 : 3
  return `${channelNumber * 100 + streamTypeCode}`
}

/**
 * Validate NVR connection parameters
 * 
 * @param config RTSP/NVR configuration
 * @returns Validation result with error message if invalid
 */
export function validateNVRConfig(config: Partial<RTSPConfig>): {
  valid: boolean
  error?: string
} {
  if (!config.host || config.host.trim() === "") {
    return { valid: false, error: "Host is required" }
  }

  if (!config.port || config.port < 1 || config.port > 65535) {
    return { valid: false, error: "Port must be between 1 and 65535" }
  }

  if (!config.username || config.username.trim() === "") {
    return { valid: false, error: "Username is required" }
  }

  if (!config.password || config.password.trim() === "") {
    return { valid: false, error: "Password is required" }
  }

  // Validate IP address format (basic check)
  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/
  const hostnamePattern = /^[a-zA-Z0-9][a-zA-Z0-9-._]+[a-zA-Z0-9]$/
  
  if (!ipPattern.test(config.host) && !hostnamePattern.test(config.host)) {
    return { valid: false, error: "Invalid host format (must be IP address or hostname)" }
  }

  return { valid: true }
}

/**
 * Generate ISAPI ContentMgmt search XML payload
 * 
 * Used to search for recordings in a time range.
 * This generates the XML body for the ISAPI search request.
 * 
 * @param channelId Camera channel ID
 * @param startTime ISO 8601 datetime string
 * @param endTime ISO 8601 datetime string
 * @param recordType Recording type (e.g., "all", "motion", "alarm")
 * @returns XML string for ISAPI request body
 */
export function generatePlaybackSearchXML(
  channelId: number,
  startTime: string,
  endTime: string,
  recordType: string = "all"
): string {
  // Convert ISO 8601 to Hikvision format: YYYY-MM-DDTHH:mm:ssZ
  const formatTime = (isoTime: string) => {
    const date = new Date(isoTime)
    return date.toISOString().replace(/\.\d{3}/, "")
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<CMSearchDescription>
  <searchID>C${Date.now()}</searchID>
  <trackIDList>
    <trackID>${channelId}01</trackID>
  </trackIDList>
  <timeSpanList>
    <timeSpan>
      <startTime>${formatTime(startTime)}</startTime>
      <endTime>${formatTime(endTime)}</endTime>
    </timeSpan>
  </timeSpanList>
  <maxResults>100</maxResults>
  <searchResultPostion>0</searchResultPostion>
  <metadataList>
    <metadataDescriptor>${recordType}</metadataDescriptor>
  </metadataList>
</CMSearchDescription>`
}

/**
 * Build stream token with expiration
 * 
 * This generates a short-lived token that can be used by the front-end
 * to request a stream from the conversion server.
 * 
 * Note: This is a simple implementation. In production, use proper JWT
 * or similar token mechanism with signing.
 * 
 * @param cameraId Camera ID
 * @param streamType Stream type
 * @param expiresInMinutes Token expiration time in minutes
 * @returns Token object
 */
export function generateStreamToken(
  cameraId: string,
  streamType: StreamType,
  expiresInMinutes: number = 15
): {
  token: string
  expiresAt: string
  cameraId: string
  streamType: StreamType
} {
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString()
  
  // Simple token format: base64(cameraId:streamType:expiresAt)
  // In production, replace with proper signing
  const payload = `${cameraId}:${streamType}:${expiresAt}`
  const token = Buffer.from(payload).toString("base64")
  
  return {
    token,
    expiresAt,
    cameraId,
    streamType,
  }
}

/**
 * Parse stream token
 * 
 * @param token Stream token string
 * @returns Parsed token data or null if invalid
 */
export function parseStreamToken(token: string): {
  cameraId: string
  streamType: StreamType
  expiresAt: string
} | null {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8")
    const [cameraId, streamType, expiresAt] = decoded.split(":")
    
    // Check if expired
    if (new Date(expiresAt) < new Date()) {
      return null
    }
    
    return {
      cameraId,
      streamType: streamType as StreamType,
      expiresAt,
    }
  } catch {
    return null
  }
}

/**
 * Recommended stream selection based on use case
 * 
 * @param useCase Use case for the stream
 * @returns Recommended stream type
 */
export function getRecommendedStreamType(useCase: "grid" | "fullscreen" | "recording"): StreamType {
  switch (useCase) {
    case "grid":
      return StreamType.SUB // Low bandwidth for multi-camera grid
    case "fullscreen":
      return StreamType.MAIN // High quality for single view
    case "recording":
      return StreamType.MAIN // High quality for evidence
    default:
      return StreamType.SUB
  }
}

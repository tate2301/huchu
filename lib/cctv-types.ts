/**
 * Hikvision CCTV Integration Types
 * Core types for NVR and camera management
 */

export type NVR = {
  id: string
  name: string
  ipAddress: string
  port: number
  httpPort: number
  username: string
  password: string
  siteId: string
  manufacturer: string
  model?: string | null
  firmware?: string | null
  isOnline: boolean
  lastHeartbeat?: string | null
  rtspPort: number
  isapiEnabled: boolean
  onvifEnabled: boolean
  site?: { name: string; code: string }
}

export type Camera = {
  id: string
  name: string
  channelNumber: number
  nvrId: string
  siteId: string
  area: string
  description?: string | null
  mainStreamId?: string | null
  subStreamId?: string | null
  hasPTZ: boolean
  hasAudio: boolean
  hasMotionDetect: boolean
  hasLineDetect: boolean
  isOnline: boolean
  isRecording: boolean
  lastSeen?: string | null
  isHighSecurity: boolean
  requiredUptime?: number | null
  nvr?: { name: string; ipAddress: string }
  site?: { name: string; code: string }
}

export type CCTVEvent = {
  id: string
  nvrId?: string | null
  cameraId?: string | null
  eventType: CCTVEventType
  severity: EventSeverity
  eventTime: string
  title: string
  description?: string | null
  snapshotUrl?: string | null
  linkedIncidentId?: string | null
  isAcknowledged: boolean
  acknowledgedBy?: string | null
  acknowledgedAt?: string | null
  notes?: string | null
  camera?: { name: string; area: string }
  nvr?: { name: string }
}

export type PlaybackRecord = {
  id: string
  cameraId: string
  startTime: string
  endTime: string
  fileSize?: number | null
  playbackUri?: string | null
  recordingType: string
  duration?: number | null
  hasAudio: boolean
  resolution?: string | null
  requestedBy?: string | null
  purpose?: string | null
  camera?: { name: string; area: string }
}

export type CameraAccessLog = {
  id: string
  cameraId: string
  userId?: string | null
  accessType: string
  startTime: string
  endTime?: string | null
  duration?: number | null
  ipAddress?: string | null
  purpose?: string | null
  notes?: string | null
  camera?: { name: string; area: string }
}

export enum CCTVEventType {
  MOTION_DETECTION = "MOTION_DETECTION",
  LINE_CROSSING = "LINE_CROSSING",
  INTRUSION = "INTRUSION",
  VIDEO_LOSS = "VIDEO_LOSS",
  DISK_FULL = "DISK_FULL",
  DISK_ERROR = "DISK_ERROR",
  NETWORK_DISCONNECTED = "NETWORK_DISCONNECTED",
  ILLEGAL_ACCESS = "ILLEGAL_ACCESS",
  ALARM_INPUT = "ALARM_INPUT",
  TAMPERING = "TAMPERING",
}

export enum EventSeverity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum StreamType {
  MAIN = "main",
  SUB = "sub",
  THIRD = "third",
}

export type StreamConfig = {
  cameraId: string
  streamType: StreamType
  rtspUrl: string
  resolution?: string
  fps?: number
  bitrate?: number
}

export type PlaybackSearchParams = {
  cameraId: string
  startTime: string
  endTime: string
  recordingType?: string
}

export type PlaybackSearchResult = {
  clips: Array<{
    startTime: string
    endTime: string
    fileSize: number
    playbackUri: string
  }>
  totalClips: number
}

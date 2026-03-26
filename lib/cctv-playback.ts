import { createHash, randomBytes } from "node:crypto"

type HikvisionCredentials = {
  username: string
  password: string
}

type HikvisionPlaybackDevice = HikvisionCredentials & {
  host: string
  httpPort: number
  rtspPort: number
}

type HikvisionPlaybackClip = {
  startTime: string
  endTime: string
  playbackUri: string
  recordingType: string
  duration: number
  fileSize: number
}

function md5(value: string) {
  return createHash("md5").update(value).digest("hex")
}

function stripQuotes(value: string) {
  return value.replace(/^"|"$/g, "")
}

function parseDigestChallenge(header: string) {
  const challenge = header.replace(/^Digest\s+/i, "")
  const values: Record<string, string> = {}

  for (const match of challenge.matchAll(/(\w+)=(".*?"|[^,]+)/g)) {
    values[match[1]] = stripQuotes(match[2].trim())
  }

  return values
}

async function requestWithDigestFallback(
  url: string,
  init: RequestInit,
  credentials: HikvisionCredentials,
) {
  const basicAuthorization = Buffer.from(
    `${credentials.username}:${credentials.password}`,
  ).toString("base64")

  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Basic ${basicAuthorization}`,
    },
  })

  if (response.status !== 401) {
    return response
  }

  const challenge = response.headers.get("www-authenticate")
  if (!challenge?.toLowerCase().includes("digest")) {
    return response
  }

  const digest = parseDigestChallenge(challenge)
  const requestUrl = new URL(url)
  const requestUri = `${requestUrl.pathname}${requestUrl.search}`
  const nc = "00000001"
  const cnonce = randomBytes(8).toString("hex")
  const qop = digest.qop?.split(",")[0]?.trim() || "auth"
  const ha1 = md5(`${credentials.username}:${digest.realm}:${credentials.password}`)
  const ha2 = md5(`${(init.method || "GET").toUpperCase()}:${requestUri}`)
  const responseHash = md5(
    `${ha1}:${digest.nonce}:${nc}:${cnonce}:${qop}:${ha2}`,
  )

  const authorization = [
    `Digest username="${credentials.username}"`,
    `realm="${digest.realm}"`,
    `nonce="${digest.nonce}"`,
    `uri="${requestUri}"`,
    `response="${responseHash}"`,
    `qop=${qop}`,
    `nc=${nc}`,
    `cnonce="${cnonce}"`,
    digest.opaque ? `opaque="${digest.opaque}"` : null,
  ]
    .filter(Boolean)
    .join(", ")

  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: authorization,
    },
  })
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function extractFirstTagValue(xml: string, tagName: string) {
  const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i"))
  return match?.[1]?.trim() ?? null
}

function toIsoUtcString(value: string) {
  if (/^\d{8}T\d{6}Z$/i.test(value)) {
    const normalized = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(
      6,
      8,
    )}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`
    return new Date(normalized).toISOString()
  }

  return new Date(value).toISOString()
}

function toHikvisionPlaybackTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value
  const iso = date.toISOString()
  return (
    `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T` +
    `${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`
  )
}

export function clampPlaybackSeekTime(
  seekTime: string | undefined,
  clipStartTime: string,
  clipEndTime: string,
) {
  if (!seekTime) {
    return clipStartTime
  }

  const start = new Date(clipStartTime).getTime()
  const end = new Date(clipEndTime).getTime()
  const requested = new Date(seekTime).getTime()

  if (Number.isNaN(requested)) {
    return clipStartTime
  }

  return new Date(Math.min(Math.max(requested, start), end)).toISOString()
}

function buildRecordTypeDescriptor(recordType: string) {
  switch (recordType.toLowerCase()) {
    case "timing":
    case "continuous":
      return "recordType.meta.std-cgi.com/timing"
    case "motion":
      return "recordType.meta.std-cgi.com/motion"
    case "alarm":
      return "recordType.meta.std-cgi.com/alarm"
    default:
      return "all"
  }
}

export function buildPlaybackRecordStreamPath(playbackRecordId: string) {
  return `playback-${playbackRecordId}`
}

export function buildPlaybackStreamPath(
  playbackRecordId: string,
  cameraId: string,
  clipStartTime: string,
  clipEndTime: string,
) {
  const suffix = createHash("sha1")
    .update(`${playbackRecordId}:${cameraId}:${clipStartTime}:${clipEndTime}`)
    .digest("hex")
    .slice(0, 12)

  return `${buildPlaybackRecordStreamPath(playbackRecordId)}-${suffix}`
}

export function buildPlaybackRelayUrls(input: {
  playbackRecordId: string
  cameraId: string
  clipStartTime: string
  clipEndTime: string
  token: string
  seekTime?: string
  preferredProtocol?: "WEBRTC" | "HLS"
}) {
  const gatewayBase = process.env.CCTV_GATEWAY_URL?.trim().replace(/\/+$/, "") ?? null
  const hlsBase = process.env.CCTV_HLS_BASE_URL?.trim().replace(/\/+$/, "") ?? null
  const streamPath = buildPlaybackStreamPath(
    input.playbackRecordId,
    input.cameraId,
    input.clipStartTime,
    input.clipEndTime,
  )

  const seekParam = input.seekTime
    ? `&seek=${encodeURIComponent(input.seekTime)}`
    : ""

  const whepUrl = gatewayBase
    ? `${gatewayBase}/whep/${streamPath}?token=${encodeURIComponent(input.token)}${seekParam}`
    : null
  const hlsUrl = hlsBase
    ? `${hlsBase}/${streamPath}/index.m3u8?token=${encodeURIComponent(input.token)}${seekParam}`
    : null

  if (input.preferredProtocol === "HLS") {
    return {
      streamPath,
      protocol: hlsUrl ? "HLS" : "WEBRTC",
      playUrl: hlsUrl || whepUrl,
      fallbackPlayUrl: hlsUrl ? whepUrl : null,
      gatewayConfigured: Boolean(gatewayBase),
    }
  }

  return {
    streamPath,
    protocol: whepUrl ? "WEBRTC" : "HLS",
    playUrl: whepUrl || hlsUrl,
    fallbackPlayUrl: whepUrl && hlsUrl ? hlsUrl : null,
    gatewayConfigured: Boolean(gatewayBase),
  }
}

export function applySeekToPlaybackUri(input: {
  playbackUri: string
  clipStartTime: string
  clipEndTime: string
  seekTime?: string
  nvr: Pick<HikvisionPlaybackDevice, "host" | "rtspPort" | "username" | "password">
}) {
  const playbackUrl = new URL(input.playbackUri)
  const nextStartTime = clampPlaybackSeekTime(
    input.seekTime,
    input.clipStartTime,
    input.clipEndTime,
  )

  playbackUrl.hostname = input.nvr.host
  playbackUrl.port = String(input.nvr.rtspPort)
  playbackUrl.username = encodeURIComponent(input.nvr.username)
  playbackUrl.password = encodeURIComponent(input.nvr.password)
  playbackUrl.searchParams.set("starttime", toHikvisionPlaybackTime(nextStartTime))
  playbackUrl.searchParams.set(
    "endtime",
    toHikvisionPlaybackTime(input.clipEndTime),
  )

  return playbackUrl.toString()
}

export async function searchHikvisionPlaybackClips(
  device: HikvisionPlaybackDevice,
  channelNumber: number,
  startTime: string,
  endTime: string,
  recordType = "all",
) {
  const response = await requestWithDigestFallback(
    `http://${device.host}:${device.httpPort}/ISAPI/ContentMgmt/search`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/xml; charset=UTF-8",
        Accept: "application/xml",
      },
      body: `<?xml version="1.0" encoding="UTF-8"?>
<CMSearchDescription>
  <searchID>C${Date.now()}</searchID>
  <trackIDList>
    <trackID>${channelNumber}01</trackID>
  </trackIDList>
  <timeSpanList>
    <timeSpan>
      <startTime>${new Date(startTime).toISOString().replace(/\.\d{3}/, "")}</startTime>
      <endTime>${new Date(endTime).toISOString().replace(/\.\d{3}/, "")}</endTime>
    </timeSpan>
  </timeSpanList>
  <maxResults>200</maxResults>
  <searchResultPostion>0</searchResultPostion>
  <metadataList>
    <metadataDescriptor>${buildRecordTypeDescriptor(recordType)}</metadataDescriptor>
  </metadataList>
</CMSearchDescription>`,
    },
    device,
  )

  const responseText = await response.text()
  if (!response.ok) {
    throw new Error(
      `Playback search failed (${response.status}): ${responseText.slice(0, 240)}`,
    )
  }

  const clips: HikvisionPlaybackClip[] = []
  for (const match of responseText.matchAll(
    /<searchMatchItem>([\s\S]*?)<\/searchMatchItem>/gi,
  )) {
    const item = match[1]
    const start = extractFirstTagValue(item, "startTime")
    const end = extractFirstTagValue(item, "endTime")
    const playbackUriRaw = extractFirstTagValue(item, "playbackURI")
    const recordingType =
      extractFirstTagValue(item, "metadataDescriptor")?.split("/").pop()?.toUpperCase() ??
      recordType.toUpperCase()

    if (!start || !end || !playbackUriRaw) {
      continue
    }

    const playbackUri = decodeXmlEntities(playbackUriRaw)
    const startIso = toIsoUtcString(start)
    const endIso = toIsoUtcString(end)
    const duration = Math.max(
      1,
      Math.round(
        (new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000,
      ),
    )
    const fileSize = Number(
      new URL(playbackUri).searchParams.get("size") || 0,
    )

    clips.push({
      startTime: startIso,
      endTime: endIso,
      playbackUri,
      recordingType,
      duration,
      fileSize,
    })
  }

  return clips.sort(
    (left, right) =>
      new Date(left.startTime).getTime() - new Date(right.startTime).getTime(),
  )
}

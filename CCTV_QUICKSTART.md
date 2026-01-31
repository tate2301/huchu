# CCTV Integration - Quick Start

This document provides a quick overview of the Hikvision CCTV integration implementation.

## What Was Implemented

### ✅ Core Functionality (Complete)
- Database schema for NVRs, cameras, events, and access logs
- RTSP URL generation utilities
- ISAPI endpoint helpers
- REST API endpoints for all operations
- TypeScript types and client functions
- Comprehensive documentation

### ⏸️ Not Implemented (By Design)
- Conversion server (documented in `CCTV_CONVERSION_SERVER.md`)
- Front-end UI components
- Live ISAPI HTTP client integration

## Quick Reference

### Database Tables
- `NVR` - Network Video Recorder configurations
- `Camera` - Individual camera settings and status
- `CCTVEvent` - Motion detection, alarms, system events
- `PlaybackRecord` - Recording search history
- `CameraAccessLog` - Complete audit trail

### API Endpoints

#### Cameras
```bash
# List cameras
GET /api/cctv/cameras?siteId=<uuid>&area=Gate&isOnline=true

# Add camera
POST /api/cctv/cameras
{
  "name": "Gate Camera 1",
  "channelNumber": 1,
  "nvrId": "<uuid>",
  "siteId": "<uuid>",
  "area": "Gate"
}
```

#### NVRs
```bash
# List NVRs
GET /api/cctv/nvrs?siteId=<uuid>&isOnline=true

# Add NVR
POST /api/cctv/nvrs
{
  "name": "Main NVR",
  "ipAddress": "192.168.1.100",
  "username": "viewer",
  "password": "secure123",
  "siteId": "<uuid>"
}
```

#### Stream Token
```bash
# Get streaming URL
POST /api/cctv/stream-token
{
  "cameraId": "<uuid>",
  "streamType": "sub"  # "main" | "sub" | "third"
}
```

#### Playback Search
```bash
# Search recordings
POST /api/cctv/playback/search
{
  "cameraId": "<uuid>",
  "startTime": "2026-01-27T08:00:00Z",
  "endTime": "2026-01-27T09:00:00Z",
  "purpose": "Incident investigation"
}
```

#### Events
```bash
# List events
GET /api/cctv/events?cameraId=<uuid>&isAcknowledged=false

# Acknowledge event
PATCH /api/cctv/events
{
  "eventId": "<uuid>",
  "notes": "Reviewed - false alarm"
}
```

### Utility Functions

```typescript
import {
  generateRTSPUrl,
  generateISAPIUrl,
  generateStreamToken,
  validateNVRConfig
} from '@/lib/cctv-utils'

// Generate RTSP URL
const url = generateRTSPUrl(
  { host: "192.168.1.100", port: 554, username: "admin", password: "pass" },
  1,        // channel number
  "main",   // stream type
  false     // use ISAPI format
)
// Output: rtsp://admin:pass@192.168.1.100:554/Streaming/channels/101

// Generate ISAPI URL
const apiUrl = generateISAPIUrl("192.168.1.100", 80, "/ISAPI/System/deviceInfo")
// Output: http://192.168.1.100:80/ISAPI/System/deviceInfo

// Create stream token
const token = generateStreamToken("camera-id", "sub", 15)
// Returns: { token, expiresAt, cameraId, streamType }
```

## Testing

```bash
# Test utility functions
npx tsx scripts/test-cctv-utils.ts

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push
```

## Next Steps

1. **Deploy Conversion Server** (see `CCTV_CONVERSION_SERVER.md`)
   - Choose WebRTC (low latency) or HLS (high compatibility)
   - Install Mediamtx or FFmpeg+Nginx
   - Configure authentication

2. **Database Migration**
   ```bash
   npx prisma migrate dev --name add_cctv_tables
   ```

3. **Add Initial Data**
   - Create NVR records for each site
   - Configure cameras with channel numbers
   - Set area assignments

4. **Build Front-End** (Future Phase)
   - Camera list page
   - Live view component
   - Playback search UI
   - Event monitoring dashboard

## Documentation Files

- `CCTV_INTEGRATION.md` - Complete implementation guide with architecture
- `CCTV_CONVERSION_SERVER.md` - Step-by-step conversion server setup
- `prisma/schema.prisma` - Database schema definitions
- `lib/cctv-utils.ts` - Utility functions with inline documentation
- `lib/cctv-types.ts` - TypeScript type definitions

## Security Considerations

✅ **Implemented:**
- Role-based access control (MANAGER+ for configuration)
- Complete audit logging (CameraAccessLog)
- Short-lived stream tokens (15-minute default)
- Password sanitization in API responses
- High-security camera flagging

⚠️ **Required for Production:**
- Encrypt NVR passwords in database
- Set up VPN for remote access (WireGuard recommended)
- Configure read-only NVR users
- Network isolation for NVRs
- SSL/TLS for all connections

## Hikvision Stream URLs

### Main Stream (High Quality - Fullscreen)
```
rtsp://user:pass@192.168.1.100:554/Streaming/channels/101  # Channel 1
rtsp://user:pass@192.168.1.100:554/Streaming/channels/201  # Channel 2
```

### Sub Stream (Low Bandwidth - Grid View)
```
rtsp://user:pass@192.168.1.100:554/Streaming/channels/102  # Channel 1
rtsp://user:pass@192.168.1.100:554/Streaming/channels/202  # Channel 2
```

### ISAPI Format (Alternative)
```
rtsp://user:pass@192.168.1.100:554/ISAPI/Streaming/channels/101
```

### Channel ID Calculation
```
channelID = channelNumber * 100 + streamType
where streamType: 1=main, 2=sub, 3=third
```

## Integration with Existing Modules

### Incidents
```typescript
// Link CCTV event to incident
await prisma.cCTVEvent.update({
  where: { id: eventId },
  data: { linkedIncidentId: incidentId }
})
```

### Gold Control
```typescript
// Get gold room cameras
const cameras = await fetchCameras({
  area: "Gold Room",
  isHighSecurity: true
})
```

### Compliance
```typescript
// Get cameras for inspection
const cameras = await fetchCameras({
  siteId: inspection.siteId
})
```

## Support

For issues or questions:
1. Check `CCTV_INTEGRATION.md` for detailed documentation
2. Review `CCTV_CONVERSION_SERVER.md` for streaming setup
3. Test utilities with `scripts/test-cctv-utils.ts`
4. Check Hikvision ISAPI documentation

---

**Status**: Core logic complete, conversion server pending  
**Last Updated**: January 2026  
**Version**: 1.0

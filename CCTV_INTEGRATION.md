# Hikvision CCTV Integration - Implementation Guide

## Overview

This document describes the Hikvision CCTV integration implemented for the Huchu Enterprises mine operations ERP system. The integration enables live monitoring and playback of surveillance footage across 5 mine sites with proper access control and audit trails.

## What Has Been Implemented

### 1. Database Schema

Added comprehensive CCTV tables to `prisma/schema.prisma`:

- **NVR** - Network Video Recorders (one per site)
  - Connection details (IP, ports, credentials)
  - Online status tracking
  - ISAPI/ONVIF capabilities

- **Camera** - Individual cameras
  - Channel configuration
  - Location/area mapping
  - Capabilities (PTZ, audio, motion detection)
  - High-security flagging (e.g., gold room cameras)
  - Status tracking (online, recording)

- **CCTVEvent** - Motion detection, alarms, system events
  - Event type and severity classification
  - Acknowledgment workflow
  - Link to incidents for escalation

- **PlaybackRecord** - Recording search history
  - Time range tracking
  - Access audit trail
  - Purpose logging

- **CameraAccessLog** - Complete access audit
  - Who viewed what camera and when
  - Access type (live view, playback, PTZ control)
  - Purpose documentation

### 2. Core Utility Library (`lib/cctv-utils.ts`)

Provides essential Hikvision integration functions:

#### RTSP URL Generation
```typescript
generateRTSPUrl(config, channelNumber, streamType)
```
- Supports main/sub/third streams
- Standard and ISAPI URL formats
- Automatic channel ID calculation

#### ISAPI Endpoint Construction
```typescript
generateISAPIUrl(host, port, endpoint)
```
- System information endpoints
- Recording search endpoints
- Event notification endpoints

#### Stream Management
```typescript
generateStreamToken(cameraId, streamType, expiresInMinutes)
parseStreamToken(token)
```
- Short-lived tokens for security
- Token-based access control

#### XML Generation for ISAPI
```typescript
generatePlaybackSearchXML(channelId, startTime, endTime, recordType)
```
- ContentMgmt search payloads
- Time-based recording queries

#### Configuration Validation
```typescript
validateNVRConfig(config)
```
- IP/hostname validation
- Port range checking
- Required field validation

### 3. REST API Endpoints

#### `/api/cctv/cameras` (GET, POST)
- List cameras with filtering (site, area, online status, high-security)
- Create new camera configurations
- Returns camera status and NVR details
- Role-based access control (MANAGER+ for create)

#### `/api/cctv/nvrs` (GET, POST)
- List NVRs with status
- Add new NVRs
- Password sanitization in responses
- Duplicate IP detection

#### `/api/cctv/stream-token` (POST)
- Generate RTSP URLs for streaming
- Create short-lived access tokens
- Log all stream access
- Check NVR online status
- Recommend stream quality (sub for grid, main for fullscreen)

#### `/api/cctv/playback/search` (POST)
- Search recordings by time range
- Generate playback URIs
- Mock data with proper structure (ready for ISAPI integration)
- Audit logging
- Purpose tracking

#### `/api/cctv/events` (GET, POST, PATCH)
- List events with filtering
- Webhook endpoint for NVR event push
- Event acknowledgment workflow
- Severity classification

### 4. TypeScript Types (`lib/cctv-types.ts`)

Complete type definitions for:
- Camera configurations
- NVR settings
- CCTV events
- Playback records
- Access logs
- Stream configurations
- Enums for event types, severities, and stream types

### 5. Documentation

#### `CCTV_CONVERSION_SERVER.md`
Comprehensive guide for building the streaming gateway:

**Option 1: WebRTC (Low Latency)**
- Mediamtx installation (Docker and native)
- Configuration examples
- API wrapper code
- Front-end integration example

**Option 2: HLS (High Compatibility)**
- FFmpeg + Nginx setup
- Stream management service
- Front-end integration with hls.js
- Segment management

**Security**
- Network isolation
- VPN setup (WireGuard)
- Read-only NVR users
- Audit logging

**Performance Tuning**
- Low bandwidth configurations
- Grid view optimizations
- Lazy loading strategies

**Monitoring & Troubleshooting**
- Health checks
- Prometheus metrics
- Common issues and solutions

## Architecture

```
┌─────────────────┐
│  Hikvision NVR  │
│   (On-premise)  │
└────────┬────────┘
         │ RTSP/ISAPI
         │
┌────────▼────────────────┐
│  Conversion Server      │
│  (Not implemented -     │
│   See guide)            │
│  - Mediamtx/FFmpeg      │
│  - RTSP → WebRTC/HLS    │
└────────┬────────────────┘
         │ WebRTC/HLS
         │
┌────────▼────────────────┐
│  Huchu ERP              │
│  ┌──────────────────┐   │
│  │ API Layer        │   │
│  │ /api/cctv/*      │   │
│  └──────────────────┘   │
│  ┌──────────────────┐   │
│  │ Core Logic       │   │
│  │ lib/cctv-*       │   │
│  └──────────────────┘   │
│  ┌──────────────────┐   │
│  │ Database         │   │
│  │ (PostgreSQL)     │   │
│  └──────────────────┘   │
└─────────────────────────┘
         │
         │ HTTPS
         │
┌────────▼────────────────┐
│  Browser                │
│  (Manager/Clerk)        │
└─────────────────────────┘
```

## Security Features

### 1. Authentication & Authorization
- All endpoints require NextAuth session
- Role-based access control (RBAC)
- MANAGER+ required for camera/NVR management
- Token-based streaming access

### 2. Audit Trail
Complete tracking in `CameraAccessLog`:
- User identification
- Access timestamp
- Access type (live, playback, PTZ)
- Purpose/reason for access
- IP address logging

### 3. Data Protection
- NVR passwords not exposed in API responses
- Short-lived stream tokens (15-minute default)
- Read-only NVR user recommendation
- VPN requirement for remote access

### 4. Gold Room Compliance
High-security camera flagging:
```typescript
isHighSecurity: true  // Gold room, vault, etc.
```
- Enhanced logging
- Restricted access
- Purpose required for viewing

## Integration Points

### With Existing ERP Modules

1. **Incident Management** (`/incidents`)
   - Link CCTV events to incidents
   - Automatic camera view on incident
   - Evidence preservation

2. **Compliance** (`/compliance`)
   - Security inspection evidence
   - Permit verification footage
   - Audit trail exports

3. **Gold Control** (`/gold`)
   - Pour room monitoring
   - Dispatch verification
   - Witness verification via video

4. **Sites Management**
   - Site-specific camera views
   - Per-site NVR configuration
   - Area-based access control

## Database Migration

To apply the schema changes:

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Or create migration (recommended for production)
npx prisma migrate dev --name add_cctv_tables
```

## Usage Examples

### 1. Add an NVR

```bash
curl -X POST http://localhost:3000/api/cctv/nvrs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "name": "Main Gate NVR",
    "ipAddress": "192.168.1.100",
    "port": 554,
    "httpPort": 80,
    "username": "viewer",
    "password": "SecurePass123",
    "siteId": "<site-uuid>",
    "manufacturer": "Hikvision"
  }'
```

### 2. Add a Camera

```bash
curl -X POST http://localhost:3000/api/cctv/cameras \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "name": "Main Gate Camera 1",
    "channelNumber": 1,
    "nvrId": "<nvr-uuid>",
    "siteId": "<site-uuid>",
    "area": "Gate",
    "hasPTZ": false,
    "hasAudio": true,
    "isHighSecurity": false
  }'
```

### 3. Get Stream URL

```bash
curl -X POST http://localhost:3000/api/cctv/stream-token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "cameraId": "<camera-uuid>",
    "streamType": "sub"
  }'
```

Response:
```json
{
  "token": "eyJjYW1lcmFJZC...",
  "rtspUrl": "rtsp://user:pass@192.168.1.100:554/Streaming/channels/102",
  "expiresAt": "2026-01-28T02:00:00Z",
  "camera": {
    "id": "...",
    "name": "Main Gate Camera 1",
    "area": "Gate"
  },
  "streamInfo": {
    "streamType": "sub",
    "resolution": "704x576",
    "recommended": "Use for grid view"
  }
}
```

### 4. Search Playback

```bash
curl -X POST http://localhost:3000/api/cctv/playback/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "cameraId": "<camera-uuid>",
    "startTime": "2026-01-27T08:00:00Z",
    "endTime": "2026-01-27T09:00:00Z",
    "purpose": "Incident investigation"
  }'
```

## What's NOT Implemented (Intentionally)

### 1. Conversion Server
The RTSP-to-WebRTC/HLS conversion server is **documented but not built**.
- See `CCTV_CONVERSION_SERVER.md` for build instructions
- Requires separate deployment
- Can be Mediamtx, FFmpeg, or commercial solution

### 2. Front-End UI
No camera viewer pages built.
- Core API is ready
- UI can be added in Phase 6 (Analytics)
- Requires conversion server first

### 3. Live ISAPI Integration
APIs return mock data for playback search.
- ISAPI HTTP client not implemented
- XML parsing not implemented
- Ready for integration (structure in place)

### 4. Automatic Camera Discovery
Manual camera configuration required.
- ONVIF discovery could be added
- ISAPI device enumeration possible

### 5. PTZ Control
Database schema supports PTZ, but no API endpoints.
- Can be added when needed
- Requires ISAPI PTZ commands

### 6. Event Push from NVR
Webhook endpoint exists but no NVR configuration guide.
- NVR needs to POST to `/api/cctv/events`
- Requires ISAPI Event Notification setup

## Next Steps (When Ready)

### Phase 1: Deploy Conversion Server
1. Follow `CCTV_CONVERSION_SERVER.md`
2. Choose WebRTC or HLS based on requirements
3. Test with one camera
4. Scale to all cameras

### Phase 2: Build Front-End
1. Create `/app/cctv` directory
2. Build camera list page
3. Build live view component
4. Build playback search UI
5. Build event monitoring dashboard

### Phase 3: Production Hardening
1. Encrypt NVR passwords in database
2. Set up VPN for remote access
3. Configure read-only NVR users
4. Set up monitoring and alerts
5. Train staff on usage

### Phase 4: Advanced Features
1. PTZ control UI
2. Motion detection zones
3. Event-triggered recording
4. Integration with incident workflow
5. Mobile app access

## Testing

### Test Camera Configuration (Mock)
```typescript
// Create test data
const testNVR = {
  name: "Test NVR",
  ipAddress: "192.168.1.100",
  username: "admin",
  password: "12345",
  siteId: "<your-site-id>",
};

const testCamera = {
  name: "Test Camera",
  channelNumber: 1,
  area: "Gate",
  // ... other fields
};
```

### Verify RTSP URL Generation
```typescript
import { generateRTSPUrl, StreamType } from '@/lib/cctv-utils';

const url = generateRTSPUrl(
  {
    host: "192.168.1.100",
    port: 554,
    username: "admin",
    password: "12345"
  },
  1,
  StreamType.MAIN
);

console.log(url);
// Output: rtsp://admin:12345@192.168.1.100:554/Streaming/channels/101
```

## Support and Maintenance

### Regular Tasks
- [ ] Review access logs weekly
- [ ] Monitor camera online status
- [ ] Check NVR disk usage
- [ ] Update conversion server monthly
- [ ] Test backup/failover quarterly

### Troubleshooting
1. Check NVR online status in database
2. Verify network connectivity
3. Review access logs for errors
4. Test RTSP URL with VLC/FFmpeg
5. Check conversion server logs

## References

- Hikvision ISAPI Documentation: Contact vendor
- Hikvision SDK: https://www.hikvision.com/en/support/
- Mediamtx: https://github.com/bluenviron/mediamtx
- FFmpeg: https://ffmpeg.org/documentation.html
- WebRTC: https://webrtc.org/
- HLS: https://developer.apple.com/streaming/

---

**Implementation Date**: January 2026  
**Version**: 1.0  
**Status**: Core Logic Complete - Conversion Server Pending  
**Prepared for**: Huchu Enterprises

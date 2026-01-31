# Hikvision CCTV Conversion Server Setup Guide

This document provides instructions for building and deploying the RTSP-to-WebRTC/HLS conversion server that bridges Hikvision NVRs with the Huchu ERP web interface.

## Overview

The conversion server is a critical component that:
- Receives RTSP streams from Hikvision NVRs
- Converts them to browser-compatible formats (WebRTC or HLS)
- Provides a streaming API for the ERP front-end
- Handles authentication and access control

## Architecture

```
[Hikvision NVR] --RTSP--> [Conversion Server] --WebRTC/HLS--> [Browser]
                                  ↑
                                  | REST API
                                  ↓
                            [Huchu ERP Backend]
```

## Option 1: WebRTC (Low Latency - Recommended for Monitoring)

### Technology Stack
- **Mediamtx** (formerly rtsp-simple-server) - Open-source media server
- **Docker** - For easy deployment
- **Node.js/Go** - For API wrapper (optional)

### Step 1: Install Mediamtx

Mediamtx is a lightweight, high-performance RTSP server that can convert RTSP to WebRTC.

#### Using Docker (Recommended)

```bash
# Pull the official image
docker pull bluenviron/mediamtx:latest

# Create configuration file
mkdir -p /opt/cctv-gateway
cat > /opt/cctv-gateway/mediamtx.yml << 'EOF'
# Mediamtx configuration
logLevel: info
logDestinations: [stdout]
logFile: /dev/stdout

# API server
api: yes
apiAddress: :9997

# RTSP server
rtspDisable: no
rtspAddress: :8554

# WebRTC server
webrtcDisable: no
webrtcAddress: :8889
webrtcICEServers2:
  - urls: [stun:stun.l.google.com:19302]

# Authentication (integrate with your ERP)
authMethod: http
authHTTPAddress: http://your-erp-backend:3000/api/cctv/auth

# Path configuration
paths:
  # Dynamic paths will be created on-demand
  all:
    # Source is RTSP from Hikvision NVR
    source: rtsp://{username}:{password}@{nvr_ip}:554/Streaming/channels/{channel_id}
    
    # Allow both reading and publishing
    sourceOnDemand: yes
    sourceOnDemandStartTimeout: 10s
    sourceOnDemandCloseAfter: 10s
    
    # Recording (optional)
    record: no
EOF

# Run the container
docker run -d \
  --name cctv-gateway \
  --restart unless-stopped \
  -p 8554:8554 \
  -p 8889:8889 \
  -p 9997:9997 \
  -v /opt/cctv-gateway/mediamtx.yml:/mediamtx.yml \
  bluenviron/mediamtx:latest
```

#### Without Docker (Direct Installation)

```bash
# Download Mediamtx
VERSION=v1.8.0
wget https://github.com/bluenviron/mediamtx/releases/download/${VERSION}/mediamtx_${VERSION}_linux_amd64.tar.gz

# Extract
tar -xzf mediamtx_${VERSION}_linux_amd64.tar.gz

# Move to /opt
sudo mv mediamtx /opt/cctv-gateway/
sudo mv mediamtx.yml /opt/cctv-gateway/

# Edit configuration (as above)
sudo nano /opt/cctv-gateway/mediamtx.yml

# Create systemd service
sudo cat > /etc/systemd/system/cctv-gateway.service << 'EOF'
[Unit]
Description=CCTV Gateway (Mediamtx)
After=network.target

[Service]
Type=simple
User=cctv
WorkingDirectory=/opt/cctv-gateway
ExecStart=/opt/cctv-gateway/mediamtx /opt/cctv-gateway/mediamtx.yml
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Create user
sudo useradd -r -s /bin/false cctv
sudo chown -R cctv:cctv /opt/cctv-gateway

# Start service
sudo systemctl daemon-reload
sudo systemctl enable cctv-gateway
sudo systemctl start cctv-gateway
```

### Step 2: API Wrapper (Optional but Recommended)

Create a lightweight API wrapper to integrate with your ERP:

```javascript
// server.js
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Authenticate requests (integrate with your ERP auth)
async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Verify token with ERP backend
  try {
    const response = await axios.get('http://erp-backend:3000/api/auth/verify', {
      headers: { Authorization: `Bearer ${token}` }
    });
    req.user = response.data.user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Get WebRTC offer
app.post('/api/stream/webrtc', authenticate, async (req, res) => {
  const { cameraId, streamType } = req.body;
  
  // Get camera config from ERP
  const camera = await axios.get(
    `http://erp-backend:3000/api/cctv/cameras/${cameraId}`
  );
  
  // Generate stream path
  const streamPath = `camera-${cameraId}-${streamType}`;
  
  // Proxy request to Mediamtx
  const offer = req.body.offer; // WebRTC offer from client
  const response = await axios.post(
    `http://localhost:8889/${streamPath}/whep`,
    { offer },
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  res.json({ answer: response.data });
});

app.listen(8888, () => {
  console.log('CCTV Gateway API running on port 8888');
});
```

### Step 3: Front-End Integration (WebRTC)

```typescript
// Example React component
async function playWebRTC(cameraId: string, streamType: string) {
  // Get stream token from ERP
  const { token, rtspUrl } = await fetch('/api/cctv/stream-token', {
    method: 'POST',
    body: JSON.stringify({ cameraId, streamType })
  }).then(r => r.json());
  
  // Create WebRTC peer connection
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });
  
  // Handle incoming stream
  pc.ontrack = (event) => {
    const video = document.getElementById('video') as HTMLVideoElement;
    video.srcObject = event.streams[0];
  };
  
  // Create offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  
  // Send offer to gateway
  const response = await fetch('http://gateway:8888/api/stream/webrtc', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ cameraId, streamType, offer: pc.localDescription })
  });
  
  const { answer } = await response.json();
  await pc.setRemoteDescription(answer);
}
```

## Option 2: HLS (High Compatibility - Recommended for Playback)

### Technology Stack
- **FFmpeg** - For RTSP to HLS conversion
- **Nginx** - For serving HLS segments
- **Node.js** - For stream management API

### Step 1: Install FFmpeg and Nginx

```bash
# Install dependencies
sudo apt update
sudo apt install -y ffmpeg nginx

# Create HLS output directory
sudo mkdir -p /var/www/hls
sudo chown -R www-data:www-data /var/www/hls
```

### Step 2: Configure Nginx for HLS

```nginx
# /etc/nginx/sites-available/cctv-hls
server {
    listen 8080;
    server_name _;

    # CORS headers for browser access
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Authorization' always;

    location /hls {
        types {
            application/vnd.apple.mpegurl m3u8;
            video/mp2t ts;
        }
        root /var/www;
        add_header Cache-Control no-cache;
        
        # Authentication (optional)
        auth_request /auth;
    }

    location = /auth {
        internal;
        proxy_pass http://localhost:3000/api/cctv/auth;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header X-Original-URI $request_uri;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/cctv-hls /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 3: Stream Management Service

```javascript
// hls-manager.js
const { spawn } = require('child_process');
const express = require('express');
const fs = require('fs');

const app = express();
const streams = new Map(); // Track active streams

app.use(express.json());

// Start HLS stream
app.post('/api/stream/start', async (req, res) => {
  const { cameraId, rtspUrl } = req.body;
  
  if (streams.has(cameraId)) {
    return res.json({ status: 'already_streaming' });
  }
  
  const outputPath = `/var/www/hls/camera-${cameraId}`;
  
  // Create output directory
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }
  
  // Start FFmpeg
  const ffmpeg = spawn('ffmpeg', [
    '-rtsp_transport', 'tcp',
    '-i', rtspUrl,
    '-c:v', 'copy',           // Copy video codec (no transcoding)
    '-c:a', 'aac',            // Convert audio to AAC
    '-f', 'hls',              // HLS output format
    '-hls_time', '2',         // 2-second segments
    '-hls_list_size', '10',   // Keep last 10 segments
    '-hls_flags', 'delete_segments+append_list',
    '-hls_segment_filename', `${outputPath}/segment_%03d.ts`,
    `${outputPath}/playlist.m3u8`
  ]);
  
  ffmpeg.stderr.on('data', (data) => {
    console.log(`FFmpeg [${cameraId}]: ${data}`);
  });
  
  ffmpeg.on('close', (code) => {
    console.log(`Stream ${cameraId} closed with code ${code}`);
    streams.delete(cameraId);
  });
  
  streams.set(cameraId, { ffmpeg, startTime: Date.now() });
  
  res.json({
    status: 'streaming',
    playlistUrl: `/hls/camera-${cameraId}/playlist.m3u8`
  });
});

// Stop HLS stream
app.post('/api/stream/stop', (req, res) => {
  const { cameraId } = req.body;
  
  const stream = streams.get(cameraId);
  if (stream) {
    stream.ffmpeg.kill('SIGTERM');
    streams.delete(cameraId);
    res.json({ status: 'stopped' });
  } else {
    res.status(404).json({ error: 'Stream not found' });
  }
});

// Health check
app.get('/api/stream/status', (req, res) => {
  const activeStreams = Array.from(streams.keys());
  res.json({
    activeStreams,
    count: activeStreams.length
  });
});

app.listen(8888, () => {
  console.log('HLS Manager running on port 8888');
});
```

### Step 4: Front-End Integration (HLS)

```typescript
// Example using hls.js
import Hls from 'hls.js';

async function playHLS(cameraId: string) {
  // Get stream token from ERP
  const { token, rtspUrl } = await fetch('/api/cctv/stream-token', {
    method: 'POST',
    body: JSON.stringify({ cameraId, streamType: 'main' })
  }).then(r => r.json());
  
  // Start HLS stream
  const response = await fetch('http://gateway:8888/api/stream/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cameraId, rtspUrl })
  });
  
  const { playlistUrl } = await response.json();
  
  // Play HLS in browser
  const video = document.getElementById('video') as HTMLVideoElement;
  
  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(`http://gateway:8080${playlistUrl}`);
    hls.attachMedia(video);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Native HLS support (Safari)
    video.src = `http://gateway:8080${playlistUrl}`;
  }
  
  video.play();
}
```

## Security Considerations

### 1. Network Isolation
```bash
# Keep NVR on isolated VLAN
# Only allow conversion server to access NVR network
sudo iptables -A FORWARD -s 192.168.10.0/24 -d 192.168.20.0/24 -j ACCEPT
sudo iptables -A FORWARD -j DROP
```

### 2. VPN Access
```bash
# Install WireGuard
sudo apt install wireguard

# Generate keys
wg genkey | tee privatekey | wg pubkey > publickey

# Configure /etc/wireguard/wg0.conf
[Interface]
PrivateKey = <private_key>
Address = 10.0.0.1/24
ListenPort = 51820

[Peer]
PublicKey = <client_public_key>
AllowedIPs = 10.0.0.2/32
```

### 3. Read-Only NVR User
Create a dedicated user on the NVR with:
- No admin access
- View-only permissions
- Separate from main admin account

### 4. Audit Logging
All camera access is logged in the ERP database via the `CameraAccessLog` table.

## Performance Tuning

### For Mining Operations (Low Bandwidth)

```yaml
# Mediamtx configuration for low bandwidth
paths:
  all:
    # Reduce quality for sub-streams
    runOnInit: ffmpeg -i rtsp://localhost:$RTSP_PORT/$MTX_PATH -c:v libx264 -preset ultrafast -b:v 256k -f rtsp rtsp://localhost:$RTSP_PORT/$MTX_PATH-low
```

### For Multiple Cameras (Grid View)

- Use sub-streams (lower resolution/bitrate)
- Limit concurrent streams per user
- Implement lazy loading (only stream visible cameras)

## Monitoring

### Health Check Endpoint

```bash
# Check if conversion server is running
curl http://localhost:9997/v3/paths

# Monitor active streams
curl http://localhost:8888/api/stream/status
```

### Prometheus Metrics (Optional)

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'mediamtx'
    static_configs:
      - targets: ['localhost:9998']
```

## Deployment Checklist

- [ ] Install conversion server (Mediamtx or FFmpeg+Nginx)
- [ ] Configure NVR connections
- [ ] Set up authentication with ERP
- [ ] Configure firewall rules
- [ ] Set up VPN for remote access
- [ ] Create read-only NVR user
- [ ] Test streaming with one camera
- [ ] Load test with multiple cameras
- [ ] Configure monitoring and alerts
- [ ] Document for operations team

## Troubleshooting

### Issue: No video in browser
```bash
# Check if Mediamtx is receiving RTSP
curl http://localhost:9997/v3/paths

# Check RTSP connectivity
ffmpeg -rtsp_transport tcp -i rtsp://user:pass@nvr-ip:554/Streaming/channels/101 -f null -

# Check browser console for errors
```

### Issue: High latency
- Switch from HLS to WebRTC
- Reduce HLS segment size
- Use sub-streams for grid view

### Issue: Streams dropping
- Check network bandwidth
- Verify NVR disk is not full
- Monitor CPU usage on conversion server

## Maintenance

### Regular Tasks
- Monitor disk usage for HLS segments
- Review access logs weekly
- Update conversion server software monthly
- Test backup camera access quarterly

## Support

For issues with:
- **Mediamtx**: https://github.com/bluenviron/mediamtx
- **FFmpeg**: https://ffmpeg.org/documentation.html
- **Hikvision ISAPI**: Contact Hikvision support or check SDK documentation

---

**Last Updated**: January 2026  
**Version**: 1.0  
**Prepared for**: Huchu Enterprises CCTV Integration

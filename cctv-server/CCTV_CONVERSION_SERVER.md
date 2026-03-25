# CCTV Conversion Server: Definitive Windows Setup Guide

This guide provides the definitive instructions for building and hosting the Huchu CCTV Conversion Server on **Windows**. This setup ensures that the server starts automatically when the machine powers on, bridging Hikvision NVRs with the Huchu ERP web interface with zero manual intervention.

## 1. Prerequisites

### Hardware Configuration (User Action Required)
Ensure the following is set in your machine's **BIOS/UEFI** settings:
- **AC Power Recovery**: Set to **"Always On"** or **"Last State"**. 
  - *This ensures the computer automatically boots as soon as power is plugged in.*

### Software Requirements
- **Windows 10/11** or **Windows Server 2019+**
- **Administrator Access**
- **NSSM (Non-Sucking Service Manager)**: [Download here](https://nssm.cc/download)
- **MediaMTX (v1.9.0+)**: [Download Windows amd64 release](https://github.com/bluenviron/mediamtx/releases)

---

## 2. Server Installation

### Step 1: Create Directory Structure
1. Create a dedicated folder for the server: `C:\CCTV-Gateway`
2. Download and extract **MediaMTX** into this folder.
3. You should have `mediamtx.exe` and `mediamtx.yml` in `C:\CCTV-Gateway`.

### Step 2: Build the Signaling Server
The Signaling Server handles the communication between Huchu ERP and MediaMTX.
1. In `C:\CCTV-Gateway`, create a file named `server.js`.
2. Copy the content from the project's `cctv-gateway/server.js` into this file.
3. Open a terminal in `C:\CCTV-Gateway` and install dependencies:
   ```cmd
   npm init -y
   npm install express axios cors
   ```

### Step 3: Configure `mediamtx.yml`
Open `C:\CCTV-Gateway\mediamtx.yml` in a text editor (Notepad++ or VS Code) and update the following settings:

```yaml
# MediaMTX Configuration for Huchu ERP
logLevel: info
logDestinations: [stdout, file]
logFile: C:\CCTV-Gateway\mediamtx.log

# API for ERP Integration
api: yes
apiAddress: :9997

# RTSP Server (Internal)
rtspDisable: no
rtspAddress: :8554

# WebRTC Server (For Browser View)
webrtcDisable: no
webrtcAddress: :8889
webrtcICEServers2:
  - url: stun:stun.l.google.com:19302

# HLS Server (Moved to 8887 to avoid conflict with Signaling Gateway on port 8888)
hlsAddress: :8887

# Path configuration
paths:
  all:
    # This catch-all template ensures that all camera paths are 'configured'.
    # The Signaling Server (server.js) will provide the actual RTSP source.
    sourceOnDemand: yes
    sourceOnDemandStartTimeout: 10s
    sourceOnDemandCloseAfter: 10s
```

---

## 3. Automatic Startup (Windows Service)

To ensure the server runs as soon as Windows boots (without needing a user to log in), we will install it as a Windows Service using **NSSM**.

### Step 1: Install NSSM
1. Download NSSM and extract the `win64` folder contents to `C:\CCTV-Gateway`.

### Step 2: Create the MediaMTX Service
1. Open **PowerShell** or **Command Prompt** as **Administrator**.
2. Run the following command:
   ```cmd
   C:\CCTV-Gateway\nssm.exe install MediaMTX
   ```
3. In the NSSM window:
   - **Path**: `C:\CCTV-Gateway\mediamtx.exe`
   - **Startup directory**: `C:\CCTV-Gateway`
4. Click **Install service**.

### Step 3: Create the Signaling Gateway Service
1. Run the following command:
   ```cmd
   C:\CCTV-Gateway\nssm.exe install CCTVGateway
   ```
2. In the NSSM window:
   - **Path**: `C:\Program Files\nodejs\node.exe` (or your path to node.exe)
   - **Startup directory**: `C:\CCTV-Gateway`
   - **Arguments**: `server.js`
3. Go to the **Environment** tab and add:
   ```text
   ERP_URL=http://your-erp-domain:3000
   GATEWAY_KEY=your-secret-key
   PORT=8888
   ```
4. Click **Install service**.

### Step 4: Configure Service Recovery
1. Press `Win + R`, type `services.msc`, and hit Enter.
2. Find **CCTVGateway** in the list.
3. Right-click it -> **Properties**.
4. Go to the **Recovery** tab:
   - **First failure**: Restart the Service
   - **Second failure**: Restart the Service
   - **Subsequent failures**: Restart the Service
   - **Reset fail count after**: 1 days
   - **Restart service after**: 1 minutes
5. Click **OK**.

### Step 4: Start the Service
In the same Services window, right-click **CCTVGateway** and select **Start**.

---

## 4. Windows Firewall Configuration

You must allow traffic through the Windows Firewall for the streaming to work.

Run these commands in an **Administrator PowerShell**:

```powershell
# Allow RTSP
New-NetFirewallRule -DisplayName "CCTV RTSP" -Direction Inbound -LocalPort 8554 -Protocol TCP -Action Allow

# Allow WebRTC (TCP/UDP)
New-NetFirewallRule -DisplayName "CCTV WebRTC" -Direction Inbound -LocalPort 8889 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "CCTV WebRTC UDP" -Direction Inbound -LocalPort 8889 -Protocol UDP -Action Allow

# Allow HLS
New-NetFirewallRule -DisplayName "CCTV HLS" -Direction Inbound -LocalPort 8887 -Protocol TCP -Action Allow

# Allow API (Only for ERP Backend)
New-NetFirewallRule -DisplayName "CCTV API" -Direction Inbound -LocalPort 9997 -Protocol TCP -Action Allow
```

---

---

## 5. Verification & Testing

### 1. Check Service Status
Open PowerShell and run:
```powershell
Get-Service CCTVGateway
Get-Service MediaMTX
```
Both should be **Running**.

### 2. Manual Viewing (Browser Test)
To manually test if a stream is working, use the following URL formats in your browser (replacing the camera ID and token):

- **WebRTC (Built-in Player)**:
  `http://localhost:8889/camera-<ID>-sub/?token=<TOKEN>`
  *(Note: Do NOT add /whep for browser viewing; that is for API use only).*

- **HLS (Compatibility Test)**:
  `http://localhost:8887/camera-<ID>-sub/index.m3u8?token=<TOKEN>`

### 3. Verify API Access
Navigate to `http://localhost:9997/v3/paths/list` to see active camera paths.

---

## 6. ERP Integration

In your Huchu ERP configuration (`.env` file), configure the following variables to connect to your new gateway:

```env
# URL of your new Signaling Gateway service (port 8888)
CCTV_GATEWAY_URL=http://<MACHINE_IP>:8888

# Public URL for WebRTC (MediaMTX port 8889)
CCTV_WEBRTC_URL=http://<MACHINE_IP>:8889

# Optional: Base URL for HLS fallback (MediaMTX port 8887)
CCTV_HLS_BASE_URL=http://<MACHINE_IP>:8887

# Secret key matching the one you set in Step 3
GATEWAY_KEY=your-secret-key
```

---

## 7. Maintenance & Troubleshooting

### Log Rotation
MediaMTX logs to `C:\CCTV-Gateway\mediamtx.log`. Over time, this file can grow. 
- **Recommendation**: Periodically check the file size or configure a script to truncate it weekly.

### Common Issues
- **Machine doesn't turn on**: Re-verify BIOS "AC Power Recovery" settings.
- **Video doesn't load in browser**: Check if port 8889 is open and if the NVR credentials are correct.
- **Service won't start**: Check `mediamtx.log` for port conflicts (e.g., if something else is using 8554).

---

**Last Updated**: March 2026  
**Status**: Production Ready  
**Deployment**: Windows-based Dedicated Gateway

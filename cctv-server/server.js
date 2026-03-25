/**
 * Huchu CCTV Gateway - Windows Signaling Server
 */

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(express.text({ type: 'application/sdp' }));
app.use(cors());

const ERP_URL = process.env.ERP_URL || 'http://localhost:3000';
const MTX_API_URL = process.env.MTX_API_URL || 'http://localhost:9997';
const MTX_WEBRTC_PORT = process.env.MTX_WEBRTC_PORT || '8889';
const PORT = process.env.PORT || 8888;

/**
 * Sync Path with MediaMTX
 */
async function syncMtxPath(streamPath, rtspUrl) {
  try {
    console.log(`[CCTV Gateway] Syncing MediaMTX path: ${streamPath}`);
    
    // Ensure the # in the password is encoded for MediaMTX (Go) to parse it correctly
    // We only encode the credential part, not the whole URL
    const urlMatch = rtspUrl.match(/^(rtsp:\/\/)(.*):(.*)@(.*)$/);
    let finalUrl = rtspUrl;
    if (urlMatch) {
      const [, proto, user, pass, rest] = urlMatch;
      // We encode specifically for the Go parser in MediaMTX
      finalUrl = `${proto}${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${rest}`;
    }

    try {
      await axios.delete(`${MTX_API_URL}/v3/config/paths/delete/${streamPath}`);
    } catch (e) {}

    // Use 'sourceProtocol' (not rtspTransport) for the API
    await axios.post(`${MTX_API_URL}/v3/config/paths/add/${streamPath}`, {
      source: finalUrl,
      sourceOnDemand: true,
      sourceProtocol: "automatic", // Let it negotiate like VLC does
      sourceOnDemandStartTimeout: "30s"
    });
    
    console.log(`[CCTV Gateway] Path successfully configured.`);
    return true;
  } catch (error) {
    console.error(`[CCTV Gateway] MediaMTX Config Error: ${error.message}`);
    return false;
  }
}

app.post('/api/stream/webrtc', async (req, res) => {
  try {
    const { cameraId, streamType, offer, token } = req.body;
    const streamPath = `camera-${cameraId}-${streamType}`;
    
    const resp = await axios.post(`${ERP_URL}/api/cctv/streams/config`, { cameraId, token }, {
      headers: { 'x-gateway-key': process.env.GATEWAY_KEY || 'default-key' }
    });

    await syncMtxPath(streamPath, resp.data.rtspUrl);

    const mtxResponse = await axios.post(`http://localhost:${MTX_WEBRTC_PORT}/${streamPath}/whep`, offer, {
      headers: { 'Content-Type': 'application/sdp' },
      responseType: 'text'
    });

    res.json({ answer: mtxResponse.data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/whep/:streamPath', async (req, res) => {
  try {
    const { streamPath } = req.params;
    const token = req.query.token;
    const match = streamPath.match(/^camera-(.+)-(main|sub|third)$/);
    const [, cameraId, streamType] = match;

    const resp = await axios.post(`${ERP_URL}/api/cctv/streams/config`, { cameraId, token }, {
      headers: { 'x-gateway-key': process.env.GATEWAY_KEY || 'default-key' }
    });
    
    await syncMtxPath(streamPath, resp.data.rtspUrl);
    res.redirect(`http://${req.get('host').split(':')[0]}:8889/${streamPath}/?token=${token}`);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.post('/whep/:streamPath', async (req, res) => {
  try {
    const { streamPath } = req.params;
    const token = req.query.token;
    const match = streamPath.match(/^camera-(.+)-(main|sub|third)$/);
    const [, cameraId, streamType] = match;

    const resp = await axios.post(`${ERP_URL}/api/cctv/streams/config`, { cameraId, token }, {
      headers: { 'x-gateway-key': process.env.GATEWAY_KEY || 'default-key' }
    });
    
    await syncMtxPath(streamPath, resp.data.rtspUrl);

    const mtxResponse = await axios.post(`http://localhost:${MTX_WEBRTC_PORT}/${streamPath}/whep`, req.body, {
      headers: { 'Content-Type': 'application/sdp' },
      responseType: 'text'
    });

    res.send(mtxResponse.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`[CCTV Gateway] Running on port ${PORT}`));

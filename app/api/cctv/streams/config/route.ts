import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseStreamToken, generateRTSPUrl } from "@/lib/cctv-utils";
import { StreamType } from "@/lib/cctv-types";

/**
 * POST /api/cctv/streams/config
 * Internal endpoint for the CCTV Gateway to fetch camera configuration.
 * Secured via a gateway key.
 */
export async function POST(request: NextRequest) {
  try {
    const gatewayKey = request.headers.get("x-gateway-key");
    const expectedKey = process.env.GATEWAY_KEY || "default-key";

    if (gatewayKey !== expectedKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { cameraId, token } = await request.json();

    if (!cameraId || !token) {
      return NextResponse.json(
        { error: "cameraId and token are required" },
        { status: 400 },
      );
    }

    // Verify token
    const tokenData = parseStreamToken(token);
    if (!tokenData || tokenData.cameraId !== cameraId) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 403 },
      );
    }

    // Fetch camera and NVR config
    const camera = await prisma.camera.findUnique({
      where: { id: cameraId },
      include: { nvr: true },
    });

    if (!camera || !camera.nvr) {
      return NextResponse.json(
        { error: "Camera or NVR not found" },
        { status: 404 },
      );
    }

    const rtspUrl = generateRTSPUrl(
      {
        host: camera.nvr.ipAddress,
        port: camera.nvr.rtspPort,
        username: camera.nvr.username,
        password: camera.nvr.password,
      },
      camera.channelNumber,
      tokenData.streamType as StreamType,
      true, // Changed to true for ISAPI compatibility
    );
    const streamTypeCode =
      tokenData.streamType === StreamType.MAIN
        ? 1
        : tokenData.streamType === StreamType.SUB
          ? 2
          : 3;
    const channelId = camera.channelNumber * 100 + streamTypeCode;
    const snapshotUrl = `http://${camera.nvr.ipAddress}:${camera.nvr.httpPort}/ISAPI/Streaming/channels/${channelId}/picture`;

    return NextResponse.json({
      cameraId: camera.id,
      streamType: tokenData.streamType,
      rtspUrl,
      snapshotConfig: {
        url: snapshotUrl,
        username: camera.nvr.username,
        password: camera.nvr.password,
      },
    });
  } catch (error) {
    console.error("Error in CCTV gateway config endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

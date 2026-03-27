import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  generateOverviewRTSPUrl,
  parseOverviewToken,
} from "@/lib/cctv-utils";

export async function POST(request: NextRequest) {
  try {
    const gatewayKey = request.headers.get("x-gateway-key");
    const expectedKey = process.env.GATEWAY_KEY || "default-key";

    if (gatewayKey !== expectedKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { nvrId, token } = await request.json();

    if (!nvrId || !token) {
      return NextResponse.json(
        { error: "nvrId and token are required" },
        { status: 400 },
      );
    }

    const tokenData = parseOverviewToken(token);
    if (!tokenData || tokenData.nvrId !== nvrId) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 403 },
      );
    }

    const nvr = await prisma.nVR.findUnique({
      where: { id: nvrId },
    });

    if (!nvr) {
      return NextResponse.json(
        { error: "NVR not found" },
        { status: 404 },
      );
    }

    const rtspUrl = generateOverviewRTSPUrl({
      host: nvr.ipAddress,
      port: nvr.rtspPort,
      username: nvr.username,
      password: nvr.password,
    });
    const snapshotUrl = `http://${nvr.ipAddress}:${nvr.httpPort}/ISAPI/Streaming/channels/001/picture`;

    return NextResponse.json({
      nvrId: nvr.id,
      rtspUrl,
      snapshotConfig: {
        url: snapshotUrl,
        username: nvr.username,
        password: nvr.password,
      },
    });
  } catch (error) {
    console.error("Error in overview stream config endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

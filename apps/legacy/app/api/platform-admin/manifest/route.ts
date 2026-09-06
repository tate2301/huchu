import { NextResponse } from "next/server";
import { PLATFORM_ADMIN_MANIFEST } from "@/lib/admin-portal/manifest";
import { requirePlatformAdminAccess } from "../_auth";

export async function GET(request: Request) {
  const access = await requirePlatformAdminAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  return NextResponse.json({ manifest: PLATFORM_ADMIN_MANIFEST });
}

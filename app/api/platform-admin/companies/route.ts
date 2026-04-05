import { NextResponse } from "next/server";
import { createPlatformServices } from "@/scripts/platform/services";
import { requirePlatformAdminAccess } from "../_auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requirePlatformAdminAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const services = createPlatformServices();
  try {
    const rows = await services.org.list({ limit: 200 });
    const companies = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      updatedAt: row.updatedAt,
    }));

    return NextResponse.json({ companies });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load organizations";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

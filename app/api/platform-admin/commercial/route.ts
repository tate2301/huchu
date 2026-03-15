import { NextResponse } from "next/server";
import { createPlatformServices } from "@/scripts/platform/services";
import { requirePlatformAdminAccess } from "../_auth";

export const runtime = "nodejs";

export async function GET() {
  const access = await requirePlatformAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const services = createPlatformServices();
  try {
    const [subscriptions, plans, templates, bundleCatalog, featureCatalog] = await Promise.all([
      services.subscription.list({ limit: 100 }),
      services.subscription.listPlans(),
      services.subscription.listTemplates(),
      services.subscription.listBundleCatalog(),
      services.feature.list(),
    ]);

    return NextResponse.json({
      subscriptions,
      plans,
      templates,
      bundleCatalog,
      featureCatalog,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load commercial center";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

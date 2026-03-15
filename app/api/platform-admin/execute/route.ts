import { NextResponse } from "next/server";
import { createPlatformServices } from "@/scripts/platform/services";
import { requirePlatformAdminAccess } from "../_auth";

export const runtime = "nodejs";

type ExecuteBody = {
  module: keyof ReturnType<typeof createPlatformServices>;
  action: string;
  payload?: unknown;
  args?: unknown[];
};

export async function POST(request: Request) {
  const access = await requirePlatformAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: ExecuteBody;
  try {
    body = (await request.json()) as ExecuteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.module || !body?.action) {
    return NextResponse.json({ error: "module and action are required" }, { status: 400 });
  }

  const services = createPlatformServices();

  try {
    const scopedModule = services[body.module] as Record<string, unknown> | undefined;
    if (!scopedModule) {
      return NextResponse.json({ error: `Unknown module: ${body.module}` }, { status: 404 });
    }

    const operation = scopedModule[body.action];
    if (typeof operation !== "function") {
      return NextResponse.json({ error: `Unknown action: ${body.module}.${body.action}` }, { status: 404 });
    }

    let result: unknown;
    if (Array.isArray(body.args)) {
      result = await (operation as (...args: unknown[]) => Promise<unknown> | unknown)(...body.args);
    } else if (body.payload !== undefined) {
      result = await (operation as (payload: unknown) => Promise<unknown> | unknown)(body.payload);
    } else {
      result = await (operation as () => Promise<unknown> | unknown)();
    }

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

import { requireApiAuth } from "@/lib/auth-core/guards";

export async function requirePlatformAdminAccess(request: Request) {
  const result = await requireApiAuth({
    request,
    requireAdmin: true,
  });
  if ("session" in result) {
    return { ok: true as const, session: result.session };
  }

  const payload = await result.json();
  return {
    ok: false as const,
    status: result.status,
    error: payload?.error ?? "Unauthorized",
  };
}

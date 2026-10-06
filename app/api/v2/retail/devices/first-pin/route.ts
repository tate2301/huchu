import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/auth-core/rate-limit";
import { trustedClientAddress } from "@/lib/platform/client-address";
import { requireHostDevice, setFirstTillPin } from "@/lib/retail/devices";

const firstPinInput = z.object({
  userId: z.string().uuid(),
  password: z.string().min(1).max(200),
  /** Four digits; `tillPinDenial` owns what a PIN may be. */
  pin: z.string().min(1).max(12),
});

/** Ten tries per person, per device and address, every 15 minutes. */
const FIRST_PIN_LIMIT = 10;
const FIRST_PIN_WINDOW_MS = 15 * 60 * 1000;

/**
 * A first PIN, set on the till by someone it offers who has none yet ("Who
 * is selling?" → their name → password → PIN twice). No session: the device
 * key says which till, the account password says who (`setFirstTillPin`).
 * Rate limited, since a password is being checked. Then the till signs them
 * in with the new PIN (`till-pin`).
 */
export async function POST(request: NextRequest) {
  const { device, response } = await requireHostDevice(request);
  if (response) return response as NextResponse;

  const parsed = firstPinInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.issues);

  const limit = checkRateLimit({
    key: `till-first-pin:${device.id}:${parsed.data.userId}:${trustedClientAddress(request.headers)}`,
    limit: FIRST_PIN_LIMIT,
    windowMs: FIRST_PIN_WINDOW_MS,
  });
  if (!limit.allowed) {
    return errorResponse("Too many tries. Wait a few minutes, or ask a manager.", 429, { retryAfterSeconds: limit.retryAfterSeconds });
  }

  try {
    const result = await setFirstTillPin(device, parsed.data);
    if (!result.ok) return errorResponse(result.error, result.status);
    return successResponse({ ok: true }, 201);
  } catch {
    // The message is not echoed: an exception raised while a PIN is in scope can end up in a log with the digits.
    console.error("[API] POST /api/v2/retail/devices/first-pin failed");
    return errorResponse("Could not save that PIN. Try again.");
  }
}

import type { CredentialsConfig } from "next-auth/providers/credentials";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `till-pin` provider (10-setup W-04 step 7): a PIN, or the account
 * password instead, at a paired till on the POS host, with every try counted
 * by the sign-in rate limit on the address our own edge saw. Which till and
 * which person are `lib/retail/devices.ts`'s questions, tested in
 * `devices.test.ts`; here they are stand-ins.
 */

const USER = {
  id: "8d6c5f3e-2a1b-4c9d-9e8f-7a6b5c4d3e2f",
  email: "chipo@till.test",
  name: "Chipo Dube",
  password: "hash",
  role: "SHOP_MANAGER",
  companyId: "company-1",
  isActive: true,
  image: null,
};
const DEVICE = { id: "device-1", companyId: "company-1", registerId: "till-1" };

const checks = vi.hoisted(() => ({ pin: vi.fn(), password: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === USER.id ? { email: USER.email } : null)),
      findFirst: vi.fn(async () => USER),
    },
  },
}));
vi.mock("@/lib/retail/devices", () => ({ checkTillPinSignIn: checks.pin, checkTillPasswordSignIn: checks.password }));
vi.mock("@/lib/auth-core/sign-in-scope", () => ({ resolveSignInScope: async () => ({ ok: true, companyId: USER.companyId }) }));
vi.mock("@/lib/platform/features", () => ({ hasFeature: async () => true }));
vi.mock("@/lib/platform/subscription", () => ({ getSubscriptionHealth: async () => ({ shouldBlock: false }) }));
vi.mock("@/lib/auth-core/events", () => ({ logAuthEvent: async () => undefined }));
vi.mock("@/lib/platform/tenant", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform/tenant")>()),
  getTenantClaimsForCompany: async () => ({ tenantStatus: "ACTIVE" }),
}));

vi.stubEnv("PLATFORM_ROOT_DOMAIN", "apps.localtest.me");
vi.stubEnv("VERCEL", "");

const { authOptions } = await import("./auth");

// NextAuth reads a credentials provider's own id from its options when it starts.
const provider = authOptions.providers.find(
  (entry) => (entry as unknown as CredentialsConfig).options?.id === "till-pin",
) as unknown as CredentialsConfig;
const authorize = provider.options!.authorize as (
  credentials: Record<string, string>,
  req: { headers: Record<string, string> },
) => Promise<Record<string, unknown> | null>;

const POS_HOST = "pos.corner.apps.localtest.me";
const headers = (options: { host?: string; address?: string } = {}) => ({
  host: options.host ?? POS_HOST,
  cookie: "tender_device=the-key; other=1",
  // A client can put anything on the left; our edge appends what it saw.
  "x-forwarded-for": `${Math.random()}, ${options.address ?? "10.1.1.1"}`,
});

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected a refusal");
}

beforeEach(() => {
  globalThis.__authRateLimitBuckets__ = undefined;
  checks.pin.mockReset().mockResolvedValue({ ok: true, device: DEVICE });
  checks.password.mockReset().mockResolvedValue({ ok: true, device: DEVICE });
});

describe("signing in at the till", () => {
  it("signs a person in with their PIN, bound to the device, and reads the key from the cookie", async () => {
    const user = await authorize({ userId: USER.id, pin: "2580" }, { headers: headers() });
    expect(user).toMatchObject({ id: USER.id, authStrategy: "till-pin", deviceId: "device-1", registerId: "till-1", rememberMe: false });
    expect(checks.pin).toHaveBeenCalledWith(expect.objectContaining({ deviceKey: "the-key", userId: USER.id }));
    expect(checks.password).not.toHaveBeenCalled();
  });

  it("takes the account password instead of a locked PIN, and leaves the PIN alone", async () => {
    const user = await authorize({ userId: USER.id, password: "their password" }, { headers: headers() });
    expect(user).toMatchObject({ id: USER.id, deviceId: "device-1" });
    expect(checks.password).toHaveBeenCalledWith(expect.objectContaining({ deviceKey: "the-key", userId: USER.id }));
    expect(checks.pin).not.toHaveBeenCalled();

    checks.password.mockResolvedValue({ ok: false, reason: "WRONG_PASSWORD" });
    expect(await refusal(authorize({ userId: USER.id, password: "wrong" }, { headers: headers() }))).toBe("WRONG_PASSWORD");
  });

  it("says how many tries a wrong PIN leaves, and that a PIN is locked", async () => {
    checks.pin.mockResolvedValue({ ok: false, reason: "WRONG_PIN", triesLeft: 3 });
    expect(await refusal(authorize({ userId: USER.id, pin: "1111" }, { headers: headers() }))).toBe("WRONG_PIN:3");
    checks.pin.mockResolvedValue({ ok: false, reason: "LOCKED" });
    expect(await refusal(authorize({ userId: USER.id, pin: "1111" }, { headers: headers() }))).toBe("LOCKED");
  });

  it("works on the POS host only", async () => {
    const elsewhere = headers({ host: "corner.apps.localtest.me" });
    expect(await refusal(authorize({ userId: USER.id, pin: "2580" }, { headers: elsewhere }))).toBe("NOT_A_TILL");
    expect(checks.pin).not.toHaveBeenCalled();
  });

  it("counts every try against the rate limit, on the address our edge saw", async () => {
    checks.pin.mockResolvedValue({ ok: false, reason: "WRONG_PIN", triesLeft: 4 });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(await refusal(authorize({ userId: USER.id, pin: "1111" }, { headers: headers() }))).toBe("WRONG_PIN:4");
    }
    // A fresh first x-forwarded-for entry each time does not start a new count.
    expect(await refusal(authorize({ userId: USER.id, password: "guess" }, { headers: headers() }))).toBe("AUTH_RATE_LIMITED");
    expect(checks.password).not.toHaveBeenCalled();
    // Another address has its own.
    expect(await authorize({ userId: USER.id, password: "right" }, { headers: headers({ address: "10.2.2.2" }) })).toMatchObject({ id: USER.id });
  });

  it("refuses a person nobody knows without asking the till", async () => {
    expect(await refusal(authorize({ userId: "someone", pin: "2580" }, { headers: headers() }))).toBe("NOT_ON_THIS_TILL");
    expect(checks.pin).not.toHaveBeenCalled();
  });
});

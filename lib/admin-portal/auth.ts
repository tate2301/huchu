import { createHash, randomBytes } from "crypto";
import type { Adapter } from "next-auth/adapters";
import { authOptions } from "@/lib/auth";
import { getAuthRuntimeConfig } from "@/lib/auth-core/config";
import { assertStrategyEnabled } from "@/lib/auth-core/strategy-registry";

type EmailProviderLike = {
  id: string;
  type: string;
  maxAge?: number;
  secret?: string;
  sendVerificationRequest: (params: {
    identifier: string;
    token: string;
    expires: Date;
    url: string;
    provider: unknown;
    theme?: unknown;
  }) => Promise<void>;
  generateVerificationToken?: () => Promise<string> | string;
};

type VerificationAdapter = Adapter & {
  createVerificationToken: NonNullable<Adapter["createVerificationToken"]>;
};

function getAdminEmailProvider(): EmailProviderLike {
  const provider = authOptions.providers.find((candidate) => candidate.id === "email") as EmailProviderLike | undefined;
  if (!provider?.sendVerificationRequest) {
    throw new Error("Admin email-link provider is unavailable.");
  }
  return provider;
}

function getVerificationAdapter(): VerificationAdapter {
  const adapter = authOptions.adapter as Adapter | undefined;
  if (!adapter?.createVerificationToken) {
    throw new Error("Verification-token adapter is unavailable.");
  }
  return adapter as VerificationAdapter;
}

function hashVerificationToken(token: string, provider: EmailProviderLike) {
  const secret = provider.secret ?? authOptions.secret;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required for admin magic links.");
  }

  return createHash("sha256")
    .update(`${token}${secret}`)
    .digest("hex");
}

export async function requestAdminMagicLink(options: {
  origin: string;
  callbackUrl: string;
}) {
  assertStrategyEnabled("admin-email-link");

  const runtimeConfig = getAuthRuntimeConfig();
  const provider = getAdminEmailProvider();
  const adapter = getVerificationAdapter();
  const identifier = runtimeConfig.adminPortalEmail;

  if (!identifier) {
    throw new Error("ADMIN_PORTAL_EMAIL is required for admin sign-in.");
  }

  const token = (await provider.generateVerificationToken?.()) ?? randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + (provider.maxAge ?? 86400) * 1000);
  const params = new URLSearchParams({
    callbackUrl: options.callbackUrl,
    token,
    email: identifier,
  });
  const url = `${options.origin}/api/auth/callback/${provider.id}?${params}`;

  await Promise.all([
    provider.sendVerificationRequest({
      identifier,
      token,
      expires,
      url,
      provider,
    }),
    adapter.createVerificationToken({
      identifier,
      token: hashVerificationToken(token, provider),
      expires,
    }),
  ]);
}

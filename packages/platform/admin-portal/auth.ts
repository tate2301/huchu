import { createHash, randomBytes } from "crypto";
import type { Adapter } from "next-auth/adapters";
import type { NextAuthOptions } from "next-auth";
import { resolveAuthOptions } from "../auth-core/auth-options";
import { getAuthRuntimeConfig } from "../auth-core/config";
import { normalizeCallbackUrl } from "../auth-core/redirects";
import { assertStrategyEnabled } from "../auth-core/strategy-registry";

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

function getAdminEmailProvider(authOptions: NextAuthOptions): EmailProviderLike {
  const provider = authOptions.providers.find((candidate) => candidate.id === "email") as EmailProviderLike | undefined;
  if (!provider?.sendVerificationRequest) {
    throw new Error("Admin email-link provider is unavailable.");
  }
  return provider;
}

function getVerificationAdapter(authOptions: NextAuthOptions): VerificationAdapter {
  const adapter = authOptions.adapter as Adapter | undefined;
  if (!adapter?.createVerificationToken) {
    throw new Error("Verification-token adapter is unavailable.");
  }
  return adapter as VerificationAdapter;
}

function hashVerificationToken(token: string, provider: EmailProviderLike, authOptions: NextAuthOptions) {
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
  email: string;
}) {
  assertStrategyEnabled("admin-email-link");

  const authOptions = await resolveAuthOptions();
  const runtimeConfig = getAuthRuntimeConfig();
  const provider = getAdminEmailProvider(authOptions);
  const adapter = getVerificationAdapter(authOptions);
  const identifier = options.email.trim().toLowerCase();

  if (!identifier) {
    throw new Error("Email is required.");
  }

  if (!runtimeConfig.adminPortalAllowedEmails.includes(identifier)) {
    throw new Error("This email is not allowed for admin sign-in.");
  }

  const normalizedCallbackPath = normalizeCallbackUrl(options.callbackUrl, "/admin/dashboard");
  const callbackUrl = new URL(normalizedCallbackPath, `${options.origin}/`).toString();
  const token = (await provider.generateVerificationToken?.()) ?? randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + (provider.maxAge ?? 86400) * 1000);
  const params = new URLSearchParams({
    callbackUrl,
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
      token: hashVerificationToken(token, provider, authOptions),
      expires,
    }),
  ]);
}

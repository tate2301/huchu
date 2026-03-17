import type { AuthStrategyId } from "@/lib/auth-core/types";

export type AuthRuntimeConfig = {
  nextAuthSecret: string;
  adminPortalEmail: string;
  adminPortalCompanyId?: string;
  adminPortalActorName?: string;
  adminMagicLinkFrom: string;
  adminMagicLinkResendApiKey?: string;
  adminMagicLinkWebhookUrl?: string;
  enableEmailLink: boolean;
  enableOtp: boolean;
};

const DEFAULT_ADMIN_EMAIL = "thehalfstackdev@gmail.com";
let didValidateAuthConfiguration = false;

export function getAuthRuntimeConfig(): AuthRuntimeConfig {
  return {
    nextAuthSecret: process.env.NEXTAUTH_SECRET?.trim() || "",
    adminPortalEmail: process.env.ADMIN_PORTAL_EMAIL?.trim().toLowerCase() || DEFAULT_ADMIN_EMAIL,
    adminPortalCompanyId: process.env.ADMIN_PORTAL_COMPANY_ID?.trim() || undefined,
    adminPortalActorName: process.env.ADMIN_PORTAL_ACTOR_NAME?.trim() || undefined,
    adminMagicLinkFrom: process.env.ADMIN_MAGIC_LINK_FROM?.trim() || "no-reply@pagka.dev",
    adminMagicLinkResendApiKey: process.env.ADMIN_MAGIC_LINK_RESEND_API_KEY?.trim() || undefined,
    adminMagicLinkWebhookUrl: process.env.ADMIN_MAGIC_LINK_WEBHOOK_URL?.trim() || undefined,
    enableEmailLink: process.env.AUTH_ENABLE_EMAIL_LINK === "true",
    enableOtp: process.env.AUTH_ENABLE_OTP === "true",
  };
}

function isStrategyEnabled(config: AuthRuntimeConfig, strategyId: AuthStrategyId): boolean {
  if (strategyId === "email-link") {
    return config.enableEmailLink;
  }
  if (strategyId === "otp") {
    return config.enableOtp;
  }
  return true;
}

export function validateAuthConfiguration(): void {
  if (didValidateAuthConfiguration) {
    return;
  }

  const config = getAuthRuntimeConfig();
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.nextAuthSecret) {
    errors.push("NEXTAUTH_SECRET is required.");
  }

  if (isStrategyEnabled(config, "admin-email-link") && !config.adminPortalEmail) {
    errors.push("ADMIN_PORTAL_EMAIL is required for the admin email-link strategy.");
  }

  if (
    isStrategyEnabled(config, "admin-email-link") &&
    !config.adminMagicLinkResendApiKey &&
    !config.adminMagicLinkWebhookUrl
  ) {
    warnings.push("Admin magic-link delivery is not configured. Magic-link requests will fail until ADMIN_MAGIC_LINK_RESEND_API_KEY or ADMIN_MAGIC_LINK_WEBHOOK_URL is set.");
  }

  if (config.enableOtp) {
    warnings.push("AUTH_ENABLE_OTP is enabled, but OTP delivery/verification plumbing is not live yet.");
  }

  if (warnings.length > 0) {
    for (const warning of warnings) {
      console.warn(`[auth] ${warning}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }

  didValidateAuthConfiguration = true;
}

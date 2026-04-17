"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { normalizeCallbackUrl } from "@/lib/auth-redirect";
import {
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Storefront,
} from "@/lib/icons";

type PortalLoginFormProps = {
  portalTitle: string;
  portalDescription?: string;
  portalIcon: React.ReactNode;
  companyLabel: string;
  redirectTo: string;
  helpText?: string;
  callbackUrl?: string;
  rememberMeEnabled?: boolean;
};

type AuthErrorPayload = {
  code?: string;
  error?: string;
  message?: string;
};

function getAuthErrorMessage(rawError: string) {
  switch (rawError) {
    case "TENANT_HOST_REQUIRED":
      return "Use your organization URL to sign in.";
    case "TENANT_NOT_FOUND":
      return "This organization URL is not recognized.";
    case "TENANT_INACTIVE":
      return "This organization is currently inactive. Contact your administrator.";
    case "CredentialsSignin":
    case "Invalid credentials":
      return "Invalid email or password.";
    case "AUTH_EMAIL_NOT_FOUND":
      return "No account found for this email.";
    case "AUTH_PASSWORD_NOT_SET":
      return "This account has no password set. Contact your school administrator.";
    case "AUTH_PASSWORD_MISMATCH":
      return "Password does not match. Please try again.";
    case "AUTH_RATE_LIMITED":
      return "Too many sign-in attempts. Please wait a few minutes and try again.";
    case "POS_CASHIER_REQUIRED":
    case "POS_PORTAL_ACCESS_REQUIRED":
      return "This account does not have access to the POS portal yet.";
    default:
      return rawError;
  }
}

async function getCredentialsPrecheckError(): Promise<string | null> {
  try {
    const response = await fetch("/api/auth/credentials-precheck", {
      method: "GET",
      cache: "no-store",
    });

    if (response.ok) {
      return null;
    }

    const payload = (await response.json()) as AuthErrorPayload;
    return payload.code || payload.error || payload.message || "An error occurred. Please try again.";
  } catch {
    return null;
  }
}

export function PortalLoginForm({
  portalTitle,
  portalDescription,
  portalIcon,
  companyLabel,
  redirectTo,
  helpText,
  callbackUrl,
  rememberMeEnabled = true,
}: PortalLoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const resolvedCallbackUrl = normalizeCallbackUrl(callbackUrl, redirectTo);
  const isSubmitDisabled = loading || email.trim().length === 0 || password.length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const precheckError = await getCredentialsPrecheckError();
      if (precheckError) {
        setError(getAuthErrorMessage(precheckError));
        return;
      }

      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        rememberMe: rememberMe ? "true" : "false",
        callbackUrl: resolvedCallbackUrl,
        redirect: false,
      });

      if (result?.error) {
        setError(getAuthErrorMessage(result.error));
      } else {
        router.push(result?.url ?? resolvedCallbackUrl);
        router.refresh();
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--surface-muted)] px-4 py-6 text-[var(--text-strong)] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[30rem] items-center justify-center">
        <div className="w-full rounded-[28px] border border-[var(--border-default)] bg-[var(--surface-base)] p-6 shadow-[0_24px_64px_rgba(15,23,42,0.08)] sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                {portalTitle}
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-strong)]">
                {companyLabel}
              </h1>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {portalDescription || "Sign in to continue."}
              </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--action-primary-bg)_9%,white)] text-[var(--action-primary-bg)]">
              {portalIcon ?? <Storefront className="h-5 w-5" />}
            </div>
          </div>

          {error ? (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--status-error-text)_24%,white)] bg-[var(--status-error-bg)] px-4 py-3 text-[var(--status-error-text)]">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm leading-6">{error}</p>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="portal-email">Work email</Label>
              <Input
                id="portal-email"
                type="email"
                placeholder="name@company.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="h-12 rounded-2xl bg-[color-mix(in_srgb,var(--surface-muted)_72%,white)]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="portal-password">Password</Label>
                <button
                  type="button"
                  className="text-xs font-semibold text-[var(--action-primary-bg)] transition-colors hover:text-[var(--action-primary-hover)]"
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={loading}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <Input
                id="portal-password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={(e) => setCapsLockOn(e.getModifierState("CapsLock"))}
                onKeyDown={(e) => setCapsLockOn(e.getModifierState("CapsLock"))}
                required
                disabled={loading}
                className="h-12 rounded-2xl bg-[color-mix(in_srgb,var(--surface-muted)_72%,white)]"
              />
              {capsLockOn ? (
                <p className="text-xs font-medium text-[var(--status-warning-text)]">
                  Caps Lock is on.
                </p>
              ) : null}
            </div>

            {rememberMeEnabled ? (
              <label className="flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface-muted)_64%,white)] px-4 py-3 text-sm text-[var(--text-strong)]">
                <Checkbox
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                  disabled={loading}
                />
                <span>Keep this device signed in</span>
              </label>
            ) : null}

            <Button
              type="submit"
              className="h-12 w-full rounded-2xl text-sm"
              size="lg"
              disabled={isSubmitDisabled}
            >
              {loading ? "Signing in..." : "Continue"}
              {!loading ? <ArrowRight className="h-4 w-4" /> : null}
            </Button>
          </form>

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface-muted)_58%,white)] px-4 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-base)] text-[var(--status-success-text)]">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <p className="text-sm leading-6 text-[var(--text-muted)]">
              {helpText ?? "Contact your administrator if you need access."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

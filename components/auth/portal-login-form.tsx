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
  CheckCircle2,
  Clock,
  ReceiptLong,
  ShieldCheck,
  Storefront,
} from "@/lib/icons";

type PortalLoginFormProps = {
  portalTitle: string;
  portalDescription: string;
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
    <div className="min-h-screen bg-[var(--surface-muted)] p-3 text-[var(--text-strong)] sm:p-4 lg:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-7xl">
        <div className="grid w-full overflow-hidden rounded-[32px] border border-[var(--border-default)] bg-[var(--surface-base)] shadow-[0_24px_80px_rgba(15,23,42,0.08)] lg:grid-cols-[minmax(0,1.15fr)_minmax(26rem,0.85fr)]">
          <section className="relative flex flex-col justify-between overflow-hidden bg-[linear-gradient(145deg,color-mix(in_srgb,var(--action-primary-bg)_10%,white)_0%,color-mix(in_srgb,var(--status-success-bg)_55%,white)_100%)] p-6 sm:p-8 lg:p-10">
            <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--action-primary-bg)_18%,transparent)_0%,transparent_70%)]" />
            <div className="relative flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-base)] text-[var(--action-primary-bg)] shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                {portalIcon}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  {portalTitle}
                </p>
                <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                  {companyLabel}
                </h1>
              </div>
            </div>

            <div className="relative mt-10 max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--action-primary-bg)]">
                Open the floor without friction
              </p>
              <h2 className="mt-4 max-w-xl text-4xl font-semibold tracking-[-0.05em] text-[var(--text-strong)] sm:text-5xl">
                Checkout, held carts, shift control, and price checks in one focused flow.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-[var(--text-muted)] sm:text-lg">
                {portalDescription}
              </p>
            </div>

            <div className="relative mt-10 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
              <div className="rounded-[28px] border border-[color-mix(in_srgb,var(--border-default)_88%,white)] bg-[color-mix(in_srgb,var(--surface-base)_84%,white)] p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-strong)]">Today&apos;s station</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">Clean access for front-of-house and store leadership.</p>
                  </div>
                  <div className="rounded-full bg-[color-mix(in_srgb,var(--status-success-bg)_88%,white)] px-3 py-1 text-xs font-semibold text-[var(--status-success-text)]">
                    Live
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {[
                    {
                      icon: ReceiptLong,
                      label: "Checkout ready",
                      detail: "Sell fast, suspend carts, and recover transactions without leaving the lane.",
                    },
                    {
                      icon: ShieldCheck,
                      label: "Role-aware access",
                      detail: "Cashiers, shop managers, managers, and approved retail staff can sign in here.",
                    },
                    {
                      icon: Clock,
                      label: "Shift continuity",
                      detail: "Keep tills moving while preserving the controls needed for overrides and audits.",
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-start gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-base)] px-4 py-3"
                    >
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--action-primary-bg)_10%,white)] text-[var(--action-primary-bg)]">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-strong)]">{item.label}</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-[color-mix(in_srgb,var(--border-default)_84%,white)] bg-[color-mix(in_srgb,var(--surface-base)_78%,white)] p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Access checklist
                </p>
                <div className="mt-4 space-y-3">
                  {[
                    "Use your company email and password.",
                    "Check you are on the correct store URL.",
                    "If your account was just created, ask an admin to confirm role access.",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3 text-sm leading-6 text-[var(--text-strong)]">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-success-text)]" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-base)] px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    Best for
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-strong)]">
                    Retail teams that need a fast, calm selling surface with stronger oversight than a cashier-only lane.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="flex items-center justify-center p-4 sm:p-6 lg:p-8">
            <div className="w-full max-w-md">
              <div className="rounded-[30px] border border-[var(--border-default)] bg-[var(--surface-base)] p-6 shadow-[0_24px_64px_rgba(15,23,42,0.08)] sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      Secure sign in
                    </p>
                    <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-strong)]">
                      Enter the POS
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
                      Continue with the same account you use for retail operations.
                    </p>
                  </div>
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--action-primary-bg)_9%,white)] text-[var(--action-primary-bg)]">
                    <Storefront className="h-6 w-6" />
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
                        {showPassword ? "Hide password" : "Show password"}
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
                    <label className="flex items-start gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface-muted)_64%,white)] px-4 py-3 text-sm text-[var(--text-strong)]">
                      <Checkbox
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(checked === true)}
                        disabled={loading}
                        className="mt-0.5"
                      />
                      <span className="leading-6">
                        Keep this device signed in for faster shift handoff and resume.
                      </span>
                    </label>
                  ) : null}

                  <Button
                    type="submit"
                    className="h-12 w-full rounded-2xl text-sm"
                    size="lg"
                    disabled={isSubmitDisabled}
                  >
                    {loading ? "Signing in..." : "Continue to POS"}
                    {!loading ? <ArrowRight className="h-4 w-4" /> : null}
                  </Button>
                </form>

                <div className="mt-6 rounded-2xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--status-success-bg)_44%,white)] px-4 py-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-base)] text-[var(--status-success-text)]">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-strong)]">
                        Designed for staffed counters
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                        {helpText ?? "Contact your administrator if you need access."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <CheckCircle2 className="h-4 w-4 text-[var(--status-success-text)]" />
                <span>Credentials stay scoped to your company host and POS portal access rules.</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

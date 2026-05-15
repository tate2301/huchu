"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { normalizeCallbackUrl } from "@/lib/auth-redirect";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Hexagon,
  Lock,
  Mail,
} from "@/lib/icons";

type LoginFormProps = {
  companyLabel: string;
  productLabel?: string;
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
      return "No account found for this email in the current database.";
    case "AUTH_PASSWORD_NOT_SET":
      return "This account has no password set. Reset the password and try again.";
    case "AUTH_PASSWORD_MISMATCH":
      return "Password mismatch for this account.";
    case "AUTH_RATE_LIMITED":
      return "Too many sign-in attempts. Please wait a few minutes and try again.";
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

export function LoginForm({
  companyLabel,
  productLabel,
  callbackUrl,
  rememberMeEnabled = true,
}: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const resolvedCallbackUrl = normalizeCallbackUrl(callbackUrl, "/");

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
    <div className="min-h-svh grid grid-cols-1 md:grid-cols-[520px_1fr] bg-[var(--surface-canvas)]">
      <aside className="relative hidden md:flex flex-col overflow-hidden bg-[var(--primary)] px-11 py-12 text-white">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 20%, rgba(255,255,255,0.18), transparent 40%), radial-gradient(circle at 82% 78%, rgba(8,55,156,0.45), transparent 50%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            maskImage:
              "radial-gradient(ellipse 110% 70% at 50% 30%, black, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 110% 70% at 50% 30%, black, transparent 80%)",
          }}
        />
        <div className="relative flex h-full flex-col">
          <span className="inline-flex items-center gap-3 text-[22px] font-semibold tracking-tight text-white">
            <Hexagon className="size-[22px] text-white" weight="fill" />
            Huchu
          </span>
          <h2 className="mt-auto mb-6 max-w-[16ch] text-[44px] font-semibold leading-[1.05] tracking-tight text-balance text-white">
            The operating layer for the companies that actually move things.
          </h2>
          <p className="mb-8 max-w-[38ch] text-base leading-relaxed text-white/75">
            One ledger. One workflow. One audit trail across every site, every
            shift, every reconciliation.
          </p>
          <div className="flex items-center gap-4 text-xs text-white/60">
            <span>SOC 2 Type II</span>
            <span className="size-1.5 rounded-full bg-white/40" aria-hidden />
            <span>ISO 27001</span>
            <span className="size-1.5 rounded-full bg-white/40" aria-hidden />
            <span>POPIA-ready</span>
          </div>
        </div>
      </aside>

      <main className="flex flex-col px-6 py-10 md:px-14 md:py-12">
        <div className="hidden md:flex items-center justify-between text-sm text-[var(--text-muted)]">
          <span>
            Need help?{" "}
            <a
              href="#"
              data-stub
              className="font-medium text-[var(--primary-700)] hover:underline"
            >
              Contact support
            </a>
          </span>
          <span>
            No account?{" "}
            <a
              href="#"
              data-stub
              className="font-medium text-[var(--primary-700)] hover:underline"
            >
              Request a workspace
            </a>
          </span>
        </div>

        <div className="my-auto w-full max-w-[380px] pt-10 md:pt-0">
          <div className="md:hidden mb-8 flex items-center gap-3 text-[18px] font-semibold tracking-tight text-[var(--text-strong)]">
            <span className="grid size-9 place-items-center rounded-md bg-[var(--primary)] text-white">
              <Hexagon className="size-5" weight="fill" />
            </span>
            Huchu
          </div>

          <h1 className="text-[30px] font-semibold tracking-tight leading-tight text-[var(--text-strong)]">
            Sign in to {productLabel ?? companyLabel}
          </h1>
          <p className="mt-2 mb-8 text-sm text-[var(--text-muted)]">
            Welcome back. Pick up where you left off.
          </p>

          {error ? (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3"
            >
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled
              title="Coming soon"
              aria-label="Sign in with Google (coming soon)"
              className="h-10 gap-1.5 px-2 text-[13px] font-medium"
            >
              <span className="font-bold text-[#4285F4]">G</span>
              Google
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled
              title="Coming soon"
              aria-label="Sign in with Microsoft (coming soon)"
              className="h-10 gap-1.5 px-2 text-[13px] font-medium"
            >
              <span
                aria-hidden
                className="inline-grid grid-cols-2 gap-[1px]"
                style={{ width: 12, height: 12 }}
              >
                <span style={{ background: "#F25022" }} />
                <span style={{ background: "#7FBA00" }} />
                <span style={{ background: "#00A4EF" }} />
                <span style={{ background: "#FFB900" }} />
              </span>
              Microsoft
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled
              title="Coming soon"
              aria-label="Sign in with SAML SSO (coming soon)"
              className="h-10 gap-1.5 px-2 text-[13px] font-medium"
            >
              <Lock className="size-3.5" />
              SAML SSO
            </Button>
          </div>

          <div className="my-4 flex items-center gap-3 text-xs text-[var(--text-subtle)]">
            <span className="h-px flex-1 bg-[var(--border-default)]" />
            or with email
            <span className="h-px flex-1 bg-[var(--border-default)]" />
          </div>

          <form onSubmit={handleSubmit} className="grid gap-3.5">
            <div className="grid gap-1.5">
              <label
                htmlFor="login-email"
                className="text-[13px] font-medium text-[var(--text-strong)]"
              >
                Work email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-subtle)]" />
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder={`you@${companyLabel
                    .toLowerCase()
                    .replace(/\s+/g, "")}.com`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="h-10 pl-10"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-baseline justify-between">
                <label
                  htmlFor="login-password"
                  className="text-[13px] font-medium text-[var(--text-strong)]"
                >
                  Password
                </label>
                <a
                  href="#"
                  data-stub
                  className="text-xs font-medium text-[var(--primary-700)] hover:underline"
                >
                  Forgot?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-subtle)]" />
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="h-10 pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--text-subtle)] hover:text-[var(--text-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            {rememberMeEnabled ? (
              <label
                htmlFor="login-remember"
                className="mt-1 flex items-center gap-2 text-sm text-[var(--text-body)] cursor-pointer"
              >
                <Checkbox
                  id="login-remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) =>
                    setRememberMe(checked === true)
                  }
                  disabled={loading}
                />
                <span>Keep me signed in on this device</span>
              </label>
            ) : null}

            <Button
              type="submit"
              size="lg"
              className="mt-3 h-11 w-full text-[15px]"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
            By continuing you agree to the{" "}
            <a
              href="#"
              data-stub
              className="font-medium text-[var(--primary-700)] hover:underline"
            >
              Terms
            </a>{" "}
            and{" "}
            <a
              href="#"
              data-stub
              className="font-medium text-[var(--primary-700)] hover:underline"
            >
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </main>
    </div>
  );
}

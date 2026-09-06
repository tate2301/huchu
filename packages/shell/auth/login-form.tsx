"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Input, Button } from '@corelithzw/react';

import { normalizeCallbackUrl } from "@corelithzw/platform/auth-core/redirects";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Hexagon,
  Lock,
  Mail,
} from "@corelithzw/ui/lib/icons";
import { Checkbox } from "@corelithzw/ui/components/checkbox";

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
    <div className="h-dvh bg-[var(--surface-canvas)]">

      <main className="flex flex-col px-6 py-10 md:px-14 md:py-12 h-full">
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

        <div className="mx-auto w-full flex items-center justify-center max-w-[380px] pt-10 md:pt-0 flex-1">

          <div className="my-auto gap-(--space-4)">

            <h1 className="text-xl font-semibold tracking-tight leading-tight text-[var(--text-strong)]">
              Sign in
            </h1>
            <p className="mt-2 mb-8 text-sm text-[var(--text-muted)]">
              Welcome back to {productLabel ?? companyLabel}
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

            <form onSubmit={handleSubmit} className="grid gap-3.5">
              <div className="grid gap-1.5">
                <label
                  htmlFor="login-email"
                  className="text-[13px] font-medium text-[var(--text-strong)]"
                >
                  Work email
                </label>
                <div className="relative">

                  <Input
                    id="login-email"
                    leadingIcon={<Mail className="size-4" />}
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

                  <Input
                    leadingIcon={<Lock className="size-4" />}
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
                variant={"primary"}
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
        </div>
      </main>
    </div>
  );
}

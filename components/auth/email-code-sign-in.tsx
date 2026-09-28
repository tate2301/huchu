"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, InputOTP } from "@corelithzw/react";

const RESEND_AFTER_SECONDS = 30;

function describeCodeError(raw: string | undefined): string {
  switch (raw) {
    case "CODE_EXPIRED":
      return "That code has expired. Send a new one.";
    case "CODE_LOCKED":
      return "Too many wrong tries for that code. Send a new one.";
    case "AUTH_RATE_LIMITED":
      return "Too many sign-in attempts. Wait a few minutes and try again.";
    case "TENANT_HOST_REQUIRED":
      return "Use your workspace's own address to sign in.";
    case "TENANT_INACTIVE":
      return "This workspace is inactive. Contact your administrator.";
    default:
      return "That code did not match. Check the newest email, or send a new code.";
  }
}

/**
 * Sign in with a six-digit code sent to your email: the only way in for
 * somebody who signed up without a password, and a way in for anyone who has
 * forgotten theirs.
 *
 * The send step says the same thing whether or not the address has an account
 * here, because the server does.
 */
export function EmailCodeSignIn({
  callbackUrl,
  rememberMeEnabled,
}: {
  callbackUrl: string;
  rememberMeEnabled: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  async function sendCode() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/email-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) {
        setError(
          body.reason === "INVALID_EMAIL"
            ? "Enter the email address you use for this workspace."
            : describeCodeError(body.reason === "RATE_LIMITED" ? "AUTH_RATE_LIMITED" : body.reason),
        );
        return;
      }
      setCode("");
      setStep("code");
      setResendIn(RESEND_AFTER_SECONDS);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(value: string) {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const result = await signIn("email-code", {
        email: email.trim(),
        code: value,
        rememberMe: rememberMeEnabled ? "true" : "false",
        callbackUrl,
        redirect: false,
      });
      if (result?.error) {
        setCode("");
        setError(describeCodeError(result.error));
        return;
      }
      router.push(result?.url ?? callbackUrl);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (step === "email") {
    return (
      <form
        className="grid gap-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          void sendCode();
        }}
      >
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Input
          id="login-code-email"
          label="Work email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          disabled={busy}
        />
        <Button type="submit" variant="primary" block loading={busy} className="mt-2">
          Email me a code
        </Button>
      </form>
    );
  }

  return (
    <form
      className="grid gap-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (code.length === 6) void submitCode(code);
        else setError("Enter all six digits from the email.");
      }}
    >
      <p className="text-[var(--text-muted)] [font:var(--type-body-sm)]">
        If {email.trim()} has an account here, a six-digit code is on its way.
      </p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <InputOTP
        length={6}
        value={code}
        onValueChange={setCode}
        onComplete={(value) => void submitCode(value)}
        disabled={busy}
        aria-label="Six-digit code"
      />
      <Button type="submit" variant="primary" block loading={busy} className="mt-2">
        Sign in
      </Button>
      <div className="flex items-center justify-between text-[var(--text-muted)] [font:var(--type-caption)]">
        <button type="button" className="underline" onClick={() => setStep("email")}>
          Use another email
        </button>
        {resendIn > 0 ? (
          <span className="tabular-nums">Send a new code in 0:{String(resendIn).padStart(2, "0")}</span>
        ) : (
          <button type="button" className="underline" onClick={() => void sendCode()}>
            Send a new code
          </button>
        )}
      </div>
    </form>
  );
}

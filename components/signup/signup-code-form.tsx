"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, InputOTP } from "@corelithzw/react";

import { describeSignupRefusal } from "@/components/signup/signup-errors";

const RESEND_AFTER_SECONDS = 30;

export function SignupCodeForm({ productSlug }: { productSlug: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checking, setChecking] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_AFTER_SECONDS);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  async function verify(value: string) {
    if (checking) return;
    setError("");
    setNotice("");
    setChecking(true);
    try {
      const response = await fetch("/api/signup/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.ok) {
        router.push(`/signup/${productSlug}/workspace`);
        return;
      }
      if (body.reason === "NOT_FOUND") {
        router.push(`/signup/${productSlug}`);
        return;
      }
      setCode("");
      setError(describeSignupRefusal(body.reason, body.retryAfterSeconds));
    } catch {
      setError(describeSignupRefusal(undefined));
    } finally {
      setChecking(false);
    }
  }

  async function resend() {
    setError("");
    setNotice("");
    const response = await fetch("/api/signup/resend", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.ok) {
      setCode("");
      setNotice("A new code is on its way. The old one no longer works.");
      setResendIn(RESEND_AFTER_SECONDS);
      return;
    }
    if (body.reason === "ALREADY_VERIFIED") {
      router.push(`/signup/${productSlug}/workspace`);
      return;
    }
    setError(describeSignupRefusal(body.reason, body.retryAfterSeconds));
    if (body.retryAfterSeconds) setResendIn(body.retryAfterSeconds);
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (code.length === 6) void verify(code);
        else setError("Enter all six digits from the email.");
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="info">{notice}</Alert> : null}
      <InputOTP
        length={6}
        value={code}
        onValueChange={setCode}
        onComplete={(value) => void verify(value)}
        disabled={checking}
        aria-label="Six-digit code"
      />
      <Button type="submit" variant="primary" block loading={checking}>
        Continue
      </Button>
      {resendIn > 0 ? (
        <p className="text-[var(--text-muted)] [font:var(--type-caption)]">
          Send a new code in <span className="tabular-nums">0:{String(resendIn).padStart(2, "0")}</span>
        </p>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => void resend()} className="self-start">
          Send a new code
        </Button>
      )}
    </form>
  );
}

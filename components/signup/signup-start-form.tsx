"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input } from "@corelithzw/react";

import { describeSignupRefusal } from "@/components/signup/signup-errors";

const UTM_PARAMS: Record<string, string> = {
  utm_source: "utmSource",
  utm_medium: "utmMedium",
  utm_campaign: "utmCampaign",
  utm_term: "utmTerm",
  utm_content: "utmContent",
};

/** Where this visitor came from: the landing page's UTM tags and the referrer. */
function readAttribution(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  const attribution: Record<string, string> = {};
  for (const [param, key] of Object.entries(UTM_PARAMS)) {
    const value = params.get(param);
    if (value) attribution[key] = value;
  }
  if (document.referrer) attribution.referrer = document.referrer;
  attribution.landingPath = window.location.pathname;
  return attribution;
}

export function SignupStartForm({ productSlug }: { productSlug: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/signup/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: productSlug, name, email, attribution: readAttribution() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) {
        setError(describeSignupRefusal(body.reason, body.retryAfterSeconds));
        return;
      }
      router.push(`/signup/${productSlug}/verify`);
    } catch {
      setError(describeSignupRefusal(undefined));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Input
        id="signup-name"
        label="Your name"
        autoComplete="name"
        placeholder="Tendai Moyo"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        disabled={submitting}
      />
      <Input
        id="signup-email"
        label="Work email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@company.co.zw"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        disabled={submitting}
      />
      <Button type="submit" variant="primary" block loading={submitting}>
        Continue
      </Button>
    </form>
  );
}

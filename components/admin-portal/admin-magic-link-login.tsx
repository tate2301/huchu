"use client";

import { useState } from "react";
import { AlertCircle, ArrowRight, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeCallbackUrl } from "@/lib/auth-redirect";

export function AdminMagicLinkLogin({
  callbackUrl,
}: {
  callbackUrl?: string;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const resolvedCallbackUrl = normalizeCallbackUrl(callbackUrl, "/admin/dashboard");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/platform-admin/login-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ callbackUrl: resolvedCallbackUrl, email }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(
          payload.error === "AUTH_RATE_LIMITED"
            ? "Too many requests. Try again in a few minutes."
            : payload.error || "Unable to send sign-in link.",
        );
        return;
      }

      setSent(true);
    } catch {
      setError("Unable to send sign-in link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <Card className="w-full bg-[var(--surface-base)] shadow-none">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-2xl">Admin sign in</CardTitle>
            <p className="text-sm text-[var(--text-muted)]">Email magic link.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {sent ? (
              <div className="rounded-xl bg-[var(--surface-muted)] px-3 py-3">
                <div className="flex items-start gap-2.5">
                  <MailCheck className="mt-0.5 h-4 w-4 text-[var(--action-primary-bg)]" />
                  <div>
                    <p className="text-sm font-medium text-[var(--text-strong)]">Link sent</p>
                    <p className="text-sm text-[var(--text-muted)]">{email}</p>
                  </div>
                </div>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={submit}>
                <div className="space-y-2">
                  <Label htmlFor="admin-email">Email</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@company.com"
                    className="h-10 rounded-xl border-none bg-[var(--surface-muted)] shadow-none"
                    autoComplete="email"
                    required
                  />
                </div>

                {error ? (
                  <div className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>{error}</p>
                  </div>
                ) : null}

                <Button className="h-10 w-full justify-between rounded-xl px-3 shadow-none" disabled={loading}>
                  <span>{loading ? "Sending..." : "Send magic link"}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

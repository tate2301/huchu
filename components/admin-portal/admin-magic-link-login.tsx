"use client";

import { useState } from "react";
import { AlertCircle, ArrowRight, MailCheck, Shield, TimerReset } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { normalizeCallbackUrl } from "@/lib/auth-redirect";

export function AdminMagicLinkLogin({
  callbackUrl,
}: {
  callbackUrl?: string;
}) {
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
        body: JSON.stringify({ callbackUrl: resolvedCallbackUrl }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(
          payload.error === "AUTH_RATE_LIMITED"
            ? "Too many sign-in link requests. Please wait a few minutes and try again."
            : payload.error || "Unable to send secure sign-in link.",
        );
        return;
      }
      setSent(true);
    } catch {
      setError("Unable to send secure sign-in link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#ffffff_0%,#fcfcf4_46%,#f4f5ef_100%)] px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl gap-8 lg:grid-cols-[minmax(0,1.1fr)_28rem] lg:items-center">
        <section className="space-y-8 rounded-[2rem] border border-[var(--border)] bg-[rgba(255,255,255,0.72)] p-6 shadow-[var(--elevation-3)] backdrop-blur md:p-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] text-[var(--action-primary-bg)]">
            <Shield className="h-7 w-7" />
          </div>
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Pagka Control Plane
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-[var(--text-strong)] [text-wrap:balance]">
              Production operations access for platform administrators.
            </h1>
            <p className="max-w-2xl text-base text-[var(--text-muted)] [text-wrap:pretty]">
              Use a secure email link to enter the admin control plane. Identity, support access, commercial controls,
              and reliability actions stay scoped, audited, and time-bound.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] p-4">
              <p className="text-sm font-semibold text-[var(--text-strong)]">Restricted surface</p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">Only authorized operators can request access from the admin host.</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] p-4">
              <p className="text-sm font-semibold text-[var(--text-strong)]">Single-use entry</p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">Magic links expire quickly and are issued for the current control-plane session.</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] p-4">
              <p className="text-sm font-semibold text-[var(--text-strong)]">Audited actions</p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">Sign-in and support activity remain visible to the platform audit trail.</p>
            </div>
          </div>
        </section>

        <Card className="border-[var(--border)] bg-[var(--surface-base)] shadow-[var(--elevation-3)]">
          <CardHeader className="space-y-3 pb-4">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Secure sign-in
            </div>
            <CardTitle className="text-2xl">Admin login</CardTitle>
            <CardDescription>
              Request a secure sign-in link for the authorized admin inbox configured for this environment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sent ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <div className="flex items-start gap-3">
                    <MailCheck className="mt-0.5 h-5 w-5 text-[var(--action-primary-bg)]" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[var(--text-strong)]">Secure link sent</p>
                      <p className="text-sm text-[var(--text-muted)]">
                        Check the authorized admin inbox and continue from the emailed link on this host.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] p-4 text-sm text-[var(--text-muted)]">
                  If you do not receive the email shortly, wait a few minutes before requesting another link.
                </div>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={submit}>
                {error ? (
                  <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p>{error}</p>
                  </div>
                ) : null}
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--text-muted)]">
                  <div className="flex items-start gap-3">
                    <TimerReset className="mt-0.5 h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                    <div className="space-y-1">
                      <p className="font-medium text-[var(--text-strong)]">Email link delivery is handled server-side.</p>
                      <p>No mailbox details are shown in the browser or entered manually on this page.</p>
                    </div>
                  </div>
                </div>
                <Button className="h-11 w-full justify-between rounded-xl px-4" disabled={loading}>
                  <span>{loading ? "Sending secure link..." : "Send secure sign-in link"}</span>
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

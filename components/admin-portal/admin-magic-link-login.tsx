"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function AdminMagicLinkLogin({ adminEmail }: { adminEmail: string }) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await signIn("email", {
        email: adminEmail.trim().toLowerCase(),
        callbackUrl: "/admin/dashboard",
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
        return;
      }
      setSent(true);
    } catch {
      setError("Unable to send magic link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] p-4">
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Superuser Portal</CardTitle>
            <CardDescription>Request a magic link for the configured superuser mailbox.</CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <p className="rounded-md border p-3 text-sm">Magic link sent to <span className="font-mono">{adminEmail}</span>.</p>
            ) : (
              <form className="space-y-4" onSubmit={submit}>
                {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{error}</p> : null}
                <div className="rounded-md border bg-[var(--surface-muted)] p-3 text-sm">
                  <p className="text-[var(--text-muted)]">Signing in as:</p>
                  <p className="font-mono">{adminEmail}</p>
                </div>
                <Button className="w-full" disabled={loading}>{loading ? "Sending..." : "Send magic link"}</Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
